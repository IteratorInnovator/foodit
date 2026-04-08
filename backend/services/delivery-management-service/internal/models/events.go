package models

// OrderAcceptedEvent represents the payload for order.accepted Kafka event
type OrderAcceptedEvent struct {
	OrderID  string `json:"order_id"`
	BuyerID  string `json:"buyer_id"`
	RunnerID string `json:"runner_id"`
}

// OrderCompletedEvent represents the payload for order.completed Kafka event
type OrderCompletedEvent struct {
	OrderID  string `json:"order_id"`
	BuyerID  string `json:"buyer_id"`
	RunnerID string `json:"runner_id"`
}

// OrderMiaEvent represents the payload for order.mia Kafka event
type OrderMiaEvent struct {
	OrderID  string `json:"order_id"`
	BuyerID  string `json:"buyer_id"`
	RunnerID string `json:"runner_id"`
}

// CreateChatRoomRequest represents the request body for creating a chat room
type CreateChatRoomRequest struct {
	OrderID  string `json:"order_id"`
	BuyerID  string `json:"buyer_id"`
	RunnerID string `json:"runner_id"`
}

// CreateChatRoomResponse represents the response from Chat Service
type CreateChatRoomResponse struct {
	ChatRoomID string `json:"chat_room_id"`
}

// CreateLocationSessionRequest represents the request body for creating a location session
type CreateLocationSessionRequest struct {
	OrderID  string `json:"order_id"`
	BuyerID  string `json:"buyer_id"`
	RunnerID string `json:"runner_id"`
}

// CreateLocationSessionResponse represents the response from Location Service
type CreateLocationSessionResponse struct {
	SessionID string `json:"session_id"`
}
