package handlers

import (
	"encoding/base64"
	"log"
	"time"

	"github.com/gocql/gocql"
	"github.com/gofiber/fiber/v2"
	"gitlab.com/esd-g6-team1-tanzu/chat-service/internal/models"
	"gitlab.com/esd-g6-team1-tanzu/chat-service/internal/repository"
)

type RoomHandler struct {
	chatRoomRepo repository.ChatRoomRepository
}

func NewRoomHandler(chatRoomRepo repository.ChatRoomRepository) *RoomHandler {
	return &RoomHandler{chatRoomRepo: chatRoomRepo}
}

// CreateChatRoomRequest represents the request body for creating a chat room
type CreateChatRoomRequest struct {
	OrderID  string `json:"order_id"`
	BuyerID  string `json:"buyer_id"`
	RunnerID string `json:"runner_id"`
}

// ChatRoomResponse represents a chat room in the API response
type ChatRoomResponse struct {
	ChatRoomID string  `json:"chat_room_id"`
	OrderID    string  `json:"order_id"`
	BuyerID    string  `json:"buyer_id"`
	RunnerID   string  `json:"runner_id"`
	Status     string  `json:"status"`
	CreatedAt  string  `json:"created_at"`
	ClosedAt   *string `json:"closed_at,omitempty"`
}

// ChatRoomsListResponse represents the paginated response for chat rooms
type ChatRoomsListResponse struct {
	ChatRooms     []ChatRoomResponse `json:"chat_rooms"`
	NextPageState string             `json:"next_page_state,omitempty"`
	HasMore       bool               `json:"has_more"`
}

// GetChatRoomsByUser handles GET /api/chat/rooms/:user_id
func (h *RoomHandler) GetChatRoomsByUser(c *fiber.Ctx) error {
	// Get user_id from path
	userIDStr := c.Params("user_id")
	if userIDStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "user_id is required",
		})
	}

	userID, err := gocql.ParseUUID(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid user_id format",
		})
	}

	// Get limit from query params (default: 20)
	limit := c.QueryInt("limit", 20)
	if limit <= 0 {
		limit = 20
	}

	// Get page_state from query params
	var pageState []byte
	if pageStateStr := c.Query("page_state"); pageStateStr != "" {
		pageState, err = base64.StdEncoding.DecodeString(pageStateStr)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid page_state format",
			})
		}
	}

	// Fetch chat rooms from repository
	chatRooms, nextPageState, err := h.chatRoomRepo.GetByUserIDPaginated(userID, limit, pageState)
	if err != nil {
		log.Printf("ERROR fetching chat rooms for user %s: %v", userID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch chat rooms: " + err.Error(),
		})
	}

	// Build response
	response := ChatRoomsListResponse{
		ChatRooms: make([]ChatRoomResponse, 0, len(chatRooms)),
		HasMore:   len(nextPageState) > 0,
	}

	if len(nextPageState) > 0 {
		response.NextPageState = base64.StdEncoding.EncodeToString(nextPageState)
	}

	for _, room := range chatRooms {
		response.ChatRooms = append(response.ChatRooms, ChatRoomResponse{
			ChatRoomID: room.ChatRoomID.String(),
			OrderID:    room.OrderID.String(),
			Status:     room.Status,
			CreatedAt:  room.CreatedAt.Format("2006-01-02T15:04:05Z"),
		})
	}

	return c.JSON(response)
}

// GetChatRoomByID handles GET /api/chat/rooms/id/:chat_room_id
func (h *RoomHandler) GetChatRoomByID(c *fiber.Ctx) error {
	chatRoomIDStr := c.Params("chat_room_id")
	if chatRoomIDStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "chat_room_id is required"})
	}

	chatRoomID, err := gocql.ParseUUID(chatRoomIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid chat_room_id format"})
	}

	chatRoom, err := h.chatRoomRepo.GetByID(chatRoomID)
	if err != nil {
		if err == gocql.ErrNotFound {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Chat room not found"})
		}
		log.Printf("ERROR fetching chat room %s: %v", chatRoomID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch chat room"})
	}

	response := ChatRoomResponse{
		ChatRoomID: chatRoom.ChatRoomID.String(),
		OrderID:    chatRoom.OrderID.String(),
		BuyerID:    chatRoom.BuyerID.String(),
		RunnerID:   chatRoom.RunnerID.String(),
		Status:     chatRoom.Status,
		CreatedAt:  chatRoom.CreatedAt.Format("2006-01-02T15:04:05Z"),
	}

	if chatRoom.ClosedAt != nil {
		closedAt := chatRoom.ClosedAt.Format("2006-01-02T15:04:05Z")
		response.ClosedAt = &closedAt
	}

	return c.JSON(response)
}

// CreateChatRoom handles POST /api/chat/rooms
func (h *RoomHandler) CreateChatRoom(c *fiber.Ctx) error {
	var req CreateChatRoomRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Validate required fields
	if req.OrderID == "" || req.BuyerID == "" || req.RunnerID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "order_id, buyer_id, and runner_id are required",
		})
	}

	// Parse UUIDs
	orderID, err := gocql.ParseUUID(req.OrderID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid order_id format",
		})
	}

	buyerID, err := gocql.ParseUUID(req.BuyerID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid buyer_id format",
		})
	}

	runnerID, err := gocql.ParseUUID(req.RunnerID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid runner_id format",
		})
	}

	// Create chat room
	chatRoom := &models.ChatRoom{
		ChatRoomID: gocql.TimeUUID(),
		OrderID:    orderID,
		BuyerID:    buyerID,
		RunnerID:   runnerID,
		Status:     "open",
		CreatedAt:  time.Now(),
	}

	if err := h.chatRoomRepo.Create(chatRoom); err != nil {
		log.Printf("ERROR creating chat room: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create chat room: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success":      true,
		"chat_room_id": chatRoom.ChatRoomID.String(),
	})
}

// CloseChatRoom handles PUT /api/chat/rooms/:chat_room_id/close
func (h *RoomHandler) CloseChatRoom(c *fiber.Ctx) error {
	chatRoomIDStr := c.Params("chat_room_id")
	if chatRoomIDStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "chat_room_id is required",
		})
	}

	chatRoomID, err := gocql.ParseUUID(chatRoomIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid chat_room_id format",
		})
	}

	if err := h.chatRoomRepo.Close(chatRoomID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to close chat room",
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
	})
}
