package repository

import (
	"time"

	"github.com/gocql/gocql"
	"gitlab.com/esd-g6-team1-tanzu/chat-service/internal/database"
	"gitlab.com/esd-g6-team1-tanzu/chat-service/internal/models"
)

type ChatRoomRepository interface {
	Create(chatRoom *models.ChatRoom) error
	GetByID(chatRoomID gocql.UUID) (*models.ChatRoom, error)
	GetByUserID(userID gocql.UUID) ([]models.ChatRoomByUser, error)
	GetByUserIDPaginated(userID gocql.UUID, limit int, pageState []byte) ([]models.ChatRoomByUser, []byte, error)
	UpdateStatus(chatRoomID gocql.UUID, status string, closedAt *time.Time) error
	Close(chatRoomID gocql.UUID) error
}

type chatRoomRepository struct {
	db *database.CassandraDB
}

func NewChatRoomRepository(db *database.CassandraDB) ChatRoomRepository {
	return &chatRoomRepository{db: db}
}

func (r *chatRoomRepository) Create(chatRoom *models.ChatRoom) error {
	// Insert into chat_rooms table
	if err := r.db.Session.Query(`
		INSERT INTO chat_rooms (chat_room_id, order_id, buyer_id, runner_id, status, created_at, closed_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		chatRoom.ChatRoomID,
		chatRoom.OrderID,
		chatRoom.BuyerID,
		chatRoom.RunnerID,
		chatRoom.Status,
		chatRoom.CreatedAt,
		chatRoom.ClosedAt,
	).Exec(); err != nil {
		return err
	}

	// Insert into chat_rooms_by_user for buyer
	if err := r.db.Session.Query(`
		INSERT INTO chat_rooms_by_user (user_id, chat_room_id, created_at, order_id, status)
		VALUES (?, ?, ?, ?, ?)`,
		chatRoom.BuyerID,
		chatRoom.ChatRoomID,
		chatRoom.CreatedAt,
		chatRoom.OrderID,
		chatRoom.Status,
	).Exec(); err != nil {
		return err
	}

	// Insert into chat_rooms_by_user for runner
	if err := r.db.Session.Query(`
		INSERT INTO chat_rooms_by_user (user_id, chat_room_id, created_at, order_id, status)
		VALUES (?, ?, ?, ?, ?)`,
		chatRoom.RunnerID,
		chatRoom.ChatRoomID,
		chatRoom.CreatedAt,
		chatRoom.OrderID,
		chatRoom.Status,
	).Exec(); err != nil {
		return err
	}

	return nil
}

func (r *chatRoomRepository) GetByID(chatRoomID gocql.UUID) (*models.ChatRoom, error) {
	var chatRoom models.ChatRoom
	if err := r.db.Session.Query(`
		SELECT chat_room_id, order_id, buyer_id, runner_id, status, created_at, closed_at
		FROM chat_rooms
		WHERE chat_room_id = ?`,
		chatRoomID,
	).Scan(
		&chatRoom.ChatRoomID,
		&chatRoom.OrderID,
		&chatRoom.BuyerID,
		&chatRoom.RunnerID,
		&chatRoom.Status,
		&chatRoom.CreatedAt,
		&chatRoom.ClosedAt,
	); err != nil {
		return nil, err
	}
	return &chatRoom, nil
}

func (r *chatRoomRepository) GetByUserID(userID gocql.UUID) ([]models.ChatRoomByUser, error) {
	var chatRooms []models.ChatRoomByUser
	iter := r.db.Session.Query(`
		SELECT user_id, chat_room_id, created_at, order_id, status
		FROM chat_rooms_by_user
		WHERE user_id = ?`,
		userID,
	).Iter()

	var room models.ChatRoomByUser
	for iter.Scan(
		&room.UserID,
		&room.ChatRoomID,
		&room.CreatedAt,
		&room.OrderID,
		&room.Status,
	) {
		chatRooms = append(chatRooms, room)
	}

	if err := iter.Close(); err != nil {
		return nil, err
	}
	return chatRooms, nil
}

func (r *chatRoomRepository) GetByUserIDPaginated(userID gocql.UUID, limit int, pageState []byte) ([]models.ChatRoomByUser, []byte, error) {
	var chatRooms []models.ChatRoomByUser

	query := r.db.Session.Query(`
		SELECT user_id, chat_room_id, created_at, order_id, status
		FROM chat_rooms_by_user
		WHERE user_id = ?`,
		userID,
	).PageSize(limit)

	if len(pageState) > 0 {
		query = query.PageState(pageState)
	}

	iter := query.Iter()

	var room models.ChatRoomByUser
	for iter.Scan(
		&room.UserID,
		&room.ChatRoomID,
		&room.CreatedAt,
		&room.OrderID,
		&room.Status,
	) {
		chatRooms = append(chatRooms, room)
	}

	nextPageState := iter.PageState()

	if err := iter.Close(); err != nil {
		return nil, nil, err
	}

	return chatRooms, nextPageState, nil
}

func (r *chatRoomRepository) UpdateStatus(chatRoomID gocql.UUID, status string, closedAt *time.Time) error {
	// Update chat_rooms table
	if err := r.db.Session.Query(`
		UPDATE chat_rooms
		SET status = ?, closed_at = ?
		WHERE chat_room_id = ?`,
		status,
		closedAt,
		chatRoomID,
	).Exec(); err != nil {
		return err
	}

	// Get the chat room to update chat_rooms_by_user
	chatRoom, err := r.GetByID(chatRoomID)
	if err != nil {
		return err
	}

	// Update status in chat_rooms_by_user for buyer
	if err := r.db.Session.Query(`
		UPDATE chat_rooms_by_user
		SET status = ?
		WHERE user_id = ? AND chat_room_id = ? AND created_at = ?`,
		status,
		chatRoom.BuyerID,
		chatRoomID,
		chatRoom.CreatedAt,
	).Exec(); err != nil {
		return err
	}

	// Update status in chat_rooms_by_user for runner
	if err := r.db.Session.Query(`
		UPDATE chat_rooms_by_user
		SET status = ?
		WHERE user_id = ? AND chat_room_id = ? AND created_at = ?`,
		status,
		chatRoom.RunnerID,
		chatRoomID,
		chatRoom.CreatedAt,
	).Exec(); err != nil {
		return err
	}

	return nil
}

func (r *chatRoomRepository) Close(chatRoomID gocql.UUID) error {
	now := time.Now()
	return r.UpdateStatus(chatRoomID, "closed", &now)
}
