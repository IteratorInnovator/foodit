package websocket

import (
	"encoding/json"
	"log"
	"time"

	"github.com/gocql/gocql"
	"github.com/gorilla/websocket"
	"gitlab.com/esd-g6-team1-tanzu/chat-service/internal/models"
	"gitlab.com/esd-g6-team1-tanzu/chat-service/internal/repository"
)

const (
	// Time allowed to write a message to the peer
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer
	pongWait = 60 * time.Second

	// Send pings to peer with this period (must be less than pongWait)
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer
	maxMessageSize = 512
)

// SendMessageRequest represents the client's sendMessage event
type SendMessageRequest struct {
	Action     string `json:"action"`
	ChatRoomID string `json:"chat_room_id"`
	Content    string `json:"content"`
}

// ReceiveMessageResponse represents the server's receiveMessage event
type ReceiveMessageResponse struct {
	Action    string `json:"action"`
	MessageID string `json:"message_id"`
	SenderID  string `json:"sender_id"`
	Content   string `json:"content"`
	SentAt    string `json:"sent_at"`
}

// ConnectionResponse represents the initial connection response
type ConnectionResponse struct {
	ChatRoomID string `json:"chat_room_id"`
	Status     string `json:"status"`
}

// ReadPump pumps messages from the websocket connection to the hub
func (c *Client) ReadPump(messageRepo repository.MessageRepository) {
	defer func() {
		c.Hub.Unregister(c)
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		var req SendMessageRequest
		if err := json.Unmarshal(message, &req); err != nil {
			log.Printf("Failed to parse message: %v", err)
			continue
		}

		if req.Action != "sendMessage" {
			continue
		}

		// Create and save message
		msg := &models.Message{
			ChatRoomID: c.ChatRoomID,
			MessageID:  gocql.TimeUUID(),
			SenderID:   c.SenderID,
			Content:    req.Content,
			SentAt:     time.Now(),
		}

		if err := messageRepo.Create(msg); err != nil {
			log.Printf("Failed to save message: %v", err)
			continue
		}

		// Build response
		response := ReceiveMessageResponse{
			Action:    "receiveMessage",
			MessageID: msg.MessageID.String(),
			SenderID:  msg.SenderID.String(),
			Content:   msg.Content,
			SentAt:    msg.SentAt.Format("2006-01-02T15:04:05Z"),
		}

		data, err := json.Marshal(response)
		if err != nil {
			log.Printf("Failed to marshal response: %v", err)
			continue
		}

		// Broadcast to all clients in the chat room (including sender)
		c.Hub.Broadcast(&BroadcastMessage{
			ChatRoomID: c.ChatRoomID,
			Data:       data,
			Sender:     nil, // Include sender in broadcast
		})
	}
}

// WritePump pumps messages from the hub to the websocket connection
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// NewClient creates a new Client instance
func NewClient(hub *Hub, conn *websocket.Conn, chatRoomID, senderID gocql.UUID) *Client {
	return &Client{
		Hub:        hub,
		Conn:       conn,
		ChatRoomID: chatRoomID,
		SenderID:   senderID,
		Send:       make(chan []byte, 256),
	}
}
