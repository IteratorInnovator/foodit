# Foodit — Menu Service

A microservice for managing and serving restaurant/food store menus. Built with FastAPI and AWS DynamoDB.

## Tech Stack

- **Python 3**
- **FastAPI** - Web framework
- **Uvicorn** - ASGI server
- **AWS DynamoDB** - Database
- **Pydantic** - Data validation

## Prerequisites

- Python 3.8+
- AWS account with DynamoDB access
- AWS credentials configured (via environment variables or AWS CLI)

## Installation

1. Clone the repository:
```bash
git clone https://gitlab.com/esd-g6-team1-tanzu/foodit-menu-service.git
cd foodit-menu-service
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

Environment variables (all required):
| Variable | Description |
|----------|-------------|
| `AWS_REGION` | AWS region for DynamoDB |
| `AWS_ACCESS_KEY_ID` | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | AWS secret access key |
| `STORES_TABLE` | DynamoDB table for stores |
| `ITEMS_TABLE` | DynamoDB table for menu items |

## Running the Application

### Development
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8080
```

### Production
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

The API will be available at `http://localhost:8080`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check (returns {"status": "healthy"}) |
| GET | `/stores` | Get all stores |
| GET | `/stores/{store_id}` | Get details for a specific store |
| GET | `/stores/{store_id}/items` | Get menu items for a store |

### API Documentation

Once the app is running, visit:
- Swagger UI: `http://localhost:8080/docs`
- ReDoc: `http://localhost:8080/redoc`

## DynamoDB Schema

### menu_stores table
| Attribute | Type | Description |
|-----------|------|-------------|
| `store_id` | String (PK) | Unique store identifier |
| `name` | String | Store name |
| `cuisine` | String | Type of cuisine |
| `image_url` | String | Store image URL |
| `address` | String | Store address |
| `lat` | Number | Store latitude |
| `lng` | Number | Store longitude |
| `place_id` | String | Google Places ID |

### menu_items table
| Attribute | Type | Description |
|-----------|------|-------------|
| `store_id` | String (PK) | Store identifier |
| `item_id` | String (SK) | Unique item identifier |
| `name` | String | Item name |
| `price` | Number | Item price |

## Seeding Data

To populate the database with sample data:
```bash
python scripts/seed_menu_stores.py
python scripts/seed_menu_items.py
```

## Project Structure

```
foodit-menu-service/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI app entry point
│   ├── models.py        # Pydantic models
│   ├── config.py        # Configuration
│   ├── db.py            # DynamoDB client
│   └── routes/
│       ├── __init__.py
│       └── menu.py      # Menu API routes
├── scripts/
│   ├── seed_menu_stores.py # Seed stores data
│   └── seed_menu_items.py  # Seed menu items data
├── tests/
│   └── menu.http           # REST client test file
├── .env.example
├── .gitignore
├── .gitlab-ci.yml
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
└── README.md
```

## License

This project is part of the FoodIT ecosystem (ESD-G6-Team1-Tanzu).
