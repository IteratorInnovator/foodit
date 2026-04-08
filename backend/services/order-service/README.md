# Order Service

A microservice for managing orders, built with Go, Fiber, and DynamoDB.

## Prerequisites

- Go 1.25+
- Docker

## Quick Start

### 1. Create your .env file

```bash
cp .env.example .env
```

### 2. Install dependencies and run

```bash
go mod download
go run cmd/server/main.go
```

You should see:
```
DynamoDB connected successfully
Order Service starting on port 8080
```

## Project Structure

```
order-service/
├── api/
│   ├── routes.go              # Route definitions
│   └── handlers/
│       └── order.go           # HTTP handlers (parse request, return response)
├── cmd/
│   └── server/
│       └── main.go            # Application entry point, wires all layers
├── internal/
│   ├── config/                # Configuration loading from .env
│   ├── database/              # DynamoDB client setup and table creation
│   ├── models/                # Data models (Order, OrderItem, DropOff)
│   ├── repository/            # Data access layer (DynamoDB CRUD operations)
│   └── service/               # Business logic, validation, orchestration
├── .dockerignore
├── .gitignore
├── .gitlab-ci.yml
├── Dockerfile
├── docker-compose.yml
├── go.mod
├── go.sum
├── test.html
└── README.md
```

## DynamoDB Schema

### Table: orders

| Column Name | Type | Role | Description |
|-------------|------|------|-------------|
| order_id | String | Partition Key | Unique identifier for the order (UUID) |
| buyer_id | String | Regular | Unique user ID of the buyer |
| runner_id | String | Regular | Unique user ID of the runner |
| status | String | Regular | Current state: PENDING, ACCEPTED, COMPLETED, CANCELLED, MIA |
| menu_store_id | String | Regular | Unique ID of the restaurant/store providing the item |
| items | List\<Map\> | Regular | List of { menu_item_id, name, quantity, unit_price } |
| description | String | Optional | Optional delivery note attached at order creation |
| food_cost | Number | Regular | Total food cost in cents |
| delivery_fee | Number | Regular | Delivery fee in cents |
| platform_fee | Number | Regular | Fixed platform fee in cents ($0.10). Locked at order creation |
| drop_off | Map | Regular | Buyer's delivery location: { lat, lng, address } |
| created_at | String | Regular | ISO8601 timestamp, GSI sort key for time-range queries |
| payment_intent_id | String | Regular | Stripe Payment Intent ID. Required for refunds |

### GSI: status-created_at-index

| Key | Attribute | Purpose |
|-----|-----------|---------|
| Partition Key | status | Query orders by status |
| Sort Key | created_at | Sort by creation time (newest first) |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Health check |
| GET | /api/orders | Get all orders |
| GET | /api/orders/pending | Get orders with PENDING status |
| GET | /api/orders/:id | Get order by ID |
| POST | /api/orders | Create new order |
| PUT | /api/orders/:id | Update order status and runner |
| PUT | /api/orders/:id/accept | Accept an order (assign runner) |
| PUT | /api/orders/:id/cancel | Cancel an order |
| DELETE | /api/orders/:id | Delete order |

### Example: Create an order

```bash
curl -X POST http://localhost:8080/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "buyer_id": "buyer-001",
    "menu_store_id": "store-001",
    "items": [
      { "menu_item_id": "item-001", "name": "Nasi Lemak", "quantity": 2, "unit_price": 500 },
      { "menu_item_id": "item-002", "name": "Teh Tarik", "quantity": 1, "unit_price": 200 }
    ],
    "description": "Leave at lobby if I do not answer",
    "food_cost": 1200,
    "delivery_fee": 350,
    "drop_off": {
      "lat": 1.3521,
      "lng": 103.8198,
      "address": "80 Stamford Rd, Singapore 178902"
    },
    "payment_intent_id": "pi_test_123456"
  }'
```

`description` is optional. Omit it if there are no delivery notes.

### Example: Accept an order

```bash
curl -X PUT http://localhost:8080/api/orders/<order_id>/accept \
  -H "Content-Type: application/json" \
  -d '{ "runner_id": "runner-001" }'
```

### Example: Cancel an order

```bash
curl -X PUT http://localhost:8080/api/orders/<order_id>/cancel
```

### Example: Get pending orders

```bash
curl http://localhost:8080/api/orders/pending
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 8080 | Server port |
| AWS_REGION | ap-southeast-1 | AWS region |
| ORDERS_TABLE_NAME | orders | DynamoDB table name |

## Docker

### Build and run

```bash
docker build -t order-service .
docker run -p 8080:8080 \
  -e AWS_REGION=ap-southeast-1 \
  -e ORDERS_TABLE_NAME=orders \
  order-service
```

## Testing

Open `test.html` in a browser to use the visual API tester, or use curl/Postman against `http://localhost:8080`.
