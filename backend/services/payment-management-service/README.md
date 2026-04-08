# Payment Management Service

A microservice that handles payment-related operations in response to order lifecycle events. This service subscribes to Kafka events published by the Order Management Service and orchestrates payment transfers and refunds.

## Overview

The Payment Management Service is responsible for:

1. **Processing completed orders** (`order.completed`): Transfers the runner's fee to the runner's Stripe Connect account
2. **Processing MIA (Missing in Action) orders** (`order.mia`): Issues a full refund to the buyer

## Architecture

```
┌─────────────────────────┐
│ Order Management Service│
│    (Event Publisher)    │
└───────────┬─────────────┘
            │ Kafka Events
            ▼
┌─────────────────────────┐
│ Payment Management Svc  │
│    (Event Consumer)     │
└─────┬───────────┬───────┘
      │           │
      ▼           ▼
┌───────────┐ ┌─────────────┐
│User Service│ │Payment Svc │
│(Stripe IDs)│ │(Transfers/ │
│            │ │ Refunds)   │
└───────────┘ └─────────────┘
```

## Event Payloads

### `order.completed`

Published when an order is successfully completed and delivered.

```json
{
  "event_type": "order.completed",
  "order_id": "550e8400-e29b-41d4-a716-446655440000",
  "buyer_id": "123e4567-e89b-12d3-a456-426614174000",
  "runner_id": "987fcdeb-51a2-3c4d-e5f6-789012345678",
  "amount": 5.00,
  "payment_intent_id": "pi_3abc123def456",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `event_type` | string | Always `"order.completed"` |
| `order_id` | string (UUID) | Unique identifier of the order |
| `buyer_id` | string (UUID) | User ID of the buyer |
| `runner_id` | string (UUID) | User ID of the runner who delivered the order |
| `amount` | float | Runner payout amount (`food_cost + delivery_fee`) in SGD major units |
| `payment_intent_id` | string | Stripe PaymentIntent ID |
| `timestamp` | string (ISO 8601) | When the event was published |

**Processing Flow:**
1. Fetch runner's Stripe Connect ID from User Service (`GET /api/users/{runner_id}/stripe/connect`)
2. Create transfer via Payment Service (`POST /transfers/create`)

### `order.mia`

Published when a runner goes missing during delivery (order not delivered).

```json
{
  "event_type": "order.mia",
  "order_id": "550e8400-e29b-41d4-a716-446655440000",
  "buyer_id": "123e4567-e89b-12d3-a456-426614174000",
  "runner_id": "987fcdeb-51a2-3c4d-e5f6-789012345678",
  "payment_intent_id": "pi_3abc123def456",
  "timestamp": "2024-01-15T11:45:00Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `event_type` | string | Always `"order.mia"` |
| `order_id` | string (UUID) | Unique identifier of the order |
| `buyer_id` | string (UUID) | User ID of the buyer to refund |
| `runner_id` | string (UUID) | User ID of the runner (for logging) |
| `payment_intent_id` | string | Stripe PaymentIntent ID to refund |
| `timestamp` | string (ISO 8601) | When the event was published |

**Processing Flow:**
1. Create full refund via Payment Service (`POST /refunds/create`)

## Dependencies

### User Service

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/users/{user_id}/stripe/connect` | GET | Fetch runner's Stripe Connect account ID |
| `/api/users/{user_id}/stripe/customer` | GET | Fetch buyer's Stripe Customer ID |

### Payment Service

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/transfers/create` | POST | Create a transfer to a Stripe Connect account |
| `/refunds/create` | POST | Create a refund for a PaymentIntent |

## Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `KAFKA_BROKERS` | Comma-separated list of Kafka brokers | - |
| `KAFKA_GROUP_ID` | Kafka consumer group ID | `payment-management-group` |
| `MSK_AUTH_MECHANISM` | Authentication: `none`, `iam`, or `scram` | `none` |
| `AWS_REGION` | AWS region for MSK IAM auth | - |
| `MSK_USERNAME` | SCRAM username (if using SCRAM) | - |
| `MSK_PASSWORD` | SCRAM password (if using SCRAM) | - |
| `USER_SERVICE_URL` | Base URL of the User Service | - |
| `PAYMENT_SERVICE_URL` | Base URL of the Payment Service | - |

## Running Locally

1. Copy the environment example file:
   ```bash
   cp .env.example .env
   ```

2. Update `.env` with your configuration.

3. Run the service:
   ```bash
   go run cmd/main.go
   ```

## Running with Docker

```bash
docker build -t payment-management-service .
docker run --env-file .env payment-management-service
```

## Project Structure

```
foodit-payment-management-service/
├── cmd/
│   └── main.go              # Entry point
├── internal/
│   ├── clients/
│   │   ├── user_client.go   # HTTP client for User Service
│   │   └── payment_client.go# HTTP client for Payment Service
│   ├── config/
│   │   └── config.go        # Configuration loading
│   ├── kafka/
│   │   ├── consumer.go      # Kafka consumer implementation
│   │   ├── handlers.go      # Event handlers
│   │   └── topics.go        # Topic constants
│   └── models/
│       └── events.go        # Event and API models
├── .env.example
├── .gitignore
├── .gitlab-ci.yml
├── Dockerfile
├── go.mod
├── go.sum
└── README.md
```

## Error Handling

The service implements defensive error handling:

- **Missing required fields**: Events with missing `runner_id`, `buyer_id`, `payment_intent_id`, or invalid amounts are logged and skipped
- **Service failures**: Failures from User Service or Payment Service are logged with full context
- **Panic recovery**: Each handler includes panic recovery to prevent crashes

## Logging

The service uses structured JSON logging with `slog`. Key log fields:

- `service`: The service that produced the log (e.g., `payment-management`, `user-service`, `payment-service`)
- `event_type`: The Kafka topic/event type being processed
- `order_id`: Order identifier for correlation
- `error`: Error details when applicable
