package kafka

import (
	"context"
	"encoding/json"
	"log/slog"

	"gitlab.com/esd-g6-team1-tanzu/foodit-payment-management-service/internal/clients"
	"gitlab.com/esd-g6-team1-tanzu/foodit-payment-management-service/internal/models"
)

// Handlers contains all HTTP clients needed for event processing
type Handlers struct {
	userClient    *clients.UserClient
	paymentClient *clients.PaymentClient
}

// NewHandlers creates a new Handlers instance with all required clients
func NewHandlers(userClient *clients.UserClient, paymentClient *clients.PaymentClient) *Handlers {
	return &Handlers{
		userClient:    userClient,
		paymentClient: paymentClient,
	}
}

// HandleOrderCompleted processes order.completed events
// It fetches the runner's Stripe Connect account ID and transfers the runner's fee
func (h *Handlers) HandleOrderCompleted(ctx context.Context, topic string, value []byte) {
	defer func() {
		if r := recover(); r != nil {
			slog.Error("panic recovered in HandleOrderCompleted",
				"service", "payment-management",
				"event_type", EventOrderCompleted,
				"error", r,
			)
		}
	}()

	var event models.OrderCompletedEvent
	if err := json.Unmarshal(value, &event); err != nil {
		slog.Error("failed to unmarshal event",
			"service", "payment-management",
			"event_type", EventOrderCompleted,
			"error", err.Error(),
		)
		return
	}

	slog.Info("processing order completed event",
		"order_id", event.OrderID,
		"buyer_id", event.BuyerID,
		"runner_id", event.RunnerID,
		"amount", event.Amount,
		"payment_intent_id", event.PaymentIntentID,
	)

	// Validate required fields
	if event.RunnerID == "" {
		slog.Error("runner_id is required for transfer",
			"service", "payment-management",
			"event_type", EventOrderCompleted,
			"order_id", event.OrderID,
		)
		return
	}

	if event.Amount <= 0 {
		slog.Error("amount must be positive for transfer",
			"service", "payment-management",
			"event_type", EventOrderCompleted,
			"order_id", event.OrderID,
			"amount", event.Amount,
		)
		return
	}

	// Step 1: Fetch runner's Stripe Connect account ID from User Service
	stripeConnectID, err := h.userClient.GetStripeConnectID(event.RunnerID)
	if err != nil {
		slog.Error("failed to fetch runner's stripe connect id",
			"service", "user-service",
			"event_type", EventOrderCompleted,
			"order_id", event.OrderID,
			"runner_id", event.RunnerID,
			"error", err.Error(),
		)
		return
	}

	slog.Info("fetched runner's stripe connect id",
		"order_id", event.OrderID,
		"runner_id", event.RunnerID,
		"stripe_connect_id", stripeConnectID,
	)

	// Step 2: Create transfer to runner via Payment Service
	transferResp, err := h.paymentClient.CreateTransfer(
		event.RunnerID,
		stripeConnectID,
		event.Amount,
		event.PaymentIntentID,
		"Payment for order "+event.OrderID,
		map[string]string{
			"order_id":  event.OrderID,
			"buyer_id":  event.BuyerID,
			"runner_id": event.RunnerID,
		},
	)
	if err != nil {
		slog.Error("failed to create transfer",
			"service", "payment-service",
			"event_type", EventOrderCompleted,
			"order_id", event.OrderID,
			"runner_id", event.RunnerID,
			"error", err.Error(),
		)
		return
	}

	slog.Info("transfer created successfully",
		"order_id", event.OrderID,
		"runner_id", event.RunnerID,
		"transfer_id", transferResp.TransferID,
		"amount", transferResp.Amount,
		"currency", transferResp.Currency,
	)

	slog.Info("order completed event processed successfully", "order_id", event.OrderID)
}

// HandleOrderMia processes order.mia events
// It creates a refund for the full order amount back to the buyer
func (h *Handlers) HandleOrderMia(ctx context.Context, topic string, value []byte) {
	defer func() {
		if r := recover(); r != nil {
			slog.Error("panic recovered in HandleOrderMia",
				"service", "payment-management",
				"event_type", EventOrderMia,
				"error", r,
			)
		}
	}()

	var event models.OrderMiaEvent
	if err := json.Unmarshal(value, &event); err != nil {
		slog.Error("failed to unmarshal event",
			"service", "payment-management",
			"event_type", EventOrderMia,
			"error", err.Error(),
		)
		return
	}

	slog.Info("processing order mia event",
		"order_id", event.OrderID,
		"buyer_id", event.BuyerID,
		"runner_id", event.RunnerID,
		"payment_intent_id", event.PaymentIntentID,
	)

	// Validate required fields
	if event.PaymentIntentID == "" {
		slog.Error("payment_intent_id is required for refund",
			"service", "payment-management",
			"event_type", EventOrderMia,
			"order_id", event.OrderID,
		)
		return
	}

	if event.BuyerID == "" {
		slog.Error("buyer_id is required for refund",
			"service", "payment-management",
			"event_type", EventOrderMia,
			"order_id", event.OrderID,
		)
		return
	}

	// Create full refund via Payment Service
	// Passing nil for amount to refund the full payment
	refundResp, err := h.paymentClient.CreateRefund(
		event.BuyerID,
		event.PaymentIntentID,
		nil, // Full refund
	)
	if err != nil {
		slog.Error("failed to create refund",
			"service", "payment-service",
			"event_type", EventOrderMia,
			"order_id", event.OrderID,
			"buyer_id", event.BuyerID,
			"payment_intent_id", event.PaymentIntentID,
			"error", err.Error(),
		)
		return
	}

	slog.Info("refund created successfully",
		"order_id", event.OrderID,
		"buyer_id", event.BuyerID,
		"refund_id", refundResp.RefundID,
		"status", refundResp.Status,
		"amount", refundResp.Amount,
	)

	slog.Info("order mia event processed successfully", "order_id", event.OrderID)
}
