package config

import (
	"os"
	_ "github.com/joho/godotenv/autoload"
)

// Config holds all configuration for the application.
type Config struct {
	AWSAccessKeyID     string
	AWSSecretAccessKey string
	AWSRegion          string
	DynamoDBTableName  string
	Port               string
}

// Load reads configuration from environment variables.
func Load() *Config {
	return &Config{
		AWSAccessKeyID:     os.Getenv("AWS_ACCESS_KEY_ID"),
		AWSSecretAccessKey: os.Getenv("AWS_SECRET_ACCESS_KEY"),
		AWSRegion:          os.Getenv("AWS_REGION"),
		DynamoDBTableName:  os.Getenv("DYNAMODB_TABLE_NAME"),
		Port:               os.Getenv("PORT"),
	}
}

// HasAWSCredentials returns true if AWS credentials are explicitly configured.
func (c *Config) HasAWSCredentials() bool {
	return c.AWSAccessKeyID != "" && c.AWSSecretAccessKey != ""
}
