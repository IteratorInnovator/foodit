package models

// WebSocketMessage represents messages sent over WebSocket
type WebSocketMessage struct {
	Type       string `json:"type"`
	ChatRoomID string `json:"chat_room_id,omitempty"`
	SenderID   string `json:"sender_id,omitempty"`
	Content    string `json:"content,omitempty"`
}
