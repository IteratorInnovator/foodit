package models

type OrderStatus string

const (
	StatusPending   OrderStatus = "PENDING"
	StatusAccepted  OrderStatus = "ACCEPTED"
	StatusCompleted OrderStatus = "COMPLETED"
	StatusCancelled OrderStatus = "CANCELLED"
	StatusMIA       OrderStatus = "MIA"
)

type OrderItem struct {
	MenuItemID string `dynamodbav:"menu_item_id" json:"menu_item_id"`
	Name       string `dynamodbav:"name" json:"name"`
	Quantity   int    `dynamodbav:"quantity" json:"quantity"`
	UnitPrice  int64  `dynamodbav:"unit_price" json:"unit_price"`
}

type DropOff struct {
	Lat     float64 `dynamodbav:"lat" json:"lat"`
	Lng     float64 `dynamodbav:"lng" json:"lng"`
	Address string  `dynamodbav:"address" json:"address"`
}

// Order matches the DynamoDB Orders_Table schema.
type Order struct {
	OrderID          string      `dynamodbav:"order_id" json:"order_id"`
	BuyerID          string      `dynamodbav:"buyer_id" json:"buyer_id"`
	RunnerID         string      `dynamodbav:"runner_id,omitempty" json:"runner_id"`
	Status           OrderStatus `dynamodbav:"status" json:"status"`
	MenuStoreID      string      `dynamodbav:"menu_store_id" json:"menu_store_id"`
	Items            []OrderItem `dynamodbav:"items" json:"items"`
	Description      string      `dynamodbav:"description,omitempty" json:"description,omitempty"`
	FoodCost         int64       `dynamodbav:"food_cost" json:"food_cost"`
	DeliveryFee      int64       `dynamodbav:"delivery_fee" json:"delivery_fee"`
	PlatformFee      int64       `dynamodbav:"platform_fee" json:"platform_fee"`
	DropOff          DropOff     `dynamodbav:"drop_off" json:"drop_off"`
	CreatedAt        string      `dynamodbav:"created_at" json:"created_at"`
	PaymentIntentID  string      `dynamodbav:"payment_intent_id,omitempty" json:"payment_intent_id"`
}
