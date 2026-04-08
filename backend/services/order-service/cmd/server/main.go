package main

import (
	"log"

	"gitlab.com/esd-g6-team1-tanzu/order-service/api"
	"gitlab.com/esd-g6-team1-tanzu/order-service/api/handlers"
	"gitlab.com/esd-g6-team1-tanzu/order-service/internal/config"
	"gitlab.com/esd-g6-team1-tanzu/order-service/internal/database"
	"gitlab.com/esd-g6-team1-tanzu/order-service/internal/repository"
	"gitlab.com/esd-g6-team1-tanzu/order-service/internal/service"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	_ "github.com/joho/godotenv/autoload"
)

func main() {
	// 1. Load config from .env
	cfg := config.Load()

	// 2. Connect to DynamoDB
	database.Connect(cfg)

	// 3. Wire up layers: repository → service → handler
	orderRepo := repository.NewOrderRepository(database.Client, cfg.OrdersTableName)
	orderSvc := service.NewOrderService(orderRepo)
	orderHandler := handlers.NewOrderHandler(orderSvc)

	// 4. Create Fiber app and register routes
	app := fiber.New(fiber.Config{
		AppName: "Order Service",
	})

	// CORS: allow any frontend origin to call this API
	app.Use(cors.New())

	api.SetupRoutes(app, orderHandler)

	app.Get("/health", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	log.Printf("Order Service starting on port %s", cfg.Port)
	log.Fatal(app.Listen(":" + cfg.Port))
}
