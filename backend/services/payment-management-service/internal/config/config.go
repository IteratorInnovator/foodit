package config

import (
	"os"
	"strings"

	"github.com/joho/godotenv"
)

// MSK authentication mechanisms
const (
	MSKAuthNone  = "none"
	MSKAuthIAM   = "iam"
	MSKAuthSCRAM = "scram"
)

// Config holds all configuration values for the service
type Config struct {
	// Kafka settings
	KafkaBrokers []string
	KafkaGroupID string

	// MSK authentication settings
	MSKAuthMechanism string // "none", "iam", or "scram"
	MSKRegion        string // AWS region for IAM auth
	MSKUsername      string // SCRAM username
	MSKPassword      string // SCRAM password

	// Service URLs
	UserServiceURL    string
	PaymentServiceURL string
}

// Load reads configuration from environment variables
func Load() *Config {
	// Load .env file if it exists (ignore error if not found)
	_ = godotenv.Load()

	// Parse comma-separated broker list
	brokers := strings.Split(os.Getenv("KAFKA_BROKERS"), ",")
	for i := range brokers {
		brokers[i] = strings.TrimSpace(brokers[i])
	}

	return &Config{
		KafkaBrokers:      brokers,
		KafkaGroupID:      getEnvOrDefault("KAFKA_GROUP_ID", "payment-management-group"),
		MSKAuthMechanism:  os.Getenv("MSK_AUTH_MECHANISM"),
		MSKRegion:         os.Getenv("AWS_REGION"),
		MSKUsername:       os.Getenv("MSK_USERNAME"),
		MSKPassword:       os.Getenv("MSK_PASSWORD"),
		UserServiceURL:    os.Getenv("USER_SERVICE_URL"),
		PaymentServiceURL: os.Getenv("PAYMENT_SERVICE_URL"),
	}
}

// getEnvOrDefault returns the environment variable value or a default if not set
func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
