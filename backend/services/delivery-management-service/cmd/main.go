package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"gitlab.com/esd-g6-team1-tanzu/foodit-delivery-management-service/internal/clients"
	"gitlab.com/esd-g6-team1-tanzu/foodit-delivery-management-service/internal/config"
	"gitlab.com/esd-g6-team1-tanzu/foodit-delivery-management-service/internal/kafka"
)

func main() {
	// Initialize structured logger
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	slog.Info("starting delivery management service")

	// Load configuration
	cfg := config.Load()

	// Initialize HTTP clients
	chatClient := clients.NewChatClient(cfg.ChatServiceURL)
	locationClient := clients.NewLocationClient(cfg.LocationServiceURL)

	// Initialize handlers
	handlers := kafka.NewHandlers(chatClient, locationClient)

	// Configure MSK authentication
	mskConfig := kafka.MSKConfig{
		AuthMechanism: cfg.MSKAuthMechanism,
		Region:        cfg.MSKRegion,
		Username:      cfg.MSKUsername,
		Password:      cfg.MSKPassword,
	}

	// Register event handlers (keyed by event_type, not topic)
	topicHandlers := map[string]kafka.MessageHandler{
		kafka.EventOrderAccepted:  handlers.HandleOrderAccepted,
		kafka.EventOrderCompleted: handlers.HandleOrderCompleted,
		kafka.EventOrderMia:       handlers.HandleOrderMia,
	}

	topics := []string{kafka.TopicOrders}

	// Create context with cancellation for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Set up signal handling for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// Create a single consumer for all topics
	consumer, err := kafka.NewConsumer(cfg.KafkaBrokers, cfg.KafkaGroupID, topics, mskConfig, topicHandlers)
	if err != nil {
		slog.Error("failed to create consumer", "error", err.Error())
		os.Exit(1)
	}

	// Start consumer in a goroutine
	done := make(chan struct{})
	go func() {
		defer close(done)
		consumer.Start(ctx)
	}()

	slog.Info("kafka consumer started",
		"topics", topics,
		"brokers", cfg.KafkaBrokers,
		"group_id", cfg.KafkaGroupID,
		"auth_mechanism", cfg.MSKAuthMechanism,
	)

	// Wait for shutdown signal
	sig := <-sigChan
	slog.Info("received shutdown signal", "signal", sig.String())

	// Cancel context to stop the consumer
	cancel()

	// Wait for consumer to finish
	<-done

	// Close the consumer
	consumer.Close()

	slog.Info("delivery management service stopped")
}
