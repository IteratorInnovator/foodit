package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"gitlab.com/esd-g6-team1-tanzu/foodit-payment-management-service/internal/clients"
	"gitlab.com/esd-g6-team1-tanzu/foodit-payment-management-service/internal/config"
	"gitlab.com/esd-g6-team1-tanzu/foodit-payment-management-service/internal/kafka"
)

func main() {
	// Initialize structured logger
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	slog.Info("starting payment management service")

	// Load configuration
	cfg := config.Load()

	// Validate required configuration
	if cfg.UserServiceURL == "" {
		slog.Error("USER_SERVICE_URL is required")
		os.Exit(1)
	}
	if cfg.PaymentServiceURL == "" {
		slog.Error("PAYMENT_SERVICE_URL is required")
		os.Exit(1)
	}
	if len(cfg.KafkaBrokers) == 0 || cfg.KafkaBrokers[0] == "" {
		slog.Error("KAFKA_BROKERS is required")
		os.Exit(1)
	}

	// Initialize HTTP clients
	userClient := clients.NewUserClient(cfg.UserServiceURL)
	paymentClient := clients.NewPaymentClient(cfg.PaymentServiceURL)

	// Initialize handlers
	handlers := kafka.NewHandlers(userClient, paymentClient)

	// Configure MSK authentication
	mskConfig := kafka.MSKConfig{
		AuthMechanism: cfg.MSKAuthMechanism,
		Region:        cfg.MSKRegion,
		Username:      cfg.MSKUsername,
		Password:      cfg.MSKPassword,
	}

	// Create context with cancellation for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Set up signal handling for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// Register event handlers (keyed by event_type)
	eventHandlers := map[string]kafka.MessageHandler{
		kafka.EventOrderCompleted: handlers.HandleOrderCompleted,
		kafka.EventOrderMia:       handlers.HandleOrderMia,
	}

	// Create a single consumer for the orders topic
	consumer, err := kafka.NewConsumer(cfg.KafkaBrokers, cfg.KafkaGroupID, []string{kafka.TopicOrders}, mskConfig, eventHandlers)
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

	slog.Info("all kafka consumers started",
		"topics", []string{kafka.TopicOrders},
		"brokers", cfg.KafkaBrokers,
		"group_id", cfg.KafkaGroupID,
		"auth_mechanism", cfg.MSKAuthMechanism,
		"user_service_url", cfg.UserServiceURL,
		"payment_service_url", cfg.PaymentServiceURL,
	)

	// Wait for shutdown signal
	sig := <-sigChan
	slog.Info("received shutdown signal", "signal", sig.String())

	// Cancel context to stop consumer
	cancel()
	<-done
	consumer.Close()

	slog.Info("payment management service stopped")
}
