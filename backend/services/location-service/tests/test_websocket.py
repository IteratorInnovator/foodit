import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch

from app.main import app


@pytest.fixture
def mock_redis():
    """Mock Redis client for tracking sessions."""
    with patch("app.routes.websocket.redis_client") as mock:
        mock.get_tracking_session.return_value = {
            "order_id": "test-order",
            "buyer_id": "buyer-1",
            "runner_id": "runner-1",
            "status": "active"
        }
        mock.resolve_role.return_value = "buyer"
        yield mock


@pytest.fixture
def mock_registry():
    """Mock connection registry."""
    with patch("app.routes.websocket.registry") as mock:
        mock.add = AsyncMock()
        mock.remove = AsyncMock()
        yield mock


@pytest.fixture
def mock_pubsub():
    """Mock pub/sub manager."""
    with patch("app.routes.websocket.pubsub_manager") as mock:
        mock.publish_location = AsyncMock()
        yield mock


def test_websocket_connect_success(mock_redis, mock_registry, mock_pubsub):
    """Test successful WebSocket connection."""
    client = TestClient(app)

    with client.websocket_connect("/ws/location") as websocket:
        # Send connect message
        websocket.send_json({
            "type": "connect",
            "order_id": "test-order",
            "user_id": "buyer-1"
        })

        # Should receive connected response
        response = websocket.receive_json()
        assert response["type"] == "connected"
        assert response["role"] == "buyer"
        assert response["order_id"] == "test-order"

        # Verify registry was called
        mock_registry.add.assert_called_once()


def test_websocket_connect_missing_fields(mock_redis, mock_registry, mock_pubsub):
    """Test WebSocket connection with missing fields."""
    client = TestClient(app)

    with client.websocket_connect("/ws/location") as websocket:
        # Send connect without order_id
        websocket.send_json({
            "type": "connect",
            "user_id": "buyer-1"
        })

        response = websocket.receive_json()
        assert response["type"] == "error"
        assert "Missing" in response["message"]


def test_websocket_connect_no_session(mock_redis, mock_registry, mock_pubsub):
    """Test WebSocket connection with no tracking session."""
    mock_redis.get_tracking_session.return_value = None

    client = TestClient(app)

    with client.websocket_connect("/ws/location") as websocket:
        websocket.send_json({
            "type": "connect",
            "order_id": "invalid-order",
            "user_id": "buyer-1"
        })

        response = websocket.receive_json()
        assert response["type"] == "error"
        assert "No active tracking session" in response["message"]


def test_websocket_update_location(mock_redis, mock_registry, mock_pubsub):
    """Test GPS location update."""
    client = TestClient(app)

    with client.websocket_connect("/ws/location") as websocket:
        # Connect first
        websocket.send_json({
            "type": "connect",
            "order_id": "test-order",
            "user_id": "buyer-1"
        })
        websocket.receive_json()  # Consume connected response

        # Send location update
        websocket.send_json({
            "type": "update",
            "lat": 1.3521,
            "lng": 103.8198
        })

        response = websocket.receive_json()
        assert response["type"] == "ack"

        # Verify Redis was called
        mock_redis.set_location.assert_called_once()

        # Verify pub/sub was called
        mock_pubsub.publish_location.assert_called_once()


def test_websocket_ping_pong(mock_redis, mock_registry, mock_pubsub):
    """Test WebSocket keepalive ping/pong."""
    client = TestClient(app)

    with client.websocket_connect("/ws/location") as websocket:
        websocket.send_json({"type": "ping"})

        response = websocket.receive_json()
        assert response["type"] == "pong"
