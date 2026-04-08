package api

import (
	"gitlab.com/esd-g6-team1-tanzu/order-service/api/handlers"

	"github.com/gofiber/fiber/v3"
)

func SetupRoutes(app *fiber.App, orderHandler *handlers.OrderHandler) {
	api := app.Group("/api")

	orders := api.Group("/orders")
	orders.Get("/", orderHandler.GetOrders)
	orders.Get("/pending", orderHandler.GetPendingOrders)
	orders.Get("/:id", orderHandler.GetOrder)
	orders.Post("/", orderHandler.CreateOrder)
	orders.Put("/:id", orderHandler.UpdateOrder)
	orders.Put("/:id/accept", orderHandler.AcceptOrder)
	orders.Put("/:id/cancel", orderHandler.CancelOrder)
	orders.Delete("/:id", orderHandler.DeleteOrder)
}
