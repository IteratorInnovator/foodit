import json

from app import redis_client


def test_create_tracking_session(mock_redis):
    session = redis_client.create_tracking_session("order-1", "buyer-1", "runner-1")

    assert session["order_id"] == "order-1"
    assert session["buyer_id"] == "buyer-1"
    assert session["runner_id"] == "runner-1"
    assert session["status"] == "active"

    mock_redis.set.assert_called_once()
    call_args = mock_redis.set.call_args
    assert call_args[0][0] == "tracking:order:order-1"
    assert call_args[1]["ex"] == redis_client.SESSION_TTL


def test_get_tracking_session_exists(mock_redis):
    stored = json.dumps({"order_id": "order-1", "buyer_id": "b1", "runner_id": "r1"})
    mock_redis.get.return_value = stored

    result = redis_client.get_tracking_session("order-1")
    assert result["order_id"] == "order-1"
    mock_redis.get.assert_called_with("tracking:order:order-1")


def test_get_tracking_session_not_found(mock_redis):
    mock_redis.get.return_value = None
    result = redis_client.get_tracking_session("nonexistent")
    assert result is None


def test_delete_tracking_session(mock_redis):
    redis_client.delete_tracking_session("order-1")
    mock_redis.delete.assert_called_once()
    deleted_keys = mock_redis.delete.call_args[0]
    assert "tracking:order:order-1" in deleted_keys
    assert "location:order:order-1:buyer" in deleted_keys
    assert "location:order:order-1:runner" in deleted_keys
    assert "conn:order:order-1:buyer" in deleted_keys
    assert "conn:order:order-1:runner" in deleted_keys


def test_set_location(mock_redis):
    redis_client.set_location("order-1", "runner", 1.35, 103.82, "runner-1")

    mock_redis.set.assert_called_once()
    call_args = mock_redis.set.call_args
    assert call_args[0][0] == "location:order:order-1:runner"
    stored = json.loads(call_args[0][1])
    assert stored["lat"] == 1.35
    assert stored["lng"] == 103.82
    assert stored["user_id"] == "runner-1"


def test_get_location_exists(mock_redis):
    stored = json.dumps({"lat": 1.35, "lng": 103.82, "user_id": "r1", "timestamp": 1234})
    mock_redis.get.return_value = stored

    result = redis_client.get_location("order-1", "runner")
    assert result["lat"] == 1.35
    assert result["lng"] == 103.82


def test_get_location_not_found(mock_redis):
    mock_redis.get.return_value = None
    result = redis_client.get_location("order-1", "runner")
    assert result is None


def test_register_connection(mock_redis):
    mock_pipe = mock_redis.pipeline.return_value
    redis_client.register_connection("order-1", "buyer", "conn-abc")

    assert mock_pipe.set.call_count == 2
    mock_pipe.execute.assert_called_once()


def test_get_connection_id(mock_redis):
    mock_redis.get.return_value = "conn-abc"
    result = redis_client.get_connection_id("order-1", "buyer")
    assert result == "conn-abc"
    mock_redis.get.assert_called_with("conn:order:order-1:buyer")


def test_remove_connection_with_reverse(mock_redis):
    mock_redis.get.return_value = json.dumps({"order_id": "order-1", "role": "buyer"})
    mock_pipe = mock_redis.pipeline.return_value

    redis_client.remove_connection("conn-abc")

    assert mock_pipe.delete.call_count == 2
    mock_pipe.execute.assert_called_once()


def test_remove_connection_no_reverse(mock_redis):
    mock_redis.get.return_value = None
    mock_pipe = mock_redis.pipeline.return_value

    redis_client.remove_connection("conn-abc")

    mock_pipe.delete.assert_called_once_with("conn:reverse:conn-abc")
    mock_pipe.execute.assert_called_once()


def test_resolve_role_buyer(mock_redis):
    session = json.dumps({"order_id": "j1", "buyer_id": "buyer-1", "runner_id": "runner-1"})
    mock_redis.get.return_value = session

    role = redis_client.resolve_role("j1", "buyer-1")
    assert role == "buyer"


def test_resolve_role_runner(mock_redis):
    session = json.dumps({"order_id": "j1", "buyer_id": "buyer-1", "runner_id": "runner-1"})
    mock_redis.get.return_value = session

    role = redis_client.resolve_role("j1", "runner-1")
    assert role == "runner"


def test_resolve_role_unknown_user(mock_redis):
    session = json.dumps({"order_id": "j1", "buyer_id": "buyer-1", "runner_id": "runner-1"})
    mock_redis.get.return_value = session

    role = redis_client.resolve_role("j1", "stranger")
    assert role is None


def test_resolve_role_no_session(mock_redis):
    mock_redis.get.return_value = None
    role = redis_client.resolve_role("j1", "buyer-1")
    assert role is None
