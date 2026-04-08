package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"gitlab.com/esd-g6-team1-tanzu/order-service/internal/models"
	"gitlab.com/esd-g6-team1-tanzu/order-service/internal/repository"
)

type OrderService struct {
	repo *repository.OrderRepository
}

func NewOrderService(repo *repository.OrderRepository) *OrderService {
	return &OrderService{repo: repo}
}

type CreateOrderRequest struct {
	BuyerID         string             `json:"buyer_id"`
	MenuStoreID     string             `json:"menu_store_id"`
	Items           []models.OrderItem `json:"items"`
	Description     string             `json:"description,omitempty"`
	FoodCost        int64              `json:"food_cost"`
	DeliveryFee     int64              `json:"delivery_fee"`
	DropOff         models.DropOff     `json:"drop_off"`
	PaymentIntentID string             `json:"payment_intent_id"`
}

type AcceptOrderRequest struct {
	RunnerID string `json:"runner_id"`
}

func (s *OrderService) GetAll(ctx context.Context) ([]models.Order, error) {
	return s.repo.GetAll(ctx)
}

func (s *OrderService) GetByID(ctx context.Context, id string) (*models.Order, error) {
	if id == "" {
		return nil, errors.New("order_id is required")
	}
	return s.repo.GetByID(ctx, id)
}

func (s *OrderService) GetPending(ctx context.Context) ([]models.Order, error) {
	return s.repo.GetByStatus(ctx, models.StatusPending)
}

func (s *OrderService) Create(ctx context.Context, req CreateOrderRequest) (*models.Order, error) {
	if req.BuyerID == "" {
		return nil, errors.New("buyer_id is required")
	}
	if req.MenuStoreID == "" {
		return nil, errors.New("menu_store_id is required")
	}
	if len(req.Items) == 0 {
		return nil, errors.New("items must not be empty")
	}
	if req.FoodCost <= 0 {
		return nil, errors.New("food_cost must be greater than zero")
	}
	if req.DropOff.Address == "" {
		return nil, errors.New("drop_off.address is required")
	}
	if req.PaymentIntentID == "" {
		return nil, errors.New("payment_intent_id is required")
	}

	order := &models.Order{
		OrderID:         uuid.New().String(),
		BuyerID:         req.BuyerID,
		Status:          models.StatusPending,
		MenuStoreID:     req.MenuStoreID,
		Items:           req.Items,
		Description:     req.Description,
		FoodCost:        req.FoodCost,
		DeliveryFee:     req.DeliveryFee,
		PlatformFee:     10, // fixed $0.10 in cents
		DropOff:         req.DropOff,
		CreatedAt:       time.Now().UTC().Format(time.RFC3339),
		PaymentIntentID: req.PaymentIntentID,
	}

	if err := s.repo.Create(ctx, order); err != nil {
		return nil, err
	}
	return order, nil
}

func (s *OrderService) Accept(ctx context.Context, id string, req AcceptOrderRequest) (*models.Order, error) {
	if req.RunnerID == "" {
		return nil, errors.New("runner_id is required")
	}

	order, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if order.Status != models.StatusPending {
		return nil, errors.New("only PENDING orders can be accepted")
	}

	order.Status = models.StatusAccepted
	order.RunnerID = req.RunnerID

	if err := s.repo.Update(ctx, order); err != nil {
		return nil, err
	}
	return order, nil
}

func (s *OrderService) Cancel(ctx context.Context, id string) (*models.Order, error) {
	order, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if order.Status == models.StatusCancelled {
		return nil, errors.New("order is already cancelled")
	}
	if order.Status == models.StatusCompleted {
		return nil, errors.New("completed orders cannot be cancelled")
	}

	order.Status = models.StatusCancelled

	if err := s.repo.Update(ctx, order); err != nil {
		return nil, err
	}
	return order, nil
}

func (s *OrderService) UpdateStatus(ctx context.Context, id string, status models.OrderStatus) (*models.Order, error) {
	order, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	order.Status = status
	if err := s.repo.Update(ctx, order); err != nil {
		return nil, err
	}
	return order, nil
}

func (s *OrderService) Update(ctx context.Context, id string, status models.OrderStatus, runnerID string) (*models.Order, error) {
	order, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	order.Status = status
	if runnerID != "" {
		order.RunnerID = runnerID
	}
	if err := s.repo.Update(ctx, order); err != nil {
		return nil, err
	}
	return order, nil
}

func (s *OrderService) Delete(ctx context.Context, id string) error {
	if id == "" {
		return errors.New("order_id is required")
	}
	return s.repo.Delete(ctx, id)
}
