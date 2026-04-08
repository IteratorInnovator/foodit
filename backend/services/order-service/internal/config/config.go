package config

import "os"

type Config struct {
	Port            string
	AWSRegion       string
	OrdersTableName string
}

func Load() *Config {
	return &Config{
		Port:            getEnv("PORT", "8080"),
		AWSRegion:       getEnv("AWS_REGION", "ap-southeast-1"),
		OrdersTableName: getEnv("ORDERS_TABLE_NAME", "orders"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
