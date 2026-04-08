package main

import (
	"context"
	"fmt"
	"log"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/gofiber/fiber/v3"

	"gitlab.com/esd-g6-team1-tanzu/user-service/config"
	"gitlab.com/esd-g6-team1-tanzu/user-service/handlers"
	"gitlab.com/esd-g6-team1-tanzu/user-service/repository"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Initialize AWS SDK config
	awsOpts := []func(*awsconfig.LoadOptions) error{
		awsconfig.WithRegion(cfg.AWSRegion),
	}

	// Use static credentials if provided in config
	if cfg.HasAWSCredentials() {
		awsOpts = append(awsOpts, awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(
				cfg.AWSAccessKeyID,
				cfg.AWSSecretAccessKey,
				"",
			),
		))
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(), awsOpts...)
	if err != nil {
		log.Fatalf("failed to load AWS config: %v", err)
	}

	// Initialize DynamoDB client
	dynamoClient := dynamodb.NewFromConfig(awsCfg)

	// Initialize repository
	usersRepo := repository.NewUsersRepository(dynamoClient, cfg.DynamoDBTableName)

	// Initialize handlers
	usersHandler := handlers.NewUsersHandler(usersRepo)

	// Create Fiber app
	app := fiber.New(fiber.Config{
		AppName: "users-service",
		ErrorHandler: func(c fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{
				"error": err.Error(),
			})
		},
	})

	// Health check endpoint
	app.Get("/health", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status": "healthy",
		})
	})

	// Register user routes
	usersHandler.RegisterRoutes(app)

	// Start server
	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Starting users-service on port %s", cfg.Port)

	if err := app.Listen(addr); err != nil {
		log.Fatalf("failed to start server: %v", err)
	}
}
