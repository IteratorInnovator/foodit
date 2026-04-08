package models

import (
	"time"

	"github.com/gocql/gocql"
)

// Message represents the messages table
type Message struct {
	ChatRoomID gocql.UUID `json:"chat_room_id"`
	MessageID  gocql.UUID `json:"message_id"`
	SenderID   gocql.UUID `json:"sender_id"`
	Content    string     `json:"content"`
	SentAt     time.Time  `json:"sent_at"`
}
