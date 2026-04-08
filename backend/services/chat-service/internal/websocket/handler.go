package websocket

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gocql/gocql"
	"github.com/gorilla/websocket"
	"gitlab.com/esd-g6-team1-tanzu/chat-service/internal/repository"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
}

// Handler handles WebSocket connections
type Handler struct {
	hub             *Hub
	chatRoomRepo    repository.ChatRoomRepository
	messageRepo     repository.MessageRepository
}

// NewHandler creates a new WebSocket handler
func NewHandler(hub *Hub, chatRoomRepo repository.ChatRoomRepository, messageRepo repository.MessageRepository) *Handler {
	return &Handler{
		hub:          hub,
		chatRoomRepo: chatRoomRepo,
		messageRepo:  messageRepo,
	}
}

// ServeWS handles WebSocket requests from clients
// Expected path: /ws/:chat_room_id?sender_id=<uuid>
func (h *Handler) ServeWS(w http.ResponseWriter, r *http.Request, chatRoomID, senderID gocql.UUID) {
	// Get chat room to verify it exists and check status
	chatRoom, err := h.chatRoomRepo.GetByID(chatRoomID)
	if err != nil {
		http.Error(w, "Chat room not found", http.StatusNotFound)
		return
	}

	// Upgrade HTTP connection to WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	// Create new client
	client := NewClient(h.hub, conn, chatRoomID, senderID)

	// Register client with hub
	h.hub.Register(client)

	// Send connection response
	response := ConnectionResponse{
		ChatRoomID: chatRoom.ChatRoomID.String(),
		Status:     chatRoom.Status,
	}
	data, _ := json.Marshal(response)
	client.Send <- data

	// Start goroutines for reading and writing
	go client.WritePump()
	go client.ReadPump(h.messageRepo)
}
