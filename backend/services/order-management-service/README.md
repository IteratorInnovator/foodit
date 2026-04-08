# Foodit — Order Management Service

Composite orchestrator that coordinates the order lifecycle across multiple microservices.

Part of the [Foodit Backend Platform](https://gitlab.com/esd-g6-team1-tanzu/infra).

## How It Works

```
1. Buyer checks out → Order Management orchestrates User, Payment, and Order services
2. Runner accepts order → Order Management updates Order Service, publishes Kafka event
3. Delivery Management and Payment Management consume Kafka events asynchronously
4. Runner completes / Buyer reports MIA → status update + Kafka event triggers downstream
```

## Architecture

Order Management Service is a **composite service** (orchestrator). It has no database of its own — it coordinates downstream atomic services and publishes events to Kafka.

### Synchronous Dependencies (HTTP)

| Service | Purpose |
|---------|---------|
| **User Service** | Fetch buyer's `stripe_customer_id` during checkout |
| **Payment Wrapper Service** | Create Stripe PaymentIntent (deposit hold) during checkout |
| **Order Service** | Create and update order records in DynamoDB |

### Asynchronous Events (Kafka → `orders` topic)

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `order.accepted` | Runner accepts order | Delivery Management (creates chat room + location session) |
| `order.completed` | Runner marks delivered | Payment Management (transfer to runner), Delivery Management (end tracking) |
| `order.mia` | Buyer reports runner MIA | Payment Management (refund buyer), Delivery Management (end tracking) |
| `order.cancelled` | Buyer cancels order | Payment Management (refund deposit) |

### Kafka Event Payload Schema

**order.accepted:**
```json
{
  "event_type": "order.accepted",
  "order_id": "550e8400-e29b-41d4-a716-446655440000",
  "buyer_id": "buyer-001",
  "runner_id": "runner-001",
  "timestamp": "2026-03-11T10:15:00Z"
}
```

**order.completed** (includes `amount` in major currency units and `payment_intent_id`):
```json
{
  "event_type": "order.completed",
  "order_id": "550e8400-e29b-41d4-a716-446655440000",
  "buyer_id": "buyer-001",
  "runner_id": "runner-001",
  "amount": 15.30,
  "payment_intent_id": "pi_3Nxyz123",
  "timestamp": "2026-03-11T10:15:00Z"
}
```

**order.mia** (includes `payment_intent_id` for refund processing):
```json
{
  "event_type": "order.mia",
  "order_id": "550e8400-e29b-41d4-a716-446655440000",
  "buyer_id": "buyer-001",
  "runner_id": "runner-001",
  "payment_intent_id": "pi_3Nxyz123",
  "timestamp": "2026-03-11T10:15:00Z"
}
```

**order.cancelled** (`runner_id` is omitted — cancellation happens before a runner is assigned):
```json
{
  "event_type": "order.cancelled",
  "order_id": "550e8400-e29b-41d4-a716-446655440000",
  "buyer_id": "buyer-001",
  "timestamp": "2026-03-11T10:15:00Z"
}
```

## Project Structure

```
order-management-service/
├── app/                        # Application code
│   ├── main.py                 # FastAPI entry point + /health
│   ├── config.py               # Env config (injected by K8s ConfigMap)
│   ├── kafka_producer.py       # Kafka producer with MSK IAM auth
│   └── routes/
│       └── orders.py           # All order lifecycle endpoints
├── tests/                      # HTTP test files (for REST Client / IntelliJ HTTP Client)
│   ├── checkout.http
│   ├── accept.http
│   ├── complete.http
│   ├── cancel.http
│   ├── mia.http
│   └── mia-flow.http          # Full end-to-end test scenario
├── Dockerfile
├── requirements.txt
├── .env.example
├── .gitignore
└── .gitlab-ci.yml
```

## API Endpoints

### REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check (ALB target) |
| `POST` | `/orders/checkout` | Buyer places an order |
| `PUT` | `/orders/{order_id}/accept` | Runner accepts an order |
| `PUT` | `/orders/{order_id}/complete` | Runner marks delivery complete |
| `PUT` | `/orders/{order_id}/cancel` | Buyer cancels a pending order |
| `PUT` | `/orders/{order_id}/mia` | Buyer reports runner as MIA |

---

### POST /orders/checkout

Buyer places an order. Orchestrates User Service, Payment Wrapper Service, and Order Service synchronously.

**Orchestration Flow:**
1. `GET` User Service `/api/users/{buyer_id}/stripe/customer` → get `stripe_customer_id`
2. `POST` Payment Wrapper Service `/payments/create` → create PaymentIntent (deposit hold)
3. `POST` Order Service `/api/orders` → create order record with `PENDING` status

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `buyer_id` | String (UUID) | Yes | The buyer's user ID |
| `menu_store_id` | String (UUID) | Yes | The store/restaurant ID |
| `drop_off` | Object | Yes | Delivery location `{lat, lng, address}` |
| `items` | List\<Map\> | Yes | Array of `{menu_item_id, name, quantity, unit_price}` |
| `food_cost` | Decimal | Yes | Total food cost in dollars |
| `delivery_fee` | Decimal | Yes | Delivery fee in dollars |

```json
{
  "buyer_id": "550e8400-e29b-41d4-a716-446655440000",
  "menu_store_id": "bcfb3664-d8bf-45a6-a610-676f8e4b9966",
  "drop_off": {
    "lat": 1.3521,
    "lng": 103.8198,
    "address": "123 Orchard Road, Singapore 238867"
  },
  "items": [
    { "menu_item_id": "d553ef45-fa98-4923-bd1f-1f198d64c855", "name": "Ban Mian", "quantity": 2, "unit_price": 5.00 },
    { "menu_item_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "name": "Teh Tarik", "quantity": 1, "unit_price": 1.80 }
  ],
  "food_cost": 11.80,
  "delivery_fee": 3.50,
  "platform_fee": 0.10
}
```

**Responses:**

| Code | Description | Example |
|------|-------------|---------|
| 201 | Order created with payment hold | `{"order_id": "...", "status": "PENDING", "payment_intent_id": "pi_3Nxyz123"}` |
| 400/422 | Missing or invalid fields | `{"detail": [...]}` |
| 502 | Downstream service failure | `{"detail": "Failed to create payment"}` |

---

### PUT /orders/{order_id}/accept

Runner accepts an available pending order. Updates the order and publishes `order.accepted` to Kafka.

**Orchestration Flow:**
1. `PUT` Order Service `/api/orders/{order_id}` with `{status: "ACCEPTED", runner_id}`
2. Publish `order.accepted` to Kafka

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `order_id` | String (UUID) | The order to accept |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `runner_id` | String (UUID) | Yes | The runner accepting the order |

```json
{
  "runner_id": "550e8400-e29b-41d4-a716-446655440001"
}
```

**Responses:**

| Code | Description | Example |
|------|-------------|---------|
| 200 | Order accepted | `{"order_id": "...", "status": "ACCEPTED", "runner_id": "..."}` |
| 400/422 | Missing runner_id | `{"detail": [...]}` |
| 404 | Order not found | `{"detail": "order not found"}` |
| 502 | Order Service failure | `{"detail": "Failed to update order"}` |

---

### PUT /orders/{order_id}/complete

Runner marks the delivery as complete. Updates the order and publishes `order.completed` to Kafka.

The published `amount` is the runner payout (`food_cost + delivery_fee`) converted from stored cents to major currency units for Payment Management.

**Orchestration Flow:**
1. `GET` Order Service `/api/orders/{order_id}` → retrieve `buyer_id`, `runner_id`
2. `PUT` Order Service `/api/orders/{order_id}` with `{status: "COMPLETED"}`
3. Publish `order.completed` to Kafka

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `order_id` | String (UUID) | The order to complete |

**Responses:**

| Code | Description | Example |
|------|-------------|---------|
| 200 | Order completed | `{"order_id": "...", "status": "COMPLETED"}` |
| 404 | Order not found | `{"detail": "order not found"}` |
| 502 | Order Service failure | `{"detail": "Failed to update order"}` |

---

### PUT /orders/{order_id}/cancel

Buyer cancels a pending order. Only orders with `PENDING` status can be cancelled. Publishes `order.cancelled` to Kafka so Payment Management can refund the deposit.

**Orchestration Flow:**
1. `GET` Order Service `/api/orders/{order_id}` → verify status is `PENDING`
2. `PUT` Order Service `/api/orders/{order_id}` with `{status: "CANCELLED"}`
3. Publish `order.cancelled` to Kafka

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `order_id` | String (UUID) | The order to cancel |

**Responses:**

| Code | Description | Example |
|------|-------------|---------|
| 200 | Order cancelled | `{"order_id": "...", "status": "CANCELLED"}` |
| 400 | Not a pending order | `{"detail": "can only cancel PENDING orders"}` |
| 404 | Order not found | `{"detail": "order not found"}` |
| 502 | Order Service failure | `{"detail": "Failed to update order"}` |

---

### PUT /orders/{order_id}/mia

Buyer reports the runner as MIA (missing in action). Updates the order and publishes `order.mia` to Kafka so Payment Management can refund the buyer.

**Orchestration Flow:**
1. `GET` Order Service `/api/orders/{order_id}` → retrieve `buyer_id`, `runner_id`
2. `PUT` Order Service `/api/orders/{order_id}` with `{status: "MIA"}`
3. Publish `order.mia` to Kafka

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `order_id` | String (UUID) | The order to mark as MIA |

**Responses:**

| Code | Description | Example |
|------|-------------|---------|
| 200 | Order marked MIA | `{"order_id": "...", "status": "MIA"}` |
| 404 | Order not found | `{"detail": "order not found"}` |
| 502 | Order Service failure | `{"detail": "Failed to update order"}` |

---

## Environment Variables

Injected by K8s ConfigMap at deploy time:

| Variable | Description |
|----------|-------------|
| `AWS_REGION` | AWS region (default: `ap-southeast-1`) |
| `ORDER_SERVICE_URL` | Internal URL for Order Service |
| `USER_SERVICE_URL` | Internal URL for User Service |
| `PAYMENT_WRAPPER_SERVICE_URL` | Internal URL for Payment Wrapper Service |
| `KAFKA_BROKERS` | MSK bootstrap brokers |

---

## Running the Application

### Development
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8080
```

### Production
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

### Docker
```bash
docker build -t order-management-service .
docker run -p 8080:80 order-management-service
```

