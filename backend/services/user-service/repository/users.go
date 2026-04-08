package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"gitlab.com/esd-g6-team1-tanzu/user-service/models"
)

// ErrUserNotFound is returned when a user record does not exist in DynamoDB.
var ErrUserNotFound = errors.New("user not found")

// UsersRepository handles DynamoDB operations for user records.
type UsersRepository struct {
	client    *dynamodb.Client
	tableName string
}

// NewUsersRepository creates a new UsersRepository with the given DynamoDB client and table name.
func NewUsersRepository(client *dynamodb.Client, tableName string) *UsersRepository {
	return &UsersRepository{
		client:    client,
		tableName: tableName,
	}
}

// getUser fetches the full user record from DynamoDB by user_id.
func (r *UsersRepository) getUser(ctx context.Context, userID string) (*models.User, error) {
	input := &dynamodb.GetItemInput{
		TableName: aws.String(r.tableName),
		Key: map[string]types.AttributeValue{
			"user_id": &types.AttributeValueMemberS{Value: userID},
		},
	}

	result, err := r.client.GetItem(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("failed to get user from DynamoDB: %w", err)
	}

	if result.Item == nil {
		return nil, ErrUserNotFound
	}

	var user models.User
	if err := attributevalue.UnmarshalMap(result.Item, &user); err != nil {
		return nil, fmt.Errorf("failed to unmarshal user: %w", err)
	}

	return &user, nil
}

// GetUserProfile fetches a user by user_id and returns the public profile (excluding Stripe fields).
func (r *UsersRepository) GetUserProfile(ctx context.Context, userID string) (*models.UserProfile, error) {
	user, err := r.getUser(ctx, userID)
	if err != nil {
		return nil, err
	}

	return user.ToProfile(), nil
}

// GetStripeCustomerID fetches the stripe_customer_id for the given user_id.
// Returns empty string if user exists but field is not set.
// Returns ErrUserNotFound if user record does not exist.
func (r *UsersRepository) GetStripeCustomerID(ctx context.Context, userID string) (string, error) {
	user, err := r.getUser(ctx, userID)
	if err != nil {
		return "", err
	}

	return user.StripeCustomerID, nil
}

// GetStripeConnectID fetches the stripe_connect_id for the given user_id.
// Returns empty string if user exists but field is not set.
// Returns ErrUserNotFound if user record does not exist.
func (r *UsersRepository) GetStripeConnectID(ctx context.Context, userID string) (string, error) {
	user, err := r.getUser(ctx, userID)
	if err != nil {
		return "", err
	}

	return user.StripeConnectID, nil
}
