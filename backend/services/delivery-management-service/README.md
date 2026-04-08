# Delivery Management Service

FoodIT's composite microservice that subscribes to Apache Kafka/AWS MSK events and orchestrates Chat Service and Location Service to manage the lifecycle of an active delivery session.

## Event Flows

### order.accepted

When an order is accepted by a runner:

1. **Create Chat Room** - `POST /chat/rooms` with `{ order_id, buyer_id, runner_id }`
2. **Create Location Session** - `POST /location/sessions` with `{ order_id, buyer_id, runner_id }`

### order.completed / order.mia

When an order is completed or marked as MIA:

1. **Close Location Session** - `PUT /location/sessions/:session_id/close`

## Event Payloads

### OrderAcceptedEvent

```json
{
  "order_id": "uuid",
  "buyer_id": "uuid",
  "runner_id": "uuid"
}
```

### OrderCompletedEvent / OrderMiaEvent

```json
{
  "order_id": "uuid",
  "buyer_id": "uuid",
  "runner_id": "uuid"
}
```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `KAFKA_BROKERS` | Comma-separated list of Kafka/MSK broker endpoints | Yes |
| `KAFKA_GROUP_ID` | Consumer group ID | Yes |
| `MSK_AUTH_MECHANISM` | Authentication: `none`, `iam`, or `scram` | Yes |
| `AWS_REGION` | AWS region (required for IAM auth) | For IAM |
| `MSK_USERNAME` | SCRAM username | For SCRAM |
| `MSK_PASSWORD` | SCRAM password | For SCRAM |
| `CHAT_SERVICE_URL` | Chat Service base URL | Yes |
| `LOCATION_SERVICE_URL` | Location Service base URL | Yes |

### Example Configurations

**Local Development (no auth):**

```env
KAFKA_BROKERS=localhost:9092
KAFKA_GROUP_ID=delivery-management-group
MSK_AUTH_MECHANISM=none
CHAT_SERVICE_URL=http://localhost:8081
LOCATION_SERVICE_URL=http://localhost:8082
```

**AWS MSK with IAM Authentication:**

```env
KAFKA_BROKERS=b-1.mycluster.xxx.kafka.us-east-1.amazonaws.com:9098,b-2.mycluster.xxx.kafka.us-east-1.amazonaws.com:9098
KAFKA_GROUP_ID=delivery-management-group
MSK_AUTH_MECHANISM=iam
AWS_REGION=us-east-1
CHAT_SERVICE_URL=http://chat-service:8080
LOCATION_SERVICE_URL=http://location-service:8080
```

**AWS MSK with SCRAM Authentication:**

```env
KAFKA_BROKERS=b-1.mycluster.xxx.kafka.us-east-1.amazonaws.com:9096,b-2.mycluster.xxx.kafka.us-east-1.amazonaws.com:9096
KAFKA_GROUP_ID=delivery-management-group
MSK_AUTH_MECHANISM=scram
MSK_USERNAME=my-user
MSK_PASSWORD=my-secret-password
CHAT_SERVICE_URL=http://chat-service:8080
LOCATION_SERVICE_URL=http://location-service:8080
```

## Project Structure

```
delivery-management/
├── cmd/
│   └── main.go                 # Entry point, initializes config and starts consumers
├── internal/
│   ├── config/
│   │   └── config.go           # Environment variable configuration
│   ├── kafka/
│   │   ├── consumer.go         # Kafka consumer with MSK auth support
│   │   ├── topics.go           # Topic name constants
│   │   └── handlers.go         # Event handler functions
│   ├── clients/
│   │   ├── chat_client.go      # HTTP client for Chat Service
│   │   └── location_client.go  # HTTP client for Location Service
│   └── models/
│       └── events.go           # Kafka event payload structs
├── Dockerfile
├── go.mod
├── go.sum
├── .env.example
├── .gitignore
└── .gitlab-ci.yml
```

## Running Locally

### Prerequisites

- Go 1.21+
- Docker (optional)
- Kafka running locally or AWS MSK access

### Run with Go

```bash
# Copy and configure environment
cp .env.example .env
# Edit .env with your configuration

# Run the service
go run ./cmd/main.go
```

### Run with Docker

```bash
# Build image
docker build -t delivery-management-service .

# Run container
docker run --env-file .env delivery-management-service
```

## Graceful Shutdown

The service handles `SIGTERM` and `SIGINT` signals for graceful shutdown:

1. Stops accepting new messages
2. Waits for in-flight handlers to complete
3. Commits final offsets to Kafka
4. Closes all connections

## Tech Stack

- **Language**: Go 1.21
- **Kafka Client**: github.com/twmb/franz-go (with MSK IAM auth via pkg/sasl/aws)
- **HTTP Client**: net/http with 5-second timeout
- **Logging**: log/slog (structured JSON logging)
