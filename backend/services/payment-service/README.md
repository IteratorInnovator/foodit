# Foodit — payment-service

Payment service for FoodIT using Stripe Connect. Handles buyer/runner onboarding, payments, transfers, and refunds.

## Features

- **Runner Onboarding**: Create Stripe Connected Accounts for delivery runners
- **Buyer Onboarding**: Create Stripe Customers for buyers
- **Payments**: Create PaymentIntents to charge customers
- **Transfers**: Transfer funds to connected accounts
- **Refunds**: Full or partial refunds
- **Transaction History**: Query payment records by user ID

## Installation

1. Clone the repository:
```bash
git clone https://gitlab.com/esd-g6-team1-tanzu/payment-service.git
cd payment-service
```

2. Create a virtual environment:
```bash
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set up environment variables:
```bash
# Copy the example env file
cp .env.example .env

# Edit .env with your configuration
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `STRIPE_API_KEY` | Stripe secret API key | - |
| `AWS_ACCESS_KEY_ID` | AWS access key | - |
| `AWS_SECRET_ACCESS_KEY` | AWS secret access key | - |
| `AWS_REGION` | AWS region for DynamoDB | `ap-southeast-1` |
| `PAYMENTS_TABLE` | DynamoDB table name | `payments` |
| `PLATFORM_FEE_PERCENT` | Platform fee percentage (e.g., 10 = 10%) | `10` |
| `CURRENCY` | Payment currency | `sgd` |
| `ENV` | Environment (dev/prod) | `dev` |

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
docker build -t payment-service .
docker run -p 8080:80 payment-service
```

### Docker Compose
```bash
# Start the service
docker compose up -d

# View logs
docker compose logs -f

# Stop the service
docker compose down
```

The API will be available at `http://localhost:8080`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Service status |
| GET | `/health` | Health check |
| GET | `/transactions/{user_id}` | Get transactions by user ID |
| POST | `/buyers/onboard` | Onboard a buyer (create Stripe Customer) |
| POST | `/runners/onboard` | Onboard a runner (create Stripe Connected Account) |
| POST | `/payments/create` | Create a Stripe PaymentIntent |
| POST | `/transfers/create` | Create a Stripe Transfer |
| POST | `/refunds/create` | Create a Stripe Refund |
| POST | `/balance/seed` | Seed test balance (dev only) |

## Project Structure

```
payment-service/
├── tests/
│   └── payments.http     # HTTP request samples for manual API testing
├── app/
│   ├── __init__.py
│   ├── config.py         # Environment configuration
│   ├── database.py       # DynamoDB connection
│   ├── main.py           # FastAPI application entry point
│   ├── models.py         # Pydantic request/response models
│   ├── routes.py         # API endpoint handlers
│   └── services.py       # Stripe business logic
├── .env.example          # Example environment variables
├── .gitignore
├── Dockerfile
├── docker-compose.yml    # Container orchestration
├── .dockerignore
├── requirements.txt
└── .gitlab-ci.yml        # CI pipeline (SAST + secret detection)
```

## DynamoDB Schema

**Table:** `payments`

| Attribute | Type | Description |
|-----------|------|-------------|
| `user_id` | String (PK) | User ID |
| `id` | String (SK) | Stripe ID (pi_xxx, tr_xxx, re_xxx) |
| `type` | String | Record type: `payment`, `transfer`, `refund` |
| `amount` | String | Amount in dollars |
| `status` | String | Stripe status |
| `created_at` | String | ISO 8601 timestamp |
