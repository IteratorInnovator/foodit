package websocket

import (
	"log"
	"sync"

	"github.com/gocql/gocql"
	"github.com/gorilla/websocket"
)

// Hub maintains the set of active clients and broadcasts messages to clients
type Hub struct {
	// Registered clients grouped by chat room
	rooms map[gocql.UUID]map[*Client]bool

	// Register requests from clients
	register chan *Client

	// Unregister requests from clients
	unregister chan *Client

	// Inbound messages from clients to broadcast
	broadcast chan *BroadcastMessage

	// Redis pub/sub for cross-instance messaging
	redisPubSub *RedisPubSub

	mu sync.RWMutex
}

// Client represents a connected WebSocket client
type Client struct {
	Hub        *Hub
	Conn       *websocket.Conn
	ChatRoomID gocql.UUID
	SenderID   gocql.UUID
	Send       chan []byte
}

// BroadcastMessage represents a message to broadcast to a chat room
type BroadcastMessage struct {
	ChatRoomID gocql.UUID
	Data       []byte
	Sender     *Client // Exclude sender from broadcast if not nil
}

// emptyUUID represents an empty/nil UUID
var emptyUUID gocql.UUID

// NewHub creates a new Hub instance
func NewHub() *Hub {
	return &Hub{
		rooms:      make(map[gocql.UUID]map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan *BroadcastMessage),
	}
}

// SetRedisPubSub sets the Redis pub/sub instance for cross-instance messaging
func (h *Hub) SetRedisPubSub(rps *RedisPubSub) {
	h.redisPubSub = rps
}

// Run starts the hub's main loop
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			isNewRoom := h.rooms[client.ChatRoomID] == nil
			if isNewRoom {
				h.rooms[client.ChatRoomID] = make(map[*Client]bool)
			}
			h.rooms[client.ChatRoomID][client] = true
			h.mu.Unlock()

			// Subscribe to Redis channel when first client joins a room
			if isNewRoom && h.redisPubSub != nil {
				h.redisPubSub.Subscribe(client.ChatRoomID)
			}

		case client := <-h.unregister:
			h.mu.Lock()
			var roomEmpty bool
			if clients, ok := h.rooms[client.ChatRoomID]; ok {
				if _, ok := clients[client]; ok {
					delete(clients, client)
					close(client.Send)
					if len(clients) == 0 {
						delete(h.rooms, client.ChatRoomID)
						roomEmpty = true
					}
				}
			}
			chatRoomID := client.ChatRoomID
			h.mu.Unlock()

			// Unsubscribe from Redis channel when last client leaves a room
			if roomEmpty && h.redisPubSub != nil {
				h.redisPubSub.Unsubscribe(chatRoomID)
			}

		case message := <-h.broadcast:
			// Publish to Redis for cross-instance broadcasting
			if h.redisPubSub != nil {
				senderID := emptyUUID
				if message.Sender != nil {
					senderID = message.Sender.SenderID
				}
				if err := h.redisPubSub.Publish(message.ChatRoomID, message.Data, senderID); err != nil {
					log.Printf("Failed to publish to Redis: %v", err)
				}
			} else {
				// Fallback to local-only broadcast when Redis is not configured
				h.broadcastToLocalClients(message, emptyUUID)
			}
		}
	}
}

// Register adds a client to the hub
func (h *Hub) Register(client *Client) {
	h.register <- client
}

// Unregister removes a client from the hub
func (h *Hub) Unregister(client *Client) {
	h.unregister <- client
}

// Broadcast sends a message to all clients in a chat room (via Redis if configured)
func (h *Hub) Broadcast(msg *BroadcastMessage) {
	h.broadcast <- msg
}

// BroadcastLocal broadcasts a message only to local clients (called by Redis subscriber)
func (h *Hub) BroadcastLocal(msg *BroadcastMessage, excludeSenderID gocql.UUID) {
	h.broadcastToLocalClients(msg, excludeSenderID)
}

// broadcastToLocalClients sends a message to all local clients in a chat room
func (h *Hub) broadcastToLocalClients(message *BroadcastMessage, excludeSenderID gocql.UUID) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if clients, ok := h.rooms[message.ChatRoomID]; ok {
		for client := range clients {
			// Skip sender if specified (by Client pointer or SenderID)
			if message.Sender != nil && client == message.Sender {
				continue
			}
			if excludeSenderID != emptyUUID && client.SenderID == excludeSenderID {
				continue
			}
			select {
			case client.Send <- message.Data:
			default:
				close(client.Send)
				delete(clients, client)
			}
		}
	}
}
