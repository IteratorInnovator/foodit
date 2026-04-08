package repository

import (
	"context"
	"errors"

	"gitlab.com/esd-g6-team1-tanzu/order-service/internal/models"

	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

var ErrNotFound = errors.New("order not found")

type OrderRepository struct {
	client    *dynamodb.Client
	tableName string
}

func NewOrderRepository(client *dynamodb.Client, tableName string) *OrderRepository {
	return &OrderRepository{client: client, tableName: tableName}
}

// GetAll scans the entire table and returns all orders.
func (r *OrderRepository) GetAll(ctx context.Context) ([]models.Order, error) {
	result, err := r.client.Scan(ctx, &dynamodb.ScanInput{
		TableName: &r.tableName,
	})
	if err != nil {
		return nil, err
	}

	var orders []models.Order
	if err := attributevalue.UnmarshalListOfMaps(result.Items, &orders); err != nil {
		return nil, err
	}
	return orders, nil
}

// GetByID fetches a single order by its order_id (partition key).
func (r *OrderRepository) GetByID(ctx context.Context, orderID string) (*models.Order, error) {
	result, err := r.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: &r.tableName,
		Key: map[string]types.AttributeValue{
			"order_id": &types.AttributeValueMemberS{Value: orderID},
		},
	})
	if err != nil {
		return nil, err
	}
	if result.Item == nil {
		return nil, ErrNotFound
	}

	var order models.Order
	if err := attributevalue.UnmarshalMap(result.Item, &order); err != nil {
		return nil, err
	}
	return &order, nil
}

// GetByStatus queries orders by status using the GSI.
func (r *OrderRepository) GetByStatus(ctx context.Context, status models.OrderStatus) ([]models.Order, error) {
	indexName := "status-created_at-index"
	result, err := r.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              &r.tableName,
		IndexName:              &indexName,
		KeyConditionExpression: strPtr("#s = :status"),
		ExpressionAttributeNames: map[string]string{
			"#s": "status",
		},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":status": &types.AttributeValueMemberS{Value: string(status)},
		},
		ScanIndexForward: boolPtr(false), // newest first
	})
	if err != nil {
		return nil, err
	}

	var orders []models.Order
	if err := attributevalue.UnmarshalListOfMaps(result.Items, &orders); err != nil {
		return nil, err
	}
	return orders, nil
}

// Create inserts a new order into the table.
func (r *OrderRepository) Create(ctx context.Context, order *models.Order) error {
	item, err := attributevalue.MarshalMap(order)
	if err != nil {
		return err
	}
	_, err = r.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: &r.tableName,
		Item:      item,
	})
	return err
}

// Update overwrites an existing order in the table.
func (r *OrderRepository) Update(ctx context.Context, order *models.Order) error {
	item, err := attributevalue.MarshalMap(order)
	if err != nil {
		return err
	}
	_, err = r.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: &r.tableName,
		Item:      item,
	})
	return err
}

// Delete removes an order by its order_id.
func (r *OrderRepository) Delete(ctx context.Context, orderID string) error {
	_, err := r.client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: &r.tableName,
		Key: map[string]types.AttributeValue{
			"order_id": &types.AttributeValueMemberS{Value: orderID},
		},
	})
	return err
}

func strPtr(s string) *string   { return &s }
func boolPtr(b bool) *bool      { return &b }
