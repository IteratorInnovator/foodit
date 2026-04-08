package repository

import (
	"time"

	"github.com/gocql/gocql"
	"gitlab.com/esd-g6-team1-tanzu/chat-service/internal/database"
	"gitlab.com/esd-g6-team1-tanzu/chat-service/internal/models"
)

type MessageRepository interface {
	Create(message *models.Message) error
	GetByChatRoomID(chatRoomID gocql.UUID, limit int) ([]models.Message, error)
	GetByChatRoomIDPaginated(chatRoomID gocql.UUID, limit int, pageState []byte) ([]models.Message, []byte, error)
}

type messageRepository struct {
	db *database.CassandraDB
}

func NewMessageRepository(db *database.CassandraDB) MessageRepository {
	return &messageRepository{db: db}
}

func (r *messageRepository) Create(message *models.Message) error {
	// Generate a TimeUUID for message_id if not set
	if message.MessageID.Time().IsZero() {
		message.MessageID = gocql.TimeUUID()
	}
	if message.SentAt.IsZero() {
		message.SentAt = time.Now()
	}

	return r.db.Session.Query(`
		INSERT INTO messages (chat_room_id, message_id, sender_id, content, sent_at)
		VALUES (?, ?, ?, ?, ?)`,
		message.ChatRoomID,
		message.MessageID,
		message.SenderID,
		message.Content,
		message.SentAt,
	).Exec()
}

func (r *messageRepository) GetByChatRoomID(chatRoomID gocql.UUID, limit int) ([]models.Message, error) {
	var messages []models.Message
	iter := r.db.Session.Query(`
		SELECT chat_room_id, message_id, sender_id, content, sent_at
		FROM messages
		WHERE chat_room_id = ?
		LIMIT ?`,
		chatRoomID,
		limit,
	).Iter()

	var msg models.Message
	for iter.Scan(
		&msg.ChatRoomID,
		&msg.MessageID,
		&msg.SenderID,
		&msg.Content,
		&msg.SentAt,
	) {
		messages = append(messages, msg)
	}

	if err := iter.Close(); err != nil {
		return nil, err
	}
	return messages, nil
}

func (r *messageRepository) GetByChatRoomIDPaginated(chatRoomID gocql.UUID, limit int, pageState []byte) ([]models.Message, []byte, error) {
	var messages []models.Message

	query := r.db.Session.Query(`
		SELECT chat_room_id, message_id, sender_id, content, sent_at
		FROM messages
		WHERE chat_room_id = ?`,
		chatRoomID,
	).PageSize(limit)

	if len(pageState) > 0 {
		query = query.PageState(pageState)
	}

	iter := query.Iter()

	var msg models.Message
	for iter.Scan(
		&msg.ChatRoomID,
		&msg.MessageID,
		&msg.SenderID,
		&msg.Content,
		&msg.SentAt,
	) {
		messages = append(messages, msg)
	}

	nextPageState := iter.PageState()

	if err := iter.Close(); err != nil {
		return nil, nil, err
	}

	return messages, nextPageState, nil
}
