package models

import (
	"time"

	"github.com/gocql/gocql"
)

// ChatRoom represents the chat_rooms table
type ChatRoom struct {
	ChatRoomID gocql.UUID `json:"chat_room_id"`
	OrderID    gocql.UUID `json:"order_id"`
	BuyerID    gocql.UUID `json:"buyer_id"`
	RunnerID   gocql.UUID `json:"runner_id"`
	Status     string     `json:"status"`
	CreatedAt  time.Time  `json:"created_at"`
	ClosedAt   *time.Time `json:"closed_at,omitempty"`
}

// ChatRoomByUser represents the chat_rooms_by_user table
type ChatRoomByUser struct {
	UserID     gocql.UUID `json:"user_id"`
	ChatRoomID gocql.UUID `json:"chat_room_id"`
	CreatedAt  time.Time  `json:"created_at"`
	OrderID    gocql.UUID `json:"order_id"`
	Status     string     `json:"status"`
}
