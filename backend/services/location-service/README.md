# Foodit — Location Service

Real-time bidirectional GPS tracking between buyer and runner during food delivery.

Part of the [Foodit Backend Platform](https://gitlab.com/esd-g6-team1-tanzu/infra).

## How It Works

```
1. Order accepted → delivery-management-service consumes Kafka event
2. Delivery-management-service calls POST /location/sessions (creates tracking session in Redis)
3. Both buyer and runner open WebSocket connection directly to ALB
4. Both send GPS coordinates every ~3 seconds
5. Location-service writes GPS to Redis, publishes to Redis pub/sub
6. All pods receive pub/sub message → push to their local WebSocket connections
7. Both frontends render the other person's position on a map in real-time
8. Order completed/MIA → delivery-management-service calls PUT /location/sessions/{id}/close
```

**Architecture:** Location-service is an **atomic service** (Redis + WebSocket only, no Kafka). Session lifecycle is managed by `delivery-management-service` via REST.

## Project Structure

```
location-service/
├── app/                        # Application code
│   ├── main.py                 # FastAPI entry point + startup/shutdown
│   ├── config.py               # Env config (injected by K8s ConfigMap)
│   ├── redis_client.py         # Tracking sessions, GPS storage
│   ├── connection_registry.py  # In-memory WebSocket connection storage
│   ├── pubsub_manager.py       # Redis pub/sub for cross-pod messaging
│   └── routes/
│       ├── location.py         # REST endpoints (GPS + session management)
│       └── websocket.py        # WebSocket /ws/location (native WebSocket)
├── tests/                      # Unit tests (all mocked, no infra needed)
├── Dockerfile
├── docker-compose.test.yml
├── requirements.txt
├── pyproject.toml
├── .env.example
├── .gitignore
└── .gitlab-ci.yml
```

## API Endpoints

### REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check (ALB target) |
| `POST` | `/location/sessions` | Create tracking session (called by delivery-management-service) |
| `PUT` | `/location/sessions/{session_id}/close` | Close tracking session (called by delivery-management-service) |
| `GET` | `/location/{order_id}` | Get latest GPS for both buyer and runner |
| `GET` | `/location/{order_id}/session` | Get tracking session metadata (debug) |

#### POST /location/sessions

Called by `delivery-management-service` when it consumes an `order.accepted` Kafka event.

**Request:**
```json
{
  "order_id": "abc-123",
  "buyer_id": "buyer-1",
  "runner_id": "runner-1"
}
```

**Response (201):**
```json
{
  "session_id": "abc-123"
}
```

#### PUT /location/sessions/{session_id}/close

Called by `delivery-management-service` when it consumes an `order.completed` or `order.mia` Kafka event.

**Response (200):**
```json
{
  "status": "closed",
  "session_id": "abc-123"
}
```

**Error (404):** No active tracking session found.

#### GET /location/{order_id}

Get the last known GPS coordinates for both buyer and runner in a delivery order.

**Response:**
```json
{
  "order_id": "abc-123",
  "status": "active",
  "buyer": {
    "lat": 1.29,
    "lng": 103.85,
    "user_id": "buyer-1",
    "timestamp": 1706000000.0
  },
  "runner": {
    "lat": 1.35,
    "lng": 103.82,
    "user_id": "runner-1",
    "timestamp": 1706000001.0
  }
}
```

**Notes:**
- `buyer` or `runner` will be `null` if no GPS has been sent yet
- Use this endpoint ONLY for initial page load (one-time fetch)
- For real-time tracking, use WebSocket instead (updates pushed every ~3 seconds)
- Polling this endpoint repeatedly is wasteful and adds latency

---

### WebSocket

Connect to `/ws/location` for real-time bidirectional GPS tracking.

**Endpoint:**
```
wss://api.foodit.com/ws/location
```

#### Client → Server Messages

**Connect (register for tracking):**
```json
{
  "type": "connect",
  "order_id": "abc-123",
  "user_id": "buyer-1"
}
```

**Update location (send GPS):**
```json
{
  "type": "update",
  "lat": 1.3521,
  "lng": 103.8198
}
```

**Keepalive ping:**
```json
{
  "type": "ping"
}
```

**Disconnect:**
```json
{
  "type": "disconnect"
}
```

#### Server → Client Messages

**Connected confirmation:**
```json
{
  "type": "connected",
  "role": "buyer",
  "order_id": "abc-123"
}
```

**Location update (receive other party's GPS):**
```json
{
  "type": "location_update",
  "order_id": "abc-123",
  "role": "runner",
  "lat": 1.3521,
  "lng": 103.8198,
  "user_id": "runner-789",
  "timestamp": 1706000001.0
}
```

**Acknowledgement (after sending GPS update):**
```json
{
  "type": "ack"
}
```

**Pong (keepalive response):**
```json
{
  "type": "pong"
}
```

**Error:**
```json
{
  "type": "error",
  "message": "Error description"
}
```

---

## Frontend Integration Guide

### Implementation Strategy

**IMPORTANT:** Use BOTH REST API + WebSocket for optimal UX:

1. **Initial Page Load:** Call `GET /location/{order_id}` to render last known positions immediately (prevents 3-second blank map)
2. **Real-Time Updates:** Open WebSocket connection for live GPS streaming every ~3 seconds

**DO NOT poll the REST API repeatedly** — this is wasteful and adds latency. Use WebSocket for real-time tracking.

### Map Library

Use **[Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/)** or its free alternative **[MapLibre GL JS](https://maplibre.org/)**:
- GPU-accelerated WebGL — best performance for real-time marker updates
- Works with React (`react-map-gl`), Vue, or vanilla JS
- Mapbox: 50k free map loads/month. MapLibre: unlimited (open source)

### Recommended Frontend Flow

```javascript
// 1. Fetch initial location (one-time REST call)
const response = await fetch(`https://api.foodit.com/location/${orderId}`);
const { buyer, runner } = await response.json();

// Render initial markers on map
if (buyer) map.addMarker('buyer', buyer.lat, buyer.lng);
if (runner) map.addMarker('runner', runner.lat, runner.lng);

// 2. Open WebSocket for real-time updates
const ws = new WebSocket('wss://api.foodit.com/ws/location');
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'connect',
    order_id: orderId,
    user_id: currentUserId
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'location_update') {
    // Update marker position in real-time
    map.updateMarker(data.role, data.lat, data.lng);
  }
};
```

### WebSocket Connection

Connect directly to the ALB WebSocket endpoint:

```javascript
const ws = new WebSocket('wss://api.foodit.com/ws/location');
```

Both buyer and runner use the **same** message format.

### Step 1: Register for Tracking

Send immediately after connection opens. The service auto-detects your role (buyer/runner) from the tracking session.

```javascript
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'connect',
    order_id: 'abc-123',        // The active order ID
    user_id: 'user-456'       // Your user ID (from Cognito)
  }));
};
```

### Step 2: Send GPS Updates (every ~3 seconds)

```javascript
navigator.geolocation.watchPosition((pos) => {
  ws.send(JSON.stringify({
    type: 'update',
    lat: pos.coords.latitude,
    lng: pos.coords.longitude
  }));
}, null, { enableHighAccuracy: true });
```

### Step 3: Receive the Other Person's Location

When the runner sends an update, the buyer receives it (and vice versa):

```javascript
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'location_update') {
    // data.role === 'runner' → update runner marker on your map
    // data.role === 'buyer'  → update buyer marker on your map
    updateMarkerOnMap(data.role, data.lat, data.lng);
  }
};
```

**Payload you receive:**
```json
{
  "type": "location_update",
  "order_id": "abc-123",
  "role": "runner",
  "lat": 1.3521,
  "lng": 103.8198,
  "user_id": "runner-789",
  "timestamp": 1706000001.0
}
```

### Step 4: Keepalive Ping

ALB idle timeout is **1 hour**. GPS every 3s prevents disconnection, but if someone pauses (e.g., waiting at restaurant):

```javascript
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping' }));
  }
}, 5 * 60 * 1000); // every 5 minutes
```

### Step 5: Disconnect

```javascript
ws.send(JSON.stringify({ type: 'disconnect' }));
ws.close();
```

---

## Environment Variables

Injected by K8s ConfigMap at deploy time:

| Variable | Description |
|----------|-------------|
| `AWS_REGION` | AWS region (default: `ap-southeast-1`) |
| `REDIS_HOST` | Redis/ElastiCache host |
| `REDIS_PORT` | Redis port (default: `6379`) |
| `REDIS_SSL` | Use TLS (default: `false`, `true` in prod) |
| `ENV` | Environment name (`dev`, `prod`) |

See `.env.example` for local development defaults.

---

## Local Testing

### Prerequisites

- Docker Desktop running

### Run Unit Tests

No Redis needed — everything is mocked.

**PowerShell (Windows):**
```powershell
docker run --rm -v "${PWD}:/code" -w /code python:3.11-slim sh -c "pip install -r requirements.txt pytest pytest-mock 'httpx<0.28' && pytest tests/ -v"
```

**Bash (Mac/Linux):**
```bash
docker run --rm -v "$(pwd)":/code -w /code python:3.11-slim sh -c "pip install -r requirements.txt pytest pytest-mock 'httpx<0.28' && pytest tests/ -v"
```

**Success:** All 32 tests pass with green output, 0 failures.

### Integration Test (Docker Compose)

Spins up Redis + location-service for local testing:

```bash
cd location-service
docker compose -f docker-compose.test.yml up --build
```

Wait for:
```
location-service-1  | INFO:     Uvicorn running on http://0.0.0.0:80
location-service-1  | INFO:     ✓ PubSubManager started
```

**Create Tracking Session (via REST):**
```bash
curl -X POST http://localhost:80/location/sessions \
  -H "Content-Type: application/json" \
  -d '{"order_id": "test-order", "buyer_id": "buyer-1", "runner_id": "runner-1"}'
```

**Test REST API:**
```bash
# Health check
curl http://localhost:80/health

# Get location
curl http://localhost:80/location/test-order
```

**Tear Down:**
```bash
docker compose -f docker-compose.test.yml down
```

**Note on WebSocket Testing:**
- Unit tests (pytest) verify WebSocket logic with mocked dependencies
- Integration test verifies REST API + Redis work together
- For full WebSocket testing (real Redis pub/sub + WebSocket connections), deploy to AWS and test there
- Local WebSocket testing on Windows has Docker networking limitations
