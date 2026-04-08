package kafka

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log/slog"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/twmb/franz-go/pkg/kgo"
	kaws "github.com/twmb/franz-go/pkg/sasl/aws"
	"github.com/twmb/franz-go/pkg/sasl/scram"
)

// MSK authentication mechanisms
const (
	MSKAuthNone  = "none"
	MSKAuthIAM   = "iam"
	MSKAuthSCRAM = "scram"
)

// MSKConfig holds MSK-specific configuration
type MSKConfig struct {
	AuthMechanism string
	Region        string
	Username      string
	Password      string
}

// MessageHandler handles a Kafka message, keyed by event_type
type MessageHandler func(ctx context.Context, eventType string, value []byte)

// Consumer wraps a franz-go client for consuming messages
type Consumer struct {
	client   *kgo.Client
	handlers map[string]MessageHandler
}

// NewConsumer creates a new Kafka consumer subscribed to the given topics,
// dispatching by event_type field in the message JSON.
func NewConsumer(brokers []string, groupID string, topics []string, mskConfig MSKConfig, handlers map[string]MessageHandler) (*Consumer, error) {
	opts := []kgo.Opt{
		kgo.SeedBrokers(brokers...),
		kgo.ConsumerGroup(groupID),
		kgo.ConsumeTopics(topics...),
		kgo.ConsumeResetOffset(kgo.NewOffset().AtStart()),
	}

	saslOpt, tlsNeeded, err := buildSASLOpt(mskConfig)
	if err != nil {
		return nil, err
	}
	if saslOpt != nil {
		opts = append(opts, saslOpt)
	}
	if tlsNeeded {
		opts = append(opts, kgo.DialTLSConfig(&tls.Config{
			MinVersion: tls.VersionTLS12,
		}))
	}

	client, err := kgo.NewClient(opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to create kafka client: %w", err)
	}

	return &Consumer{
		client:   client,
		handlers: handlers,
	}, nil
}

// buildSASLOpt returns a kgo.Opt for SASL and whether TLS is needed.
func buildSASLOpt(mskConfig MSKConfig) (kgo.Opt, bool, error) {
	switch mskConfig.AuthMechanism {
	case MSKAuthIAM:
		mechanism := kaws.ManagedStreamingIAM(func(ctx context.Context) (kaws.Auth, error) {
			cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(mskConfig.Region))
			if err != nil {
				return kaws.Auth{}, fmt.Errorf("failed to load AWS config: %w", err)
			}
			creds, err := cfg.Credentials.Retrieve(ctx)
			if err != nil {
				return kaws.Auth{}, fmt.Errorf("failed to retrieve AWS credentials: %w", err)
			}
			return kaws.Auth{
				AccessKey:    creds.AccessKeyID,
				SecretKey:    creds.SecretAccessKey,
				SessionToken: creds.SessionToken,
			}, nil
		})
		slog.Info("configured MSK with IAM authentication", "region", mskConfig.Region)
		return kgo.SASL(mechanism), true, nil

	case MSKAuthSCRAM:
		mechanism := scram.Sha512(func(ctx context.Context) (scram.Auth, error) {
			return scram.Auth{
				User: mskConfig.Username,
				Pass: mskConfig.Password,
			}, nil
		})
		slog.Info("configured MSK with SASL/SCRAM authentication")
		return kgo.SASL(mechanism), true, nil

	default:
		slog.Info("configured Kafka without authentication (local mode)")
		return nil, false, nil
	}
}

// Start begins consuming messages and dispatches by event_type field.
func (c *Consumer) Start(ctx context.Context) {
	slog.Info("starting kafka consumer")

	for {
		fetches := c.client.PollFetches(ctx)
		if ctx.Err() != nil {
			slog.Info("shutting down kafka consumer")
			return
		}

		if errs := fetches.Errors(); len(errs) > 0 {
			for _, e := range errs {
				slog.Error("fetch error",
					"topic", e.Topic,
					"partition", e.Partition,
					"error", e.Err.Error(),
				)
			}
		}

		fetches.EachRecord(func(record *kgo.Record) {
			var envelope struct {
				EventType string `json:"event_type"`
			}
			if err := json.Unmarshal(record.Value, &envelope); err != nil {
				slog.Error("failed to parse event envelope", "error", err.Error())
				return
			}
			handler, ok := c.handlers[envelope.EventType]
			if !ok {
				slog.Warn("no handler for event_type", "event_type", envelope.EventType)
				return
			}
			slog.Info("received event", "event_type", envelope.EventType)
			handler(ctx, envelope.EventType, record.Value)
		})
	}
}

// Close closes the Kafka client
func (c *Consumer) Close() error {
	c.client.Close()
	return nil
}
