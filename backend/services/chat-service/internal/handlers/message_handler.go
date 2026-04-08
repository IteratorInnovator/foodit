package handlers

import (
	"encoding/base64"

	"github.com/gocql/gocql"
	"github.com/gofiber/fiber/v2"
	"gitlab.com/esd-g6-team1-tanzu/chat-service/internal/repository"
)

type MessageHandler struct {
	messageRepo repository.MessageRepository
}

func NewMessageHandler(messageRepo repository.MessageRepository) *MessageHandler {
	return &MessageHandler{messageRepo: messageRepo}
}

// MessageResponse represents a message in the API response
type MessageResponse struct {
	MessageID string `json:"message_id"`
	SenderID  string `json:"sender_id"`
	Content   string `json:"content"`
	SentAt    string `json:"sent_at"`
}

// MessagesListResponse represents the paginated response for messages
type MessagesListResponse struct {
	Messages      []MessageResponse `json:"messages"`
	NextPageState string            `json:"next_page_state,omitempty"`
	HasMore       bool              `json:"has_more"`
}

// GetMessages handles GET /api/chat/rooms/:chat_room_id/messages
func (h *MessageHandler) GetMessages(c *fiber.Ctx) error {
	// Get chat_room_id from path
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

	// Get limit from query params (default: 50)
	limit := c.QueryInt("limit", 50)
	if limit <= 0 || limit > 100 {
		limit = 50
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

	// Fetch messages from repository
	messages, nextPageState, err := h.messageRepo.GetByChatRoomIDPaginated(chatRoomID, limit, pageState)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch messages",
		})
	}

	// Build response
	response := MessagesListResponse{
		Messages: make([]MessageResponse, 0, len(messages)),
		HasMore:  len(nextPageState) > 0,
	}

	if len(nextPageState) > 0 {
		response.NextPageState = base64.StdEncoding.EncodeToString(nextPageState)
	}

	for _, msg := range messages {
		response.Messages = append(response.Messages, MessageResponse{
			MessageID: msg.MessageID.String(),
			SenderID:  msg.SenderID.String(),
			Content:   msg.Content,
			SentAt:    msg.SentAt.Format("2006-01-02T15:04:05Z"),
		})
	}

	return c.JSON(response)
}
