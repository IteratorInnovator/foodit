package kafka

// Topic for all order events
const TopicOrders = "orders"

// Event type constants (from event_type field in message JSON)
const (
	EventOrderAccepted  = "order.accepted"
	EventOrderCompleted = "order.completed"
	EventOrderMia       = "order.mia"
)
