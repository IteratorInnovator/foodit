# Foodit — User Service

Go microservice for reading user data from DynamoDB. This is a **read-only** service; user creation is handled by an AWS Lambda Cognito post-confirmation trigger.

Part of the [Foodit Backend Platform](https://gitlab.com/esd-g6-team1-tanzu/infra).

## Project Structure

```
user-service/
├── main.go                 # Application entry point
├── config/
│   └── config.go           # Environment configuration
├── models/
│   └── user.go             # User and UserProfile structs
├── repository/
│   └── users.go            # DynamoDB operations
├── handlers/
│   └── users.go            # HTTP handlers
├── tests/
│   └── api.http            # Manual API testing
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── .gitignore
├── .gitlab-ci.yml
├── go.mod
└── go.sum
```

## Tech Stack

- **Framework**: [Fiber v3](https://github.com/gofiber/fiber)
- **Database**: AWS DynamoDB
- **SDK**: [aws-sdk-go-v2](https://github.com/aws/aws-sdk-go-v2)

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | Public | Health check |
| GET | `/api/users/:user_id` | Public | Get user profile (excludes Stripe fields) |
| GET | `/api/users/:user_id/stripe/customer` | Public | Get user Stripe customer ID |
| GET | `/api/users/:user_id/stripe/connect` | Public | Get user Stripe connect ID |

### Response Examples

**GET /api/users/:user_id**
```json
{
  "user_id": "499a851c-a031-708e-3234-4cc69eb4ddb3",
  "created_at": "2026-02-13T06:18:53.111Z",
  "email": "user@example.com",
  "name": "John Doe",
  "picture": "https://example.com/photo.jpg"
}
```

**GET /api/users/:user_id/stripe/customer**
```json
{
  "stripe_customer_id": "cus_xxx"
}
```

## Getting Started

### Prerequisites

- Go 1.25+
- AWS credentials with DynamoDB read access

### Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `AWS_ACCESS_KEY_ID` | AWS access key (optional if using IAM role) |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key (optional if using IAM role) |
| `AWS_REGION` | AWS region |
| `DYNAMODB_TABLE_NAME` | DynamoDB table name |
| `PORT` | Server port |

### Run Locally

```bash
# Install dependencies
go mod download

# Run the service
go run main.go
```

### Run with Docker

```bash
# Build image
docker build -t user-service .

# Run container
docker run -p 8080:80 --env-file .env user-service
```

## DynamoDB Schema

Table: `users`

| Attribute | Type | Description |
|-----------|------|-------------|
| `user_id` | String (PK) | UUID |
| `created_at` | String | ISO 8601 timestamp |
| `email` | String | User email |
| `name` | String | Display name |
| `picture` | String | Profile picture URL |
| `stripe_customer_id` | String | Stripe customer ID (optional) |
| `stripe_connect_id` | String | Stripe connect ID (optional) |

## Testing

Use the HTTP test file with VS Code REST Client or IntelliJ HTTP Client:

```
tests/api.http
```
