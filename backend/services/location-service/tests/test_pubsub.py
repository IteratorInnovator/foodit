import pytest
from unittest.mock import MagicMock, patch, AsyncMock
import json

from app.pubsub_manager import PubSubManager


@pytest.fixture
def mock_redis():
    """Mock Redis clients."""
    with patch("app.pubsub_manager.redis.Redis") as mock:
        publish_client = MagicMock()
        subscribe_client = MagicMock()
        mock.side_effect = [publish_client, subscribe_client]
        yield {"publish": publish_client, "subscribe": subscribe_client}


@pytest.fixture
def mock_registry():
    """Mock connection registry."""
    with patch("app.pubsub_manager.registry") as mock:
        mock.get = AsyncMock(return_value=None)
        yield mock


@pytest.mark.asyncio
async def test_publish_location(mock_redis, mock_registry):
    """Test publishing location update to Redis pub/sub."""
    manager = PubSubManager()
    manager._publish_client = mock_redis["publish"]

    await manager.publish_location(
        order_id="test-order",
        role="runner",
        lat=1.3521,
        lng=103.8198,
        user_id="runner-1",
        timestamp=1234567890.0
    )

    # Verify publish was called
    mock_redis["publish"].publish.assert_called_once()
    channel, message = mock_redis["publish"].publish.call_args[0]

    assert channel == "location:order:test-order"
    data = json.loads(message)
    assert data["order_id"] == "test-order"
    assert data["role"] == "runner"
    assert data["lat"] == 1.3521
    assert data["lng"] == 103.8198


def test_pubsub_manager_start_stop(mock_redis, mock_registry):
    """Test PubSubManager lifecycle."""
    manager = PubSubManager()

    manager.start()
    assert manager._publish_client is not None
    assert manager._subscribe_client is not None
    assert manager._subscriber_thread is not None

    manager.stop()
    mock_redis["publish"].close.assert_called_once()
    mock_redis["subscribe"].close.assert_called_once()
