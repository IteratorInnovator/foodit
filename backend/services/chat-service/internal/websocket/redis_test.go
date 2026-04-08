package websocket

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

func setupTestRedis(t *testing.T) (*miniredis.Miniredis, *redis.Client) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("Failed to start miniredis: %v", err)
	}

	client := redis.NewClient(&redis.Options{
		Addr: mr.Addr(),
	})

	return mr, client
}

func TestNewRedisPubSub(t *testing.T) {
	mr, client := setupTestRedis(t)
	defer mr.Close()
	defer client.Close()

	hub := NewHub()
	rps := NewRedisPubSub(client, hub)

	if rps == nil {
		t.Fatal("NewRedisPubSub returned nil")
	}
	if rps.client != client {
		t.Error("Redis client not set correctly")
	}
	if rps.hub != hub {
		t.Error("Hub not set correctly")
	}
	if rps.subscriptions == nil {
		t.Error("Subscriptions map is nil")
	}
}

func TestRedisPubSub_Subscribe(t *testing.T) {
	mr, client := setupTestRedis(t)
	defer mr.Close()
	defer client.Close()

	hub := NewHub()
	rps := NewRedisPubSub(client, hub)
	defer rps.Close()

	chatRoomID := uuid.New()
	rps.Subscribe(chatRoomID)

	// Verify subscription was added
	rps.mu.RLock()
	_, exists := rps.subscriptions[chatRoomID]
	rps.mu.RUnlock()

	if !exists {
		t.Error("Subscription was not added")
	}
}

func TestRedisPubSub_SubscribeIdempotent(t *testing.T) {
	mr, client := setupTestRedis(t)
	defer mr.Close()
	defer client.Close()

	hub := NewHub()
	rps := NewRedisPubSub(client, hub)
	defer rps.Close()

	chatRoomID := uuid.New()

	// Subscribe multiple times
	rps.Subscribe(chatRoomID)
	rps.Subscribe(chatRoomID)
	rps.Subscribe(chatRoomID)

	// Should only have one subscription
	rps.mu.RLock()
	count := len(rps.subscriptions)
	rps.mu.RUnlock()

	if count != 1 {
		t.Errorf("Expected 1 subscription, got %d", count)
	}
}

func TestRedisPubSub_Unsubscribe(t *testing.T) {
	mr, client := setupTestRedis(t)
	defer mr.Close()
	defer client.Close()

	hub := NewHub()
	rps := NewRedisPubSub(client, hub)
	defer rps.Close()

	chatRoomID := uuid.New()
	rps.Subscribe(chatRoomID)

	// Verify subscribed
	rps.mu.RLock()
	_, exists := rps.subscriptions[chatRoomID]
	rps.mu.RUnlock()
	if !exists {
		t.Fatal("Subscription was not added")
	}

	// Unsubscribe
	rps.Unsubscribe(chatRoomID)

	// Verify unsubscribed
	rps.mu.RLock()
	_, exists = rps.subscriptions[chatRoomID]
	rps.mu.RUnlock()
	if exists {
		t.Error("Subscription was not removed")
	}
}

func TestRedisPubSub_UnsubscribeNonexistent(t *testing.T) {
	mr, client := setupTestRedis(t)
	defer mr.Close()
	defer client.Close()

	hub := NewHub()
	rps := NewRedisPubSub(client, hub)
	defer rps.Close()

	// Unsubscribe from room that was never subscribed to - should not panic
	rps.Unsubscribe(uuid.New())
}

func TestRedisPubSub_Publish(t *testing.T) {
	mr, client := setupTestRedis(t)
	defer mr.Close()
	defer client.Close()

	hub := NewHub()
	rps := NewRedisPubSub(client, hub)
	defer rps.Close()

	chatRoomID := uuid.New()
	senderID := uuid.New()
	testData := []byte(`{"action":"receiveMessage","content":"Hello!"}`)

	err := rps.Publish(chatRoomID, testData, senderID)
	if err != nil {
		t.Errorf("Publish failed: %v", err)
	}
}

func TestRedisPubSub_PublishAndReceive(t *testing.T) {
	mr, client := setupTestRedis(t)
	defer mr.Close()
	defer client.Close()

	hub := NewHub()
	go hub.Run()

	rps := NewRedisPubSub(client, hub)
	hub.SetRedisPubSub(rps)
	defer rps.Close()

	chatRoomID := uuid.New()
	receiverID := uuid.New()
	senderID := uuid.New()

	// Create and register a receiving client
	receiver := newTestClient(hub, chatRoomID, receiverID)
	hub.Register(receiver)

	// Wait for registration and subscription
	time.Sleep(50 * time.Millisecond)

	// Publish a message
	testData := []byte(`{"action":"receiveMessage","content":"Hello!"}`)
	err := rps.Publish(chatRoomID, testData, senderID)
	if err != nil {
		t.Fatalf("Publish failed: %v", err)
	}

	// Wait for message to be received
	select {
	case msg := <-receiver.Send:
		if string(msg) != string(testData) {
			t.Errorf("Received wrong message: %s", msg)
		}
	case <-time.After(500 * time.Millisecond):
		t.Error("Did not receive message within timeout")
	}
}

func TestRedisPubSub_SenderExcludedFromOwnMessage(t *testing.T) {
	mr, client := setupTestRedis(t)
	defer mr.Close()
	defer client.Close()

	hub := NewHub()
	go hub.Run()

	rps := NewRedisPubSub(client, hub)
	hub.SetRedisPubSub(rps)
	defer rps.Close()

	chatRoomID := uuid.New()
	senderID := uuid.New()
	receiverID := uuid.New()

	// Create sender and receiver clients
	sender := newTestClient(hub, chatRoomID, senderID)
	receiver := newTestClient(hub, chatRoomID, receiverID)

	hub.Register(sender)
	hub.Register(receiver)
	time.Sleep(50 * time.Millisecond)

	// Publish a message from sender
	testData := []byte(`{"content":"Hello from sender!"}`)
	err := rps.Publish(chatRoomID, testData, senderID)
	if err != nil {
		t.Fatalf("Publish failed: %v", err)
	}

	// Receiver should get the message
	select {
	case msg := <-receiver.Send:
		if string(msg) != string(testData) {
			t.Errorf("Receiver got wrong message: %s", msg)
		}
	case <-time.After(500 * time.Millisecond):
		t.Error("Receiver did not get message")
	}

	// Sender should NOT get their own message
	select {
	case msg := <-sender.Send:
		t.Errorf("Sender should not receive own message, got: %s", msg)
	case <-time.After(100 * time.Millisecond):
		// Expected - sender excluded
	}
}

func TestRedisPubSub_Close(t *testing.T) {
	mr, client := setupTestRedis(t)
	defer mr.Close()
	defer client.Close()

	hub := NewHub()
	rps := NewRedisPubSub(client, hub)

	// Subscribe to a few rooms
	rps.Subscribe(uuid.New())
	rps.Subscribe(uuid.New())
	rps.Subscribe(uuid.New())

	rps.mu.RLock()
	beforeClose := len(rps.subscriptions)
	rps.mu.RUnlock()

	if beforeClose != 3 {
		t.Errorf("Expected 3 subscriptions before close, got %d", beforeClose)
	}

	// Close should clear all subscriptions
	rps.Close()

	rps.mu.RLock()
	afterClose := rps.subscriptions
	rps.mu.RUnlock()

	if afterClose != nil {
		t.Error("Subscriptions should be nil after close")
	}
}

func TestRedisMessage_JSON(t *testing.T) {
	chatRoomID := uuid.New()
	senderID := uuid.New()
	testData := []byte(`{"action":"receiveMessage"}`)

	msg := RedisMessage{
		ChatRoomID: chatRoomID.String(),
		Data:       testData,
		SenderID:   senderID.String(),
	}

	// Marshal
	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	// Unmarshal
	var decoded RedisMessage
	err = json.Unmarshal(data, &decoded)
	if err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if decoded.ChatRoomID != msg.ChatRoomID {
		t.Errorf("ChatRoomID mismatch: %s != %s", decoded.ChatRoomID, msg.ChatRoomID)
	}
	if decoded.SenderID != msg.SenderID {
		t.Errorf("SenderID mismatch: %s != %s", decoded.SenderID, msg.SenderID)
	}
	if string(decoded.Data) != string(msg.Data) {
		t.Errorf("Data mismatch: %s != %s", decoded.Data, msg.Data)
	}
}

func TestChannelPrefix(t *testing.T) {
	if channelPrefix != "chat:room:" {
		t.Errorf("Unexpected channel prefix: %s", channelPrefix)
	}
}
