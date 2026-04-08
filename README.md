# Foodit

A cloud-native food delivery platform built on AWS, connecting buyers with runners via a microservices architecture.

## Authors

- Harry Ng Kok Jing
- Jared Chan Xu Yang
- Png Jun Wei
- Flash Teng Xin Huang
- Isabelle Ong Liwen

---

## Architecture Overview

```
Mobile/Web App (Expo + React Native)
        |
API Gateway (Cognito JWT auth)
        |
ALB (Application Load Balancer)
        |
EKS Fargate -- 9 Deployed Microservices
        |
AWS Managed Services
  - DynamoDB        (orders, users, menu_stores, menu_items, payments)
  - Keyspaces       (chat rooms, messages)
  - MSK Kafka       (order event bus)
  - ElastiCache     (Redis -- location tracking + chat pub/sub)
  - S3              (foodit-assets -- store/menu images)
  - Cognito         (user authentication)
  - Secrets Manager (Stripe API key)
  - Lambda          (Cognito post_confirmation trigger)
```

---

## Services

| Service | Language | Role |
|---------|----------|------|
| foodit-frontend | TypeScript / Expo SDK 54 | Cross-platform mobile + web app |
| order-service | Go 1.25 / Fiber v3 | Atomic CRUD for orders (DynamoDB) |
| user-service | Go 1.25 / Fiber v3 | User profiles and Stripe IDs (DynamoDB) |
| chat-service | Go 1.25 / Fiber v2 + WebSocket | Real-time messaging (Keyspaces + Redis) |
| payment-service | Python 3.11 / FastAPI | Stripe payments, transfers, refunds (DynamoDB) |
| location-service | Python 3.11 / FastAPI | Real-time GPS tracking (WebSocket + Redis) |
| foodit-menu-service | Python 3.11 / FastAPI | Store listings and menu items (DynamoDB) |
| order-management-service | Python 3.11 / FastAPI | Orchestrates checkout and order lifecycle (no DB) |
| foodit-delivery-management-service | Go 1.21 / stdlib | Kafka consumer -- spins up chat + location on order accepted |
| foodit-payment-management-service | Go 1.21 / stdlib | Kafka consumer -- handles fund transfers and refunds |
| infra | Terraform | AWS + Kubernetes infrastructure |

---

## Order Lifecycle

```
1. Buyer checks out
   Order Management -> User Service (get Stripe customer ID)
                    -> Payment Service (create PaymentIntent)
                    -> Order Service (create order -- PENDING)

2. Runner accepts
   Order Management -> Order Service (PENDING -> ACCEPTED)
                    -> Kafka: order.accepted

3. Kafka: order.accepted consumed by Delivery Management
   Delivery Management -> Chat Service (create chat room)
                       -> Location Service (create tracking session)

4. Active delivery
   Buyer & Runner <-> WebSocket (chat + GPS tracking)

5. Runner completes delivery
   Order Management -> Order Service (ACCEPTED -> COMPLETED)
                    -> Kafka: order.completed

6. Kafka: order.completed consumed by:
   Payment Management  -> User Service (get runner Stripe Connect ID)
                       -> Payment Service (transfer funds to runner)
   Delivery Management -> Location Service (close tracking session)
```

**Cancellation / MIA:**

- `order.cancelled` -- published by Order Management when buyer cancels a pending order
- `order.mia` -- Payment Management refunds buyer + Delivery Management closes location session

---

## Service Communication

```
Order Management (orchestrator -- no DB)
  -> User Service        GET  /api/users/{id}/stripe/customer
  -> Payment Service     POST /payments/create
  -> Order Service       POST /api/orders, PUT /api/orders/{id}
  -> Kafka               publishes order.accepted / completed / cancelled / mia

Delivery Management (Kafka consumer)
  -> Chat Service        POST /api/chat/rooms
  -> Location Service    POST /location/sessions, PUT /location/sessions/{id}/close

Payment Management (Kafka consumer)
  -> User Service        GET  /api/users/{id}/stripe/connect
  -> Payment Service     POST /transfers/create, POST /refunds/create
```

### ALB Ingress Routes

| Path | Service |
|------|---------|
| `/orders/*` | order-management-service |
| `/api/orders/*` | order-service |
| `/api/users/*` | user-service |
| `/payments/*`, `/buyers/*`, `/runners/*`, `/transactions/*`, `/transfers/*`, `/refunds/*` | payment-service |
| `/api/chat/*`, `/ws/chat/*` | chat-service |
| `/location/*`, `/ws/location` | location-service |
| `/stores/*` | foodit-menu-service |
| `/reviews/*` | OutSystems (redirect) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React Native, Expo SDK 54, TypeScript, AWS Amplify |
| Backend (atomic) | Go 1.25, Fiber v2/v3, Python 3.11, FastAPI |
| Backend (composite) | Go 1.21, Python 3.11, FastAPI |
| Auth | AWS Cognito + JWT |
| Databases | DynamoDB, AWS Keyspaces (Cassandra) |
| Messaging | Apache Kafka (AWS MSK Provisioned) |
| Cache / Pub-Sub | Redis (AWS ElastiCache) |
| Payments | Stripe Connect |
| Infra / Orchestration | Terraform, EKS Fargate, AWS API Gateway, ALB |
| CI/CD | GitLab CI |
| Containers | Docker, AWS ECR |

---

## Getting Started

### Prerequisites

- **AWS CLI** v2.x configured with `ap-southeast-1` region
- **Terraform** v1.5+ (for infrastructure deployment)
- **kubectl** (for Kubernetes management)
- **Docker** (for building container images)
- **Go 1.21+** (for Go services: order-service, user-service, chat-service, delivery-management, payment-management)
- **Python 3.11+** (for Python services: payment-service, location-service, menu-service, order-management)
- **Node.js 18+** and **Expo CLI** (for the frontend)
- **Stripe account** with test API key (stored in AWS Secrets Manager)

### Infrastructure Setup

All infrastructure is managed via Terraform. See `infra/README.md` for full deployment steps.

Quick summary:

```bash
cd infra/terraform
terraform init

# Import persistent resources (DynamoDB, Keyspaces, Cognito, S3, etc.)
# See infra/README.md for full import commands

terraform apply                              # ~25 min (MSK is the bottleneck)
terraform apply -var="enable_api_routes=true" # Enable API Gateway routes after ALB is up
```

After deployment, verify:

```bash
kubectl get pods -n foodit        # All 9 pods should be Running
curl http://$(terraform output -raw alb_dns)/health
```

### Running Individual Services Locally

Each service has its own README with detailed setup instructions. General pattern:

**Go services** (order-service, user-service, chat-service):
```bash
cd <service-directory>
cp .env.example .env   # Configure AWS credentials and service URLs
go mod download
go run ./cmd/server     # order-service, chat-service
go run main.go          # user-service
```

**Python services** (payment-service, location-service, menu-service, order-management):
```bash
cd <service-directory>
cp .env.example .env   # Configure AWS credentials and service URLs
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8080
```

**Go Kafka consumers** (delivery-management, payment-management):
```bash
cd <service-directory>
cp .env.example .env   # Configure Kafka brokers and downstream service URLs
go run ./cmd/main.go
```

**Frontend**:
```bash
cd foodit-frontend
npm install
npx expo start
```

### Additional Software / Accounts Required

- **AWS account** with permissions for: EKS, DynamoDB, Keyspaces, MSK, ElastiCache, S3, Cognito, Secrets Manager, Lambda, ECR, API Gateway, IAM
- **Stripe account** (test mode) -- API key must be stored in AWS Secrets Manager at `foodit/stripe-secret`
- **OutSystems** account (for the review service, accessed via ALB redirect at `/reviews/*`)

---

## Project Structure

```
esd-g6-team1-tanzu/
├── foodit-frontend/                    # Expo + React Native mobile/web app
├── order-service/                      # Go -- order CRUD (DynamoDB)
├── user-service/                       # Go -- user profiles (DynamoDB)
├── chat-service/                       # Go -- real-time chat (Keyspaces + Redis)
├── payment-service/                    # Python -- Stripe integration (DynamoDB)
├── location-service/                   # Python -- GPS tracking (Redis)
├── foodit-menu-service/                # Python -- store/menu data (DynamoDB)
├── order-management-service/           # Python -- order lifecycle orchestrator
├── foodit-delivery-management-service/ # Go -- Kafka consumer (chat + location)
├── foodit-payment-management-service/  # Go -- Kafka consumer (transfers + refunds)
└── infra/                              # Terraform infrastructure
    └── terraform/
```

Each service directory contains its own `README.md` with API documentation, environment variables, and setup instructions.