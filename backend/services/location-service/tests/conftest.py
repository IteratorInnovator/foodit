from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def mock_redis():
    """Mock Redis for all tests — no real Redis connection needed."""
    mock_client = MagicMock()
    mock_pipe = MagicMock()
    mock_client.pipeline.return_value = mock_pipe

    with patch("app.redis_client._client", mock_client):
        with patch("app.redis_client.get_client", return_value=mock_client):
            yield mock_client
