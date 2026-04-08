package websocket

import (
	"context"
	"encoding/json"
	"log"
	"sync"

	"github.com/gocql/gocql"
	"github.com/redis/go-redis/v9"
)

const channelPrefix = "chat_room:"
const channelSuffix = ":message"

// RedisMessage represents a message published to Redis
type RedisMessage struct {
	ChatRoomID string `json:"chat_room_id"`
	Data       []byte `json:"data"`
	SenderID   string `json:"sender_id"` // Used to exclude sender on the originating instance
}

// RedisPubSub manages Redis pub/sub for cross-instance messaging
type RedisPubSub struct {
	client *redis.Client
	hub    *Hub

	// Track subscriptions per room
	subscriptions map[gocql.UUID]*redis.PubSub
	mu            sync.RWMutex

	ctx    context.Context
	cancel context.CancelFunc
}

// NewRedisPubSub creates a new Redis pub/sub manager
func NewRedisPubSub(client *redis.Client, hub *Hub) *RedisPubSub {
	ctx, cancel := context.WithCancel(context.Background())
	return &RedisPubSub{
		client:        client,
		hub:           hub,
		subscriptions: make(map[gocql.UUID]*redis.PubSub),
		ctx:           ctx,
		cancel:        cancel,
	}
}

// Subscribe subscribes to a chat room's Redis channel
func (r *RedisPubSub) Subscribe(chatRoomID gocql.UUID) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Already subscribed
	if _, exists := r.subscriptions[chatRoomID]; exists {
		return
	}

	channel := channelPrefix + chatRoomID.String()
	pubsub := r.client.Subscribe(r.ctx, channel)
	r.subscriptions[chatRoomID] = pubsub

	// Start listening for messages in a goroutine
	go r.listen(chatRoomID, pubsub)

	log.Printf("Subscribed to Redis channel: %s", channel)
}

// Unsubscribe unsubscribes from a chat room's Redis channel
func (r *RedisPubSub) Unsubscribe(chatRoomID gocql.UUID) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if pubsub, exists := r.subscriptions[chatRoomID]; exists {
		pubsub.Close()
		delete(r.subscriptions, chatRoomID)
		log.Printf("Unsubscribed from Redis channel: %s%s", channelPrefix, chatRoomID.String())
	}
}

// Publish publishes a message to Redis for cross-instance broadcasting
func (r *RedisPubSub) Publish(chatRoomID gocql.UUID, data []byte, senderID gocql.UUID) error {
	msg := RedisMessage{
		ChatRoomID: chatRoomID.String(),
		Data:       data,
		SenderID:   senderID.String(),
	}

	payload, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	channel := channelPrefix + chatRoomID.String()
	return r.client.Publish(r.ctx, channel, payload).Err()
}

// listen listens for messages on a Redis channel and broadcasts locally
func (r *RedisPubSub) listen(chatRoomID gocql.UUID, pubsub *redis.PubSub) {
	ch := pubsub.Channel()

	for {
		select {
		case <-r.ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}

			var redisMsg RedisMessage
			if err := json.Unmarshal([]byte(msg.Payload), &redisMsg); err != nil {
				log.Printf("Failed to unmarshal Redis message: %v", err)
				continue
			}

			senderID, _ := gocql.ParseUUID(redisMsg.SenderID)

			// Broadcast to local clients only (excluding the original sender)
			r.hub.BroadcastLocal(&BroadcastMessage{
				ChatRoomID: chatRoomID,
				Data:       redisMsg.Data,
			}, senderID)
		}
	}
}

// Close closes all subscriptions and the Redis connection
func (r *RedisPubSub) Close() {
	r.cancel()

	r.mu.Lock()
	defer r.mu.Unlock()

	for _, pubsub := range r.subscriptions {
		pubsub.Close()
	}
	r.subscriptions = nil
}
