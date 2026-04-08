# Foodit — chat-service

Real-time messaging between buyers and runners using WebSockets and AWS Keyspaces (Apache Cassandra). Supports multi-instance deployment with Redis pub/sub for cross-instance message broadcasting.

Part of the [Foodit Backend Platform](https://gitlab.com/esd-g6-team1-tanzu/infra).

## Project Structure

```
chat-service/
├── cmd/
│   └── server/
│       └── main.go                # Application entry point
├── internal/
│   ├── config/
│   │   └── config.go              # Environment configuration
│   ├── database/
│   │   └── cassandra.go           # AWS Keyspaces connection & schema init
│   ├── handlers/
│   │   ├── message_handler.go     # REST API for messages
│   │   └── room_handler.go        # REST API for chat rooms
│   ├── models/
│   │   ├── chat_room.go           # ChatRoom, ChatRoomByUser models
│   │   ├── message.go             # Message model
│   │   └── websocket.go           # WebSocket message models
│   ├── repository/
│   │   ├── chat_room.go           # Chat room data access
│   │   └── message.go             # Message data access
│   ├── routes/
│   │   └── routes.go              # HTTP router setup
│   └── websocket/
│       ├── client.go              # WebSocket client (read/write pumps)
│       ├── handler.go             # WebSocket upgrade handler
│       ├── hub.go                 # Room-based message broadcasting
│       ├── redis.go               # Redis pub/sub for cross-instance messaging
│       ├── hub_test.go            # Hub unit tests
│       └── redis_test.go          # Redis pub/sub unit tests
├── api/
│   ├── chat.http                  # REST API test requests
│   ├── chat-manual.http           # Manual API test requests
│   └── websocket-test.html        # Interactive WebSocket testing UI
├── scripts/
│   └── seed_mock_data.go          # Seed test data to Cassandra
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── go.mod
├── go.sum
└── .gitlab-ci.yml
```

## Getting Started

```bash
# Install dependencies
go mod download

# Configure environment
cp .env.example .env
# Edit .env with your AWS credentials

# Run locally
go run ./cmd/server

# Build binary
go build -o chat-service ./cmd/server

# Build Docker image
docker build -t chat-service .
docker run -p 8080:8080 --env-file .env chat-service

# Or use Docker Compose (includes Redis)
docker-compose up
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SERVER_PORT` | HTTP server port | `8080` |
| `AWS_REGION` | AWS region | `ap-southeast-1` |
| `AWS_ACCESS_KEY_ID` | AWS access key | — |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | — |
| `CASSANDRA_HOSTS` | Keyspaces endpoint | `cassandra.ap-southeast-1.amazonaws.com` |
| `CASSANDRA_PORT` | Keyspaces port | `9142` |
| `CASSANDRA_KEYSPACE` | Keyspace name | `chat_service` |
| `REDIS_ADDR` | Redis connection address (optional) | `localhost:6379` |
| `REDIS_PASSWORD` | Redis password (optional) | — |
| `REDIS_DB` | Redis database number (optional) | `0` |

## API Endpoints

### REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/chat/rooms` | Create a chat room |
| `GET` | `/api/chat/rooms/id/:chat_room_id` | Get a chat room by ID |
| `GET` | `/api/chat/rooms/:user_id` | Get chat rooms for a user (paginated) |
| `PUT` | `/api/chat/rooms/:chat_room_id/close` | Close a chat room |
| `GET` | `/api/chat/rooms/:chat_room_id/messages` | Get message history (paginated) |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `WS /ws/chat/:chat_room_id?sender_id=<uuid>` | Establish WebSocket connection |

## API Reference

### POST /api/chat/rooms

Create a new chat room.

**Request:**
```json
{
  "order_id": "uuid",
  "buyer_id": "uuid",
  "runner_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "chat_room_id": "uuid"
}
```

### GET /api/chat/rooms/:user_id

Fetch chat rooms for a user with pagination.

**Query Parameters:**
- `limit` (optional): Number of rooms to fetch (default: 20)
- `page_state` (optional): Pagination token

**Response:**
```json
{
  "chat_rooms": [
    {
      "chat_room_id": "uuid",
      "order_id": "uuid",
      "status": "open",
      "created_at": "2026-03-01T12:00:00Z"
    }
  ],
  "next_page_state": "base64token",
  "has_more": true
}
```

### PUT /api/chat/rooms/:chat_room_id/close

Close a chat room.

**Response:**
```json
{
  "success": true
}
```

### GET /api/chat/rooms/:chat_room_id/messages

Fetch paginated message history.

**Query Parameters:**
- `limit` (optional): Number of messages to fetch (default: 50)
- `page_state` (optional): Pagination token

**Response:**
```json
{
  "messages": [
    {
      "message_id": "uuid",
      "sender_id": "uuid",
      "content": "Hello!",
      "sent_at": "2026-03-01T12:05:00Z"
    }
  ],
  "next_page_state": "base64token",
  "has_more": true
}
```

### WebSocket /ws/chat/:chat_room_id

Establish a WebSocket connection for real-time chat.

**Query Parameters:**
- `sender_id` (required): UUID of the connecting user

**Connection Response:**
```json
{
  "chat_room_id": "uuid",
  "status": "open"
}
```

**Client → Server (sendMessage):**
```json
{
  "action": "sendMessage",
  "chat_room_id": "uuid",
  "content": "I am on my way!"
}
```

**Server → Client (receiveMessage):**
```json
{
  "action": "receiveMessage",
  "message_id": "uuid",
  "sender_id": "uuid",
  "content": "I am on my way!",
  "sent_at": "2026-03-01T12:05:00Z"
}
```

## Testing

### 1. Start the server

```bash
go run ./cmd/server
```

### 2. Create a chat room

```bash
curl -X POST http://localhost:8080/api/chat/rooms \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "11111111-1111-1111-1111-111111111111",
    "buyer_id": "22222222-2222-2222-2222-222222222222",
    "runner_id": "33333333-3333-3333-3333-333333333333"
  }'
```

Note the `chat_room_id` from the response.

### 3. Test WebSocket with wscat

Install wscat:
```bash
npm install -g wscat
```

Connect as buyer (Terminal 1):
```bash
wscat -c "ws://localhost:8080/ws/chat/<chat_room_id>?sender_id=22222222-2222-2222-2222-222222222222"
```

Connect as runner (Terminal 2):
```bash
wscat -c "ws://localhost:8080/ws/chat/<chat_room_id>?sender_id=33333333-3333-3333-3333-333333333333"
```

### 4. Send a message

In either terminal:
```json
{"action": "sendMessage", "chat_room_id": "<chat_room_id>", "content": "Hello!"}
```

Both terminals should receive the message.

### 5. Verify message persistence

```bash
curl "http://localhost:8080/api/chat/rooms/<chat_room_id>/messages"
```

## Database Schema

Tables are created automatically on startup:

```cql
CREATE TABLE chat_rooms (
    chat_room_id UUID,
    order_id UUID,
    buyer_id UUID,
    runner_id UUID,
    status TEXT,
    created_at TIMESTAMP,
    closed_at TIMESTAMP,
    PRIMARY KEY (chat_room_id)
);

CREATE TABLE messages (
    chat_room_id UUID,
    message_id TIMEUUID,
    sender_id UUID,
    content TEXT,
    sent_at TIMESTAMP,
    PRIMARY KEY ((chat_room_id), message_id)
) WITH CLUSTERING ORDER BY (message_id DESC);

CREATE TABLE chat_rooms_by_user (
    user_id UUID,
    chat_room_id UUID,
    created_at TIMESTAMP,
    order_id UUID,
    status TEXT,
    PRIMARY KEY ((user_id), chat_room_id, created_at)
) WITH CLUSTERING ORDER BY (chat_room_id ASC, created_at DESC);
```

## AWS Keyspaces Setup

1. Create a keyspace in AWS Console (managed by Terraform)
2. Ensure your IAM user/role has `AmazonKeyspacesFullAccess` permission
3. Configure credentials in `.env`
4. Tables are created automatically on startup
