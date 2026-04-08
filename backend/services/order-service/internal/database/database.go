package database

import (
	"context"
	"log"

	"gitlab.com/esd-g6-team1-tanzu/order-service/internal/config"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
)

var Client *dynamodb.Client

func Connect(cfg *config.Config) {
	ctx := context.Background()

	// Use the default credential provider chain. On EKS with IRSA this
	// automatically picks up the web-identity token from the service account;
	// locally it falls back to env vars, shared config, EC2 instance role, etc.
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(cfg.AWSRegion),
	)
	if err != nil {
		log.Fatalf("Failed to load AWS config: %v", err)
	}

	Client = dynamodb.NewFromConfig(awsCfg)

	log.Println("DynamoDB connected successfully")
}
