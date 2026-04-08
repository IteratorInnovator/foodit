package kafka

// Topic for all order events
const TopicOrders = "orders"

// Event type constants
const (
	EventOrderCompleted = "order.completed"
	EventOrderMia       = "order.mia"
)
