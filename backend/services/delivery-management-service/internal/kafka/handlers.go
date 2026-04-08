package kafka

import (
	"context"
	"encoding/json"
	"log/slog"

	"gitlab.com/esd-g6-team1-tanzu/foodit-delivery-management-service/internal/clients"
	"gitlab.com/esd-g6-team1-tanzu/foodit-delivery-management-service/internal/models"
)

// Handlers contains all HTTP clients needed for event processing
type Handlers struct {
	chatClient     *clients.ChatClient
	locationClient *clients.LocationClient
}

// NewHandlers creates a new Handlers instance with all required clients
func NewHandlers(chatClient *clients.ChatClient, locationClient *clients.LocationClient) *Handlers {
	return &Handlers{
		chatClient:     chatClient,
		locationClient: locationClient,
	}
}

// HandleOrderAccepted processes order.accepted events
func (h *Handlers) HandleOrderAccepted(ctx context.Context, topic string, value []byte) {
	defer func() {
		if r := recover(); r != nil {
			slog.Error("panic recovered in HandleOrderAccepted",
				"service", "delivery-management",
				"event_type", EventOrderAccepted,
				"error", r,
			)
		}
	}()

	var event models.OrderAcceptedEvent
	if err := json.Unmarshal(value, &event); err != nil {
		slog.Error("failed to unmarshal event",
			"service", "delivery-management",
			"event_type", EventOrderAccepted,
			"error", err.Error(),
		)
		return
	}

	slog.Info("processing order accepted event",
		"order_id", event.OrderID,
		"buyer_id", event.BuyerID,
		"runner_id", event.RunnerID,
	)

	// Step 1: Create chat room
	chatRoomID, err := h.chatClient.CreateChatRoom(event.OrderID, event.BuyerID, event.RunnerID)
	if err != nil {
		slog.Error("failed to create chat room",
			"service", "chat-service",
			"event_type", EventOrderAccepted,
			"order_id", event.OrderID,
			"error", err.Error(),
		)
		return
	}

	slog.Info("chat room created", "order_id", event.OrderID, "chat_room_id", chatRoomID)

	// Step 2: Create location session
	sessionID, err := h.locationClient.CreateLocationSession(event.OrderID, event.BuyerID, event.RunnerID)
	if err != nil {
		slog.Error("failed to create location session",
			"service", "location-service",
			"event_type", EventOrderAccepted,
			"order_id", event.OrderID,
			"error", err.Error(),
		)
		return
	}

	slog.Info("location session created", "order_id", event.OrderID, "session_id", sessionID)
	slog.Info("order accepted event processed successfully", "order_id", event.OrderID)
}

// HandleOrderCompleted processes order.completed events
func (h *Handlers) HandleOrderCompleted(ctx context.Context, topic string, value []byte) {
	defer func() {
		if r := recover(); r != nil {
			slog.Error("panic recovered in HandleOrderCompleted",
				"service", "delivery-management",
				"event_type", EventOrderCompleted,
				"error", r,
			)
		}
	}()

	var event models.OrderCompletedEvent
	if err := json.Unmarshal(value, &event); err != nil {
		slog.Error("failed to unmarshal event",
			"service", "delivery-management",
			"event_type", EventOrderCompleted,
			"error", err.Error(),
		)
		return
	}

	slog.Info("processing order completed event",
		"order_id", event.OrderID,
		"buyer_id", event.BuyerID,
		"runner_id", event.RunnerID,
	)

	h.closeLocationSession(event.OrderID, EventOrderCompleted)
}

// HandleOrderMia processes order.mia events
func (h *Handlers) HandleOrderMia(ctx context.Context, topic string, value []byte) {
	defer func() {
		if r := recover(); r != nil {
			slog.Error("panic recovered in HandleOrderMia",
				"service", "delivery-management",
				"event_type", EventOrderMia,
				"error", r,
			)
		}
	}()

	var event models.OrderMiaEvent
	if err := json.Unmarshal(value, &event); err != nil {
		slog.Error("failed to unmarshal event",
			"service", "delivery-management",
			"event_type", EventOrderMia,
			"error", err.Error(),
		)
		return
	}

	slog.Info("processing order mia event",
		"order_id", event.OrderID,
		"buyer_id", event.BuyerID,
		"runner_id", event.RunnerID,
	)

	h.closeLocationSession(event.OrderID, EventOrderMia)
}

// closeLocationSession handles the common flow for order.completed and order.mia events
func (h *Handlers) closeLocationSession(orderID, eventType string) {
	// Close location session (session_id == order_id)
	if err := h.locationClient.CloseLocationSession(orderID); err != nil {
		slog.Error("failed to close location session",
			"service", "location-service",
			"event_type", eventType,
			"order_id", orderID,
			"error", err.Error(),
		)
		return
	}

	slog.Info("location session closed", "order_id", orderID)
	slog.Info("delivery session closed successfully", "order_id", orderID, "event_type", eventType)
}
