package websocket

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

// newTestClient creates a client for testing without a real websocket connection
func newTestClient(hub *Hub, chatRoomID, senderID uuid.UUID) *Client {
	return &Client{
		Hub:        hub,
		Conn:       nil, // No real connection for unit tests
		ChatRoomID: chatRoomID,
		SenderID:   senderID,
		Send:       make(chan []byte, 256),
	}
}

func TestNewHub(t *testing.T) {
	hub := NewHub()

	if hub == nil {
		t.Fatal("NewHub() returned nil")
	}
	if hub.rooms == nil {
		t.Error("Hub rooms map is nil")
	}
	if hub.register == nil {
		t.Error("Hub register channel is nil")
	}
	if hub.unregister == nil {
		t.Error("Hub unregister channel is nil")
	}
	if hub.broadcast == nil {
		t.Error("Hub broadcast channel is nil")
	}
}

func TestHub_RegisterClient(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	chatRoomID := uuid.New()
	senderID := uuid.New()
	client := newTestClient(hub, chatRoomID, senderID)

	hub.Register(client)

	// Wait for registration to process
	time.Sleep(10 * time.Millisecond)

	hub.mu.RLock()
	defer hub.mu.RUnlock()

	if _, exists := hub.rooms[chatRoomID]; !exists {
		t.Error("Chat room was not created")
	}
	if _, exists := hub.rooms[chatRoomID][client]; !exists {
		t.Error("Client was not registered in room")
	}
}

func TestHub_RegisterMultipleClientsInSameRoom(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	chatRoomID := uuid.New()
	client1 := newTestClient(hub, chatRoomID, uuid.New())
	client2 := newTestClient(hub, chatRoomID, uuid.New())

	hub.Register(client1)
	hub.Register(client2)

	time.Sleep(10 * time.Millisecond)

	hub.mu.RLock()
	defer hub.mu.RUnlock()

	if len(hub.rooms[chatRoomID]) != 2 {
		t.Errorf("Expected 2 clients in room, got %d", len(hub.rooms[chatRoomID]))
	}
}

func TestHub_UnregisterClient(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	chatRoomID := uuid.New()
	client := newTestClient(hub, chatRoomID, uuid.New())

	hub.Register(client)
	time.Sleep(10 * time.Millisecond)

	hub.Unregister(client)
	time.Sleep(10 * time.Millisecond)

	hub.mu.RLock()
	defer hub.mu.RUnlock()

	// Room should be deleted when last client leaves
	if _, exists := hub.rooms[chatRoomID]; exists {
		t.Error("Room should be deleted when last client leaves")
	}
}

func TestHub_UnregisterOneOfMultipleClients(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	chatRoomID := uuid.New()
	client1 := newTestClient(hub, chatRoomID, uuid.New())
	client2 := newTestClient(hub, chatRoomID, uuid.New())

	hub.Register(client1)
	hub.Register(client2)
	time.Sleep(10 * time.Millisecond)

	hub.Unregister(client1)
	time.Sleep(10 * time.Millisecond)

	hub.mu.RLock()
	defer hub.mu.RUnlock()

	// Room should still exist with one client
	if _, exists := hub.rooms[chatRoomID]; !exists {
		t.Error("Room should still exist with remaining client")
	}
	if len(hub.rooms[chatRoomID]) != 1 {
		t.Errorf("Expected 1 client in room, got %d", len(hub.rooms[chatRoomID]))
	}
}

func TestHub_BroadcastLocalToAllClients(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	chatRoomID := uuid.New()
	client1 := newTestClient(hub, chatRoomID, uuid.New())
	client2 := newTestClient(hub, chatRoomID, uuid.New())

	hub.Register(client1)
	hub.Register(client2)
	time.Sleep(10 * time.Millisecond)

	testMessage := []byte("Hello, World!")
	hub.BroadcastLocal(&BroadcastMessage{
		ChatRoomID: chatRoomID,
		Data:       testMessage,
	}, uuid.Nil)

	// Check both clients received the message
	select {
	case msg := <-client1.Send:
		if string(msg) != string(testMessage) {
			t.Errorf("Client1 received wrong message: %s", msg)
		}
	case <-time.After(100 * time.Millisecond):
		t.Error("Client1 did not receive message")
	}

	select {
	case msg := <-client2.Send:
		if string(msg) != string(testMessage) {
			t.Errorf("Client2 received wrong message: %s", msg)
		}
	case <-time.After(100 * time.Millisecond):
		t.Error("Client2 did not receive message")
	}
}

func TestHub_BroadcastLocalExcludesSender(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	chatRoomID := uuid.New()
	senderID := uuid.New()
	client1 := newTestClient(hub, chatRoomID, senderID)
	client2 := newTestClient(hub, chatRoomID, uuid.New())

	hub.Register(client1)
	hub.Register(client2)
	time.Sleep(10 * time.Millisecond)

	testMessage := []byte("Hello from sender!")
	hub.BroadcastLocal(&BroadcastMessage{
		ChatRoomID: chatRoomID,
		Data:       testMessage,
	}, senderID) // Exclude sender

	// Client2 should receive the message
	select {
	case msg := <-client2.Send:
		if string(msg) != string(testMessage) {
			t.Errorf("Client2 received wrong message: %s", msg)
		}
	case <-time.After(100 * time.Millisecond):
		t.Error("Client2 did not receive message")
	}

	// Client1 (sender) should NOT receive the message
	select {
	case msg := <-client1.Send:
		t.Errorf("Sender should not receive their own message, got: %s", msg)
	case <-time.After(50 * time.Millisecond):
		// Expected - sender should not receive message
	}
}

func TestHub_BroadcastToCorrectRoomOnly(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	room1 := uuid.New()
	room2 := uuid.New()
	clientRoom1 := newTestClient(hub, room1, uuid.New())
	clientRoom2 := newTestClient(hub, room2, uuid.New())

	hub.Register(clientRoom1)
	hub.Register(clientRoom2)
	time.Sleep(10 * time.Millisecond)

	testMessage := []byte("Message for room 1")
	hub.BroadcastLocal(&BroadcastMessage{
		ChatRoomID: room1,
		Data:       testMessage,
	}, uuid.Nil)

	// Client in room1 should receive message
	select {
	case msg := <-clientRoom1.Send:
		if string(msg) != string(testMessage) {
			t.Errorf("ClientRoom1 received wrong message: %s", msg)
		}
	case <-time.After(100 * time.Millisecond):
		t.Error("ClientRoom1 did not receive message")
	}

	// Client in room2 should NOT receive message
	select {
	case msg := <-clientRoom2.Send:
		t.Errorf("ClientRoom2 should not receive message for room1, got: %s", msg)
	case <-time.After(50 * time.Millisecond):
		// Expected - different room should not receive message
	}
}

func TestHub_SetRedisPubSub(t *testing.T) {
	hub := NewHub()

	if hub.redisPubSub != nil {
		t.Error("redisPubSub should be nil initially")
	}

	// We can't easily test with a real RedisPubSub without Redis
	// but we can verify the setter works
	hub.SetRedisPubSub(nil)

	// Just verify no panic occurred
}

func TestHub_BroadcastWithoutRedis(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	chatRoomID := uuid.New()
	client := newTestClient(hub, chatRoomID, uuid.New())

	hub.Register(client)
	time.Sleep(10 * time.Millisecond)

	// Broadcast without Redis configured should fall back to local
	testMessage := []byte("Local broadcast")
	hub.Broadcast(&BroadcastMessage{
		ChatRoomID: chatRoomID,
		Data:       testMessage,
		Sender:     nil,
	})

	select {
	case msg := <-client.Send:
		if string(msg) != string(testMessage) {
			t.Errorf("Client received wrong message: %s", msg)
		}
	case <-time.After(100 * time.Millisecond):
		t.Error("Client did not receive message via local broadcast")
	}
}
