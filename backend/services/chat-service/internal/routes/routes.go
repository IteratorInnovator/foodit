package routes

import (
	"net/http"

	"github.com/gocql/gocql"
	"github.com/gofiber/adaptor/v2"
	"github.com/gofiber/fiber/v2"
	"gitlab.com/esd-g6-team1-tanzu/chat-service/internal/database"
	"gitlab.com/esd-g6-team1-tanzu/chat-service/internal/handlers"
	"gitlab.com/esd-g6-team1-tanzu/chat-service/internal/repository"
	"gitlab.com/esd-g6-team1-tanzu/chat-service/internal/websocket"
)

func Setup(app *fiber.App, db *database.CassandraDB, hub *websocket.Hub) {
	// Initialize repositories
	chatRoomRepo := repository.NewChatRoomRepository(db)
	messageRepo := repository.NewMessageRepository(db)

	// REST API handlers
	messageHandler := handlers.NewMessageHandler(messageRepo)
	roomHandler := handlers.NewRoomHandler(chatRoomRepo)

	// WebSocket handler
	wsHandler := websocket.NewHandler(hub, chatRoomRepo, messageRepo)

	// Health check
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "healthy"})
	})

	// WebSocket route
	app.Get("/ws/chat/:chat_room_id", func(c *fiber.Ctx) error {
		chatRoomIDStr := c.Params("chat_room_id")
		senderIDStr := c.Query("sender_id")

		if chatRoomIDStr == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "chat_room_id is required",
			})
		}

		if senderIDStr == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "sender_id query parameter is required",
			})
		}

		chatRoomID, err := gocql.ParseUUID(chatRoomIDStr)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid chat_room_id format",
			})
		}

		senderID, err := gocql.ParseUUID(senderIDStr)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid sender_id format",
			})
		}

		// Use adaptor to handle WebSocket upgrade
		handler := adaptor.HTTPHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			wsHandler.ServeWS(w, r, chatRoomID, senderID)
		})

		return handler(c)
	})

	// API routes
	api := app.Group("/api")

	// Chat routes
	chat := api.Group("/chat")
	chat.Post("/rooms", roomHandler.CreateChatRoom)
	chat.Get("/rooms/id/:chat_room_id", roomHandler.GetChatRoomByID)
	chat.Get("/rooms/:user_id", roomHandler.GetChatRoomsByUser)
	chat.Put("/rooms/:chat_room_id/close", roomHandler.CloseChatRoom)
	chat.Get("/rooms/:chat_room_id/messages", messageHandler.GetMessages)
}
