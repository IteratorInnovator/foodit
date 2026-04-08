package main

import (
	"fmt"
	"log"
	"time"

	"github.com/aws/aws-sigv4-auth-cassandra-gocql-driver-plugin/sigv4"
	"github.com/gocql/gocql"
)

// Configuration
const (
	awsRegion    = "ap-southeast-1"
	keyspaceName = "FoodIT"
	host         = "cassandra.ap-southeast-1.amazonaws.com"
	port         = 9142
)

// Mock data IDs
const (
	buyerID    = "893a852c-80f1-70b8-0387-32fc6eaf8c36"
	runnerID   = "699ac51c-e0b1-7001-4a36-9787c29c4afa"
	chatRoomID = "c0000000-0000-0000-0000-000000000001"
	orderID    = "10000000-0000-0000-0000-000000000001"
)

func main() {
	session, err := createSession()
	if err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}
	defer session.Close()

	fmt.Println("Connected to AWS Keyspaces")

	// Clear existing data
	truncateTables(session)

	// Wait for truncate to complete
	fmt.Println("Waiting for truncate to complete...")
	time.Sleep(5 * time.Second)

	// Insert mock data
	insertChatRoom(session)
	insertChatRoomsByUser(session)
	insertMessages(session)

	// Verify
	verifyData(session)

	fmt.Println("\nDone!")
}

func createSession() (*gocql.Session, error) {
	cluster := gocql.NewCluster(host)
	cluster.Keyspace = keyspaceName
	cluster.Port = port
	cluster.Consistency = gocql.LocalQuorum
	cluster.Timeout = 30 * time.Second
	cluster.ConnectTimeout = 30 * time.Second
	cluster.DisableInitialHostLookup = true

	// SigV4 authentication
	auth := sigv4.NewAwsAuthenticator()
	auth.Region = awsRegion
	cluster.Authenticator = auth

	// TLS configuration
	cluster.SslOpts = &gocql.SslOptions{
		EnableHostVerification: false,
	}

	return cluster.CreateSession()
}

func truncateTables(session *gocql.Session) {
	tables := []string{"chat_rooms", "chat_rooms_by_user", "messages"}
	for _, table := range tables {
		fmt.Printf("Truncating %s...\n", table)
		if err := session.Query(fmt.Sprintf("TRUNCATE %s", table)).Exec(); err != nil {
			fmt.Printf("  Warning: Could not truncate %s: %v\n", table, err)
		}
	}
}

func insertChatRoom(session *gocql.Session) {
	fmt.Println("Inserting chat_rooms...")
	query := `INSERT INTO chat_rooms (chat_room_id, order_id, buyer_id, runner_id, status, created_at)
		VALUES (?, ?, ?, ?, ?, ?)`

	chatRoomUUID, _ := gocql.ParseUUID(chatRoomID)
	orderUUID, _ := gocql.ParseUUID(orderID)
	buyerUUID, _ := gocql.ParseUUID(buyerID)
	runnerUUID, _ := gocql.ParseUUID(runnerID)
	createdAt, _ := time.Parse(time.RFC3339, "2024-03-25T10:00:00Z")

	if err := session.Query(query, chatRoomUUID, orderUUID, buyerUUID, runnerUUID, "active", createdAt).Exec(); err != nil {
		log.Fatalf("Failed to insert chat_rooms: %v", err)
	}
}

func insertChatRoomsByUser(session *gocql.Session) {
	query := `INSERT INTO chat_rooms_by_user (user_id, chat_room_id, created_at, order_id, status)
		VALUES (?, ?, ?, ?, ?)`

	chatRoomUUID, _ := gocql.ParseUUID(chatRoomID)
	orderUUID, _ := gocql.ParseUUID(orderID)
	buyerUUID, _ := gocql.ParseUUID(buyerID)
	runnerUUID, _ := gocql.ParseUUID(runnerID)
	createdAt, _ := time.Parse(time.RFC3339, "2024-03-25T10:00:00Z")

	fmt.Println("Inserting chat_rooms_by_user (buyer)...")
	if err := session.Query(query, buyerUUID, chatRoomUUID, createdAt, orderUUID, "active").Exec(); err != nil {
		log.Fatalf("Failed to insert chat_rooms_by_user (buyer): %v", err)
	}

	fmt.Println("Inserting chat_rooms_by_user (runner)...")
	if err := session.Query(query, runnerUUID, chatRoomUUID, createdAt, orderUUID, "active").Exec(); err != nil {
		log.Fatalf("Failed to insert chat_rooms_by_user (runner): %v", err)
	}
}

func insertMessages(session *gocql.Session) {
	fmt.Println("Inserting messages...")

	query := `INSERT INTO messages (chat_room_id, message_id, sender_id, content, sent_at)
		VALUES (?, ?, ?, ?, ?)`

	chatRoomUUID, _ := gocql.ParseUUID(chatRoomID)
	buyerUUID, _ := gocql.ParseUUID(buyerID)
	runnerUUID, _ := gocql.ParseUUID(runnerID)

	messages := []struct {
		senderID gocql.UUID
		content  string
		sentAt   string
	}{
		{runnerUUID, "Hi! I accepted your order.", "2024-03-25T10:01:00Z"},
		{buyerUUID, "Great! How long will it take?", "2024-03-25T10:02:00Z"},
		{runnerUUID, "About 20 minutes.", "2024-03-25T10:03:00Z"},
		{buyerUUID, "Perfect, thanks!", "2024-03-25T10:04:00Z"},
	}

	for _, msg := range messages {
		sentAt, _ := time.Parse(time.RFC3339, msg.sentAt)
		messageID := gocql.TimeUUID()

		if err := session.Query(query, chatRoomUUID, messageID, msg.senderID, msg.content, sentAt).Exec(); err != nil {
			log.Fatalf("Failed to insert message: %v", err)
		}
		fmt.Printf("  Inserted: %s\n", msg.content)
	}
}

func verifyData(session *gocql.Session) {
	fmt.Println("\nVerifying data...")

	// Verify chat_rooms
	var count int
	if err := session.Query("SELECT COUNT(*) FROM chat_rooms").Scan(&count); err == nil {
		fmt.Printf("chat_rooms: %d row(s)\n", count)
	}

	// Verify chat_rooms_by_user
	if err := session.Query("SELECT COUNT(*) FROM chat_rooms_by_user").Scan(&count); err == nil {
		fmt.Printf("chat_rooms_by_user: %d row(s)\n", count)
	}

	// Verify messages
	chatRoomUUID, _ := gocql.ParseUUID(chatRoomID)
	iter := session.Query("SELECT sender_id, content FROM messages WHERE chat_room_id = ?", chatRoomUUID).Iter()
	var senderID gocql.UUID
	var content string
	msgCount := 0
	fmt.Println("messages:")
	for iter.Scan(&senderID, &content) {
		fmt.Printf("  %s: %s\n", senderID.String()[:8], content)
		msgCount++
	}
	fmt.Printf("Total: %d message(s)\n", msgCount)
	iter.Close()
}
