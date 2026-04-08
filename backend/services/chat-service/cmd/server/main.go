package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/redis/go-redis/v9"
	"gitlab.com/esd-g6-team1-tanzu/chat-service/internal/config"
	"gitlab.com/esd-g6-team1-tanzu/chat-service/internal/database"
	"gitlab.com/esd-g6-team1-tanzu/chat-service/internal/routes"
	"gitlab.com/esd-g6-team1-tanzu/chat-service/internal/websocket"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// Initialize Cassandra connection
	db, err := database.NewCassandraDB(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to Cassandra: %v", err)
	}
	defer db.Close()

	// Initialize Redis connection for cross-instance messaging
	redisClient := redis.NewClient(&redis.Options{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPassword,
		DB:       cfg.RedisDB,
	})

	// Verify Redis connection
	ctx := context.Background()
	if err := redisClient.Ping(ctx).Err(); err != nil {
		log.Printf("Warning: Redis connection failed: %v. Running in single-instance mode.", err)
		redisClient = nil
	} else {
		log.Printf("Connected to Redis at %s", cfg.RedisAddr)
		defer redisClient.Close()
	}

	// Initialize WebSocket hub
	hub := websocket.NewHub()

	// Set up Redis pub/sub if Redis is available
	var redisPubSub *websocket.RedisPubSub
	if redisClient != nil {
		redisPubSub = websocket.NewRedisPubSub(redisClient, hub)
		hub.SetRedisPubSub(redisPubSub)
		defer redisPubSub.Close()
	}

	go hub.Run()

	// Create Fiber app
	app := fiber.New(fiber.Config{
		AppName: "Chat Service",
	})

	// Middleware
	app.Use(logger.New())
	app.Use(recover.New())
	app.Use(cors.New())

	// Setup routes
	routes.Setup(app, db, hub)

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan
		log.Println("Shutting down server...")
		app.Shutdown()
		db.Close()
	}()

	// Start server
	addr := ":" + cfg.ServerPort
	log.Printf("Chat service starting on %s", addr)
	if err := app.Listen(addr); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
