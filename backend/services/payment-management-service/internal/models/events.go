package models

// OrderCompletedEvent represents the payload for order.completed Kafka event
type OrderCompletedEvent struct {
	EventType       string  `json:"event_type"`
	OrderID         string  `json:"order_id"`
	BuyerID         string  `json:"buyer_id"`
	RunnerID        string  `json:"runner_id"`
	Amount          float64 `json:"amount"`
	PaymentIntentID string  `json:"payment_intent_id"`
	Timestamp       string  `json:"timestamp"`
}

// OrderMiaEvent represents the payload for order.mia Kafka event
type OrderMiaEvent struct {
	EventType       string  `json:"event_type"`
	OrderID         string  `json:"order_id"`
	BuyerID         string  `json:"buyer_id"`
	RunnerID        string  `json:"runner_id"`
	PaymentIntentID string  `json:"payment_intent_id"`
	Timestamp       string  `json:"timestamp"`
}

// StripeConnectResponse represents the response from user service for stripe connect ID
type StripeConnectResponse struct {
	StripeConnectID string `json:"stripe_connect_id"`
}

// StripeCustomerResponse represents the response from user service for stripe customer ID
type StripeCustomerResponse struct {
	StripeCustomerID string `json:"stripe_customer_id"`
}

// TransferRequest represents the request body for creating a transfer
type TransferRequest struct {
	UserID               string            `json:"user_id"`
	DestinationAccountID string            `json:"destination_account_id"`
	Amount               float64           `json:"amount"`
	PaymentIntentID      string            `json:"payment_intent_id,omitempty"`
	Description          string            `json:"description,omitempty"`
	Metadata             map[string]string `json:"metadata,omitempty"`
}

// TransferResponse represents the response from payment service for transfer
type TransferResponse struct {
	TransferID string  `json:"transfer_id"`
	Amount     float64 `json:"amount"`
	Currency   string  `json:"currency"`
}

// RefundRequest represents the request body for creating a refund
type RefundRequest struct {
	UserID          string   `json:"user_id"`
	PaymentIntentID string   `json:"payment_intent_id"`
	Amount          *float64 `json:"amount,omitempty"`
}

// RefundResponse represents the response from payment service for refund
type RefundResponse struct {
	RefundID string  `json:"refund_id"`
	Status   string  `json:"status"`
	Amount   float64 `json:"amount"`
}
