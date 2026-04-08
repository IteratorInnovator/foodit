# Foodit 🍔

Foodit is a community-driven food delivery platform designed specifically for university campuses, enabling students to order meals from campus eateries and have them delivered by fellow students (runners). The platform addresses common pain points of campus dining, such as long queues during peak hours and limited time between classes.

Unlike traditional delivery platforms, Foodit features curated campus restaurant menus where buyers can browse, add items to cart, and checkout with a deposit held in escrow. Runners self-select orders from an active catalog, with real-time chat and live location tracking established upon acceptance, ensuring full delivery transparency and financial protection for both parties.

**Built with a cloud-native microservices architecture on AWS.**

## Team Members

<div align="center">
    <table>
        <tr>
            <th><a href="https://www.linkedin.com/in/harryng99/">Harry Ng Kok Jing</a></th>
            <th><a href="https://www.linkedin.com/in/jaredchanxy/">Jared Chan Xu Yang</a></th>
            <th><a href="https://www.linkedin.com/in/pngjunwei/">Png Jun Wei</a></th>
            <th><a href="https://www.linkedin.com/in/flashteng/">Flash Teng Xin Huang</a></th>
            <th><a href="https://www.linkedin.com/in/isabelleongliwen/">Isabelle Ong Liwen</a></th>
        </tr>
    </table>
</div>

---

## Key Features

- **Campus-Focused** - Curated menus from campus restaurants and eateries
- **Student-to-Student Delivery** - Fellow students act as runners, creating earning opportunities
- **Escrow Payments** - Deposits held securely until delivery completion, protecting both buyers and runners
- **Self-Selection Model** - Runners choose orders from an active catalog based on their availability
- **Real-time Communication** - Built-in chat system for seamless buyer-runner coordination
- **Live GPS Tracking** - Track your runner's location in real-time from pickup to delivery
- **Queue-Free Experience** - Skip long lines during peak dining hours
- **Flexible Scheduling** - Perfect for students with tight class schedules

---

## Prerequisites

- **AWS CLI** v2.x configured with `ap-southeast-1` region
- **Terraform** v1.5+ (for infrastructure deployment)
- **kubectl** (for Kubernetes management)
- **Docker** and **Docker Desktop** (for containerization)
- **Go 1.21+** (for Go services)
- **Python 3.11+** (for Python services)
- **Node.js 18+** and **Expo CLI** (for the frontend)
- **Stripe account** with test API key (stored in AWS Secrets Manager)

---

## Instructions

### Local Development Setup

> Ensure Docker Desktop is running

**Backend Services (Go):**
```bash
cd backend/services/order-service  # or user-service, chat-service
cp .env.example .env
go mod download
go run ./cmd/server     # order-service, chat-service
go run main.go          # user-service
```

**Backend Services (Python):**
```bash
cd backend/services/payment-service  # or location-service, menu-service, order-management-service
cp .env.example .env
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8080
```

**Kafka Consumer Services (Go):**
```bash
cd backend/services/delivery-management-service  # or payment-management-service
cp .env.example .env
go run ./cmd/main.go
```

**Frontend:**
```bash
cd frontend
npm install
npx expo start
```

### Infrastructure Deployment

```bash
cd infrastructure/terraform
terraform init

# Import persistent resources (DynamoDB, Keyspaces, Cognito, S3, etc.)
# See infrastructure/README.md for full import commands

terraform apply                              # ~25 min (MSK is the bottleneck)
terraform apply -var="enable_api_routes=true" # Enable API Gateway routes after ALB is up
```

Verify deployment:
```bash
kubectl get pods -n foodit        # All 9 pods should be Running
curl http://$(terraform output -raw alb_dns)/health
```

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

## Notable Technical Implementations

### Backend
- **Microservice Architecture** with 9 independent services
- **Loosely Coupled** atomic and composite microservices
- **Language Agnostic** -- Go (Fiber v2/v3) and Python (FastAPI) services
- **Event-Driven Architecture** with Apache Kafka (AWS MSK) for order events
- **Real-time Communication** via WebSocket for chat and GPS tracking
- **Dual Database Strategy** -- DynamoDB for transactional data, Keyspaces (Cassandra) for chat, Redis for caching/pub-sub
- **Stripe Integration** for payments, transfers, and refunds
- **API Gateway + ALB** for request routing and load balancing
- **AWS Cognito** for JWT-based authentication
- **Lambda Triggers** for post-confirmation workflows
- **Kubernetes Deployment** on EKS Fargate for serverless container orchestration
- **Infrastructure as Code** with Terraform
- **CI/CD Pipelines** with GitLab CI for automated builds and deployments

### Frontend
- **Cross-platform** mobile and web app using Expo SDK 54
- **React Native** with TypeScript for type safety
- **AWS Amplify** for seamless AWS service integration
- **Cognito Authentication** for user management

---

## Services

| Service | Language | Role |
|---------|----------|------|
| frontend | TypeScript / Expo SDK 54 | Cross-platform mobile + web app |
| order-service | Go 1.25 / Fiber v3 | Atomic CRUD for orders (DynamoDB) |
| user-service | Go 1.25 / Fiber v3 | User profiles and Stripe IDs (DynamoDB) |
| chat-service | Go 1.25 / Fiber v2 + WebSocket | Real-time messaging (Keyspaces + Redis) |
| payment-service | Python 3.11 / FastAPI | Stripe payments, transfers, refunds (DynamoDB) |
| location-service | Python 3.11 / FastAPI | Real-time GPS tracking (WebSocket + Redis) |
| menu-service | Python 3.11 / FastAPI | Store listings and menu items (DynamoDB) |
| order-management-service | Python 3.11 / FastAPI | Orchestrates checkout and order lifecycle (no DB) |
| delivery-management-service | Go 1.21 / stdlib | Kafka consumer -- spins up chat + location on order accepted |
| payment-management-service | Go 1.21 / stdlib | Kafka consumer -- handles fund transfers and refunds |
| infrastructure | Terraform | AWS + Kubernetes infrastructure |

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
| `/stores/*` | menu-service |
| `/reviews/*` | OutSystems (redirect) |

---

## Frameworks and Technologies

<p align="center"><strong>Frontend Stack</strong></p>
<p align="center">
<a href="https://expo.dev/"><img src="https://upload.wikimedia.org/wikipedia/commons/f/f4/Expo.io_logo.svg" alt="Expo" width="100"/></a>&nbsp;&nbsp;
<a href="https://react.dev/"><img src="https://upload.wikimedia.org/wikipedia/commons/a/a7/React-icon.svg" alt="React Native" width="40"/></a>&nbsp;&nbsp;
<a href="https://www.typescriptlang.org/"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Typescript_logo_2020.svg/1200px-Typescript_logo_2020.svg.png" alt="TypeScript" width="40"/></a>&nbsp;&nbsp;
<a href="https://aws.amazon.com/amplify/"><img src="https://upload.wikimedia.org/wikipedia/commons/9/93/Amazon_Web_Services_Logo.svg" alt="AWS Amplify" width="60"/></a>&nbsp;&nbsp;
<br>
<i>Expo SDK 54 · React Native · TypeScript · AWS Amplify</i>
</p>
<br>

<p align="center"><strong>Backend Languages</strong></p>
<p align="center">
<a href="https://go.dev/"><img src="https://upload.wikimedia.org/wikipedia/commons/0/05/Go_Logo_Blue.svg" alt="Golang" width="80"/></a>&nbsp;&nbsp;
<a href="https://www.python.org/"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Python-logo-notext.svg/1024px-Python-logo-notext.svg.png" alt="Python" width="40"/></a>&nbsp;&nbsp;
<br>
<i>Go 1.21+ · Python 3.11</i>
</p>
<br>

<p align="center"><strong>Backend Frameworks</strong></p>
<p align="center">
<a href="https://gofiber.io/"><img src="https://gofiber.io/assets/images/logo.svg" alt="Fiber" width="100"/></a>&nbsp;&nbsp;
<a href="https://fastapi.tiangolo.com/"><img src="https://upload.wikimedia.org/wikipedia/commons/1/1a/FastAPI_logo.svg" alt="FastAPI" width="120"/></a>&nbsp;&nbsp;
<br>
<i>Fiber v2/v3 · FastAPI</i>
</p>
<br>

<p align="center"><strong>Databases</strong></p>
<p align="center">
<a href="https://aws.amazon.com/dynamodb/"><img src="https://upload.wikimedia.org/wikipedia/commons/f/fd/DynamoDB.png" alt="DynamoDB" width="50"/></a>&nbsp;&nbsp;
<a href="https://aws.amazon.com/keyspaces/"><img src="https://www.vectorlogo.zone/logos/apache_cassandra/apache_cassandra-ar21.svg" alt="Keyspaces" width="120"/></a>&nbsp;&nbsp;
<a href="https://redis.io/"><img src="https://upload.wikimedia.org/wikipedia/en/6/6b/Redis_Logo.svg" alt="Redis" width="100"/></a>&nbsp;&nbsp;
<br>
<i>DynamoDB · AWS Keyspaces (Cassandra) · Redis (ElastiCache)</i>
</p>
<br>

<p align="center"><strong>Message Broker</strong></p>
<p align="center">
<a href="https://kafka.apache.org/"><img src="https://upload.wikimedia.org/wikipedia/commons/0/05/Apache_kafka.svg" alt="Apache Kafka" width="150"/></a>&nbsp;&nbsp;
<br>
<i>Apache Kafka (AWS MSK Provisioned)</i>
</p>
<br>

<p align="center"><strong>API Gateway & Load Balancing</strong></p>
<p align="center">
<a href="https://aws.amazon.com/api-gateway/"><img src="https://upload.wikimedia.org/wikipedia/commons/9/93/Amazon_Web_Services_Logo.svg" alt="AWS API Gateway" width="60"/></a>&nbsp;&nbsp;
<br>
<i>AWS API Gateway · Application Load Balancer (ALB)</i>
</p>
<br>

<p align="center"><strong>Cloud Platform</strong></p>
<p align="center">
<a href="https://aws.amazon.com/"><img src="https://upload.wikimedia.org/wikipedia/commons/9/93/Amazon_Web_Services_Logo.svg" alt="AWS" width="80"/></a>&nbsp;&nbsp;
<br>
<i>AWS EKS Fargate · S3 · Cognito · Secrets Manager · Lambda · ECR</i>
</p>
<br>

<p align="center"><strong>DevOps & Infrastructure</strong></p>
<p align="center">
<a href="https://www.terraform.io/"><img src="https://upload.wikimedia.org/wikipedia/commons/0/04/Terraform_Logo.svg" alt="Terraform" width="150"/></a>&nbsp;&nbsp;
<a href="https://kubernetes.io/"><img src="https://upload.wikimedia.org/wikipedia/commons/6/67/Kubernetes_logo.svg" alt="Kubernetes" width="50"/></a>&nbsp;&nbsp;
<a href="https://www.docker.com/"><img src="https://upload.wikimedia.org/wikipedia/commons/4/4e/Docker_%28container_engine%29_logo.svg" alt="Docker" width="150"/></a>&nbsp;&nbsp;
<br>
<i>Terraform · Kubernetes (EKS) · Docker · GitLab CI</i>
</p>
<br>

<p align="center"><strong>Payment Integration</strong></p>
<p align="center">
<a href="https://stripe.com/"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Stripe_Logo%2C_revised_2016.svg/1280px-Stripe_Logo%2C_revised_2016.svg.png" alt="Stripe" width="150"/></a>&nbsp;&nbsp;
<br>
<i>Stripe Connect · Payments · Transfers · Refunds</i>
</p>
<br>

<p align="center"><strong>External Services</strong></p>
<p align="center">
<a href="https://www.outsystems.com/"><img src="https://upload.wikimedia.org/wikipedia/commons/8/82/OS-logo-color_500x108.png" alt="OutSystems" width="100"/></a>&nbsp;&nbsp;
<br>
<i>OutSystems (Review Service)</i>
</p>
<br>

---

## Project Structure

```
foodit/
├── frontend/                           # Expo + React Native mobile/web app
├── backend/
│   └── services/
│       ├── order-service/              # Go -- order CRUD (DynamoDB)
│       ├── user-service/               # Go -- user profiles (DynamoDB)
│       ├── chat-service/               # Go -- real-time chat (Keyspaces + Redis)
│       ├── payment-service/            # Python -- Stripe integration (DynamoDB)
│       ├── location-service/           # Python -- GPS tracking (Redis)
│       ├── menu-service/               # Python -- store/menu data (DynamoDB)
│       ├── order-management-service/   # Python -- order lifecycle orchestrator
│       ├── delivery-management-service/ # Go -- Kafka consumer (chat + location)
│       └── payment-management-service/ # Go -- Kafka consumer (transfers + refunds)
└── infrastructure/                     # Terraform infrastructure
    └── terraform/
```

Each service directory contains its own `README.md` with API documentation, environment variables, and setup instructions.

---

## Additional Requirements

- **AWS account** with permissions for: EKS, DynamoDB, Keyspaces, MSK, ElastiCache, S3, Cognito, Secrets Manager, Lambda, ECR, API Gateway, IAM
- **Stripe account** (test mode) -- API key must be stored in AWS Secrets Manager at `foodit/stripe-secret`
- **OutSystems** account (for the review service, accessed via ALB redirect at `/reviews/*`)
