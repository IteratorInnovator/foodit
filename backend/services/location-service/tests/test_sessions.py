from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@patch("app.routes.location.redis_client")
def test_create_session(mock_redis):
    mock_redis.create_tracking_session.return_value = {
        "order_id": "order-1",
        "buyer_id": "buyer-1",
        "runner_id": "runner-1",
        "status": "active",
        "created_at": 1706000000.0,
    }

    response = client.post("/location/sessions", json={
        "order_id": "order-1",
        "buyer_id": "buyer-1",
        "runner_id": "runner-1",
    })

    assert response.status_code == 201
    data = response.json()
    assert data["session_id"] == "order-1"
    mock_redis.create_tracking_session.assert_called_once_with("order-1", "buyer-1", "runner-1")


@patch("app.routes.location.redis_client")
def test_create_session_missing_fields(mock_redis):
    response = client.post("/location/sessions", json={
        "order_id": "order-1",
        # missing buyer_id and runner_id
    })

    assert response.status_code == 422
    mock_redis.create_tracking_session.assert_not_called()


@patch("app.routes.location.redis_client")
def test_close_session(mock_redis):
    mock_redis.get_tracking_session.return_value = {
        "order_id": "order-1",
        "status": "active",
    }

    response = client.put("/location/sessions/order-1/close")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "closed"
    assert data["session_id"] == "order-1"
    mock_redis.delete_tracking_session.assert_called_once_with("order-1")


@patch("app.routes.location.redis_client")
def test_close_session_not_found(mock_redis):
    mock_redis.get_tracking_session.return_value = None

    response = client.put("/location/sessions/nonexistent/close")

    assert response.status_code == 404
    mock_redis.delete_tracking_session.assert_not_called()
