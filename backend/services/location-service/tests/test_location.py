import json

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_get_locations_success(mock_redis):
    session = {"order_id": "j1", "buyer_id": "b1", "runner_id": "r1", "status": "active"}
    buyer_loc = {"lat": 1.29, "lng": 103.85, "user_id": "b1", "timestamp": 1234}
    runner_loc = {"lat": 1.35, "lng": 103.82, "user_id": "r1", "timestamp": 1234}

    def mock_get(key):
        if key == "tracking:order:j1":
            return json.dumps(session)
        elif key == "location:order:j1:buyer":
            return json.dumps(buyer_loc)
        elif key == "location:order:j1:runner":
            return json.dumps(runner_loc)
        return None

    mock_redis.get.side_effect = mock_get

    response = client.get("/location/j1")
    assert response.status_code == 200
    data = response.json()
    assert data["order_id"] == "j1"
    assert data["buyer"]["lat"] == 1.29
    assert data["runner"]["lat"] == 1.35


def test_get_locations_no_session(mock_redis):
    mock_redis.get.return_value = None
    response = client.get("/location/nonexistent")
    assert response.status_code == 404


def test_get_locations_no_gps_yet(mock_redis):
    session = {"order_id": "j1", "buyer_id": "b1", "runner_id": "r1", "status": "active"}

    def mock_get(key):
        if key == "tracking:order:j1":
            return json.dumps(session)
        return None

    mock_redis.get.side_effect = mock_get

    response = client.get("/location/j1")
    assert response.status_code == 200
    data = response.json()
    assert data["buyer"] is None
    assert data["runner"] is None


def test_get_session_success(mock_redis):
    session = {"order_id": "j1", "buyer_id": "b1", "runner_id": "r1", "status": "active"}
    mock_redis.get.return_value = json.dumps(session)

    response = client.get("/location/j1/session")
    assert response.status_code == 200
    assert response.json()["order_id"] == "j1"


def test_get_session_not_found(mock_redis):
    mock_redis.get.return_value = None
    response = client.get("/location/nonexistent/session")
    assert response.status_code == 404
