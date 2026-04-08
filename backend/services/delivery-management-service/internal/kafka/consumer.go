package kafka

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sasl"
	faws "github.com/twmb/franz-go/pkg/sasl/aws"
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

// MessageHandler is the function signature for topic message handlers.
// Handlers receive the topic name and raw message value.
type MessageHandler func(ctx context.Context, topic string, value []byte)

// Consumer wraps a franz-go client for consuming messages from multiple topics.
type Consumer struct {
	client   *kgo.Client
	handlers map[string]MessageHandler
}

// NewConsumer creates a new Kafka consumer that subscribes to the given topics
// and dispatches messages to the registered handlers.
func NewConsumer(brokers []string, groupID string, topics []string, mskConfig MSKConfig, handlers map[string]MessageHandler) (*Consumer, error) {
	opts := []kgo.Opt{
		kgo.SeedBrokers(brokers...),
		kgo.ConsumerGroup(groupID),
		kgo.ConsumeTopics(topics...),
		kgo.ConsumeResetOffset(kgo.NewOffset().AtStart()),
		kgo.WithLogger(kgo.BasicLogger(os.Stderr, kgo.LogLevelInfo, nil)),
	}

	saslMech, tlsCfg, err := buildAuthOpts(mskConfig)
	if err != nil {
		return nil, err
	}
	if saslMech != nil {
		opts = append(opts, kgo.SASL(saslMech))
	}
	if tlsCfg != nil {
		opts = append(opts, kgo.DialTLSConfig(tlsCfg))
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

// buildAuthOpts returns the SASL mechanism and TLS config based on the MSK auth mode.
func buildAuthOpts(mskConfig MSKConfig) (sasl.Mechanism, *tls.Config, error) {
	tlsCfg := &tls.Config{MinVersion: tls.VersionTLS12}

	switch mskConfig.AuthMechanism {
	case MSKAuthIAM:
		// AWS IAM authentication for MSK Serverless.
		// Load the default AWS credential chain, which picks up IRSA
		// credentials via AWS_ROLE_ARN and AWS_WEB_IDENTITY_TOKEN_FILE
		// automatically on EKS.
		awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(),
			awsconfig.WithRegion(mskConfig.Region),
		)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to load AWS config: %w", err)
		}

		mechanism := faws.ManagedStreamingIAM(func(ctx context.Context) (faws.Auth, error) {
			creds, err := awsCfg.Credentials.Retrieve(ctx)
			if err != nil {
				return faws.Auth{}, fmt.Errorf("failed to retrieve AWS credentials: %w", err)
			}
			return faws.Auth{
				AccessKey:    creds.AccessKeyID,
				SecretKey:    creds.SecretAccessKey,
				SessionToken: creds.SessionToken,
			}, nil
		})
		slog.Info("configured MSK with IAM authentication", "region", mskConfig.Region)
		return mechanism, tlsCfg, nil

	case MSKAuthSCRAM:
		// SASL/SCRAM authentication
		mechanism := scram.Auth{
			User: mskConfig.Username,
			Pass: mskConfig.Password,
		}.AsSha512Mechanism()
		slog.Info("configured MSK with SASL/SCRAM authentication")
		return mechanism, tlsCfg, nil

	default:
		// No authentication (local development)
		slog.Info("configured Kafka without authentication (local mode)")
		return nil, nil, nil
	}
}

// Start begins polling Kafka and dispatching messages to handlers.
// It blocks until the context is cancelled.
func (c *Consumer) Start(ctx context.Context) {
	slog.Info("starting kafka consumer", "topics", topicKeys(c.handlers))

	for {
		fetches := c.client.PollFetches(ctx)
		if ctx.Err() != nil {
			slog.Info("shutting down kafka consumer")
			return
		}

		fetchErrors := fetches.Errors()
		for _, fe := range fetchErrors {
			slog.Error("fetch error",
				"topic", fe.Topic,
				"partition", fe.Partition,
				"error", fe.Err.Error(),
			)
		}

		fetches.EachRecord(func(record *kgo.Record) {
			// Extract event_type from message JSON to dispatch to correct handler
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

// Close shuts down the Kafka client.
func (c *Consumer) Close() {
	c.client.Close()
}

// topicKeys returns the map keys as a slice (for logging).
func topicKeys(m map[string]MessageHandler) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}
