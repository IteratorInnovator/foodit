package config

import (
	"fmt"
	"os"

	_ "github.com/joho/godotenv/autoload"
)

type Config struct {
	ServerPort         string
	CassandraHosts     string
	CassandraPort      int
	CassandraKeyspace  string
	AWSRegion          string
	AWSAccessKeyID     string
	AWSSecretAccessKey string
	RedisAddr          string
	RedisPassword      string
	RedisDB            int
}

func Load() (*Config, error) {
	return &Config{
		ServerPort:         getEnv("SERVER_PORT", "8080"),
		CassandraHosts:     getEnv("CASSANDRA_HOSTS", "cassandra.ap-southeast-1.amazonaws.com"),
		CassandraPort:      getEnvInt("CASSANDRA_PORT", 9142),
		CassandraKeyspace:  getEnv("CASSANDRA_KEYSPACE", "chat_service"),
		AWSRegion:          getEnv("AWS_REGION", "ap-southeast-1"),
		AWSAccessKeyID:     getEnv("AWS_ACCESS_KEY_ID", ""),
		AWSSecretAccessKey: getEnv("AWS_SECRET_ACCESS_KEY", ""),
		RedisAddr:          getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPassword:      getEnv("REDIS_PASSWORD", ""),
		RedisDB:            getEnvInt("REDIS_DB", 0),
	}, nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		var result int
		if _, err := fmt.Sscanf(value, "%d", &result); err == nil {
			return result
		}
	}
	return defaultValue
}
