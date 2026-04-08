package handlers

import (
	"errors"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"gitlab.com/esd-g6-team1-tanzu/user-service/repository"
)

// UsersHandler handles HTTP requests for user endpoints.
type UsersHandler struct {
	repo *repository.UsersRepository
}

// NewUsersHandler creates a new UsersHandler with the given repository.
func NewUsersHandler(repo *repository.UsersRepository) *UsersHandler {
	return &UsersHandler{
		repo: repo,
	}
}

// ErrorResponse represents a JSON error response.
type ErrorResponse struct {
	Error string `json:"error"`
}

// StripeCustomerResponse represents the response for stripe customer ID endpoint.
type StripeCustomerResponse struct {
	StripeCustomerID string `json:"stripe_customer_id"`
}

// StripeConnectResponse represents the response for stripe connect ID endpoint.
type StripeConnectResponse struct {
	StripeConnectID string `json:"stripe_connect_id"`
}

// validateUUID checks if the given string is a valid UUID.
func validateUUID(id string) error {
	_, err := uuid.Parse(id)
	return err
}

// GetUserProfile handles GET /api/users/:user_id
// Returns the user profile excluding Stripe fields.
func (h *UsersHandler) GetUserProfile(c fiber.Ctx) error {
	userID := c.Params("user_id")

	if err := validateUUID(userID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error: "invalid user_id: must be a valid UUID",
		})
	}

	profile, err := h.repo.GetUserProfile(c.Context(), userID)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
				Error: "user not found",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error: "internal server error",
		})
	}

	return c.JSON(profile)
}

// GetStripeCustomerID handles GET /api/users/:user_id/stripe/customer
// Returns the stripe_customer_id for the given user.
func (h *UsersHandler) GetStripeCustomerID(c fiber.Ctx) error {
	userID := c.Params("user_id")

	if err := validateUUID(userID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error: "invalid user_id: must be a valid UUID",
		})
	}

	stripeCustomerID, err := h.repo.GetStripeCustomerID(c.Context(), userID)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
				Error: "user not found",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error: "internal server error",
		})
	}

	return c.JSON(StripeCustomerResponse{
		StripeCustomerID: stripeCustomerID,
	})
}

// GetStripeConnectID handles GET /api/users/:user_id/stripe/connect
// Returns the stripe_connect_id for the given user.
func (h *UsersHandler) GetStripeConnectID(c fiber.Ctx) error {
	userID := c.Params("user_id")

	if err := validateUUID(userID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Error: "invalid user_id: must be a valid UUID",
		})
	}

	stripeConnectID, err := h.repo.GetStripeConnectID(c.Context(), userID)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
				Error: "user not found",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Error: "internal server error",
		})
	}

	return c.JSON(StripeConnectResponse{
		StripeConnectID: stripeConnectID,
	})
}

// RegisterRoutes registers all user routes on the given fiber app.
func (h *UsersHandler) RegisterRoutes(app *fiber.App) {
	api := app.Group("/api/users")

	api.Get("/:user_id", h.GetUserProfile)
	api.Get("/:user_id/stripe/customer", h.GetStripeCustomerID)
	api.Get("/:user_id/stripe/connect", h.GetStripeConnectID)
}
