import json
import logging
import time

import redis

from app.config import settings

logger = logging.getLogger(__name__)

# Module-level singleton — redis-py client is thread-safe
_client: redis.Redis | None = None

# TTLs
SESSION_TTL = 14400      # 4 hours — tracking session lifetime
LOCATION_TTL = 300       # 5 minutes — stale GPS auto-expires
CONNECTION_TTL = 14400   # 4 hours — matches session lifetime


def get_client() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            ssl=settings.REDIS_SSL,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
        )
    return _client


def close_client():
    global _client
    if _client is not None:
        _client.close()
        _client = None


# ── Tracking Sessions ──────────────────────────────────────────────────────
# Created/deleted via REST by delivery-management-service

def create_tracking_session(order_id: str, buyer_id: str, runner_id: str) -> dict:
    r = get_client()
    session = {
        "order_id": order_id,
        "buyer_id": buyer_id,
        "runner_id": runner_id,
        "status": "active",
        "created_at": time.time(),
    }
    r.set(f"tracking:order:{order_id}", json.dumps(session), ex=SESSION_TTL)
    logger.info("Created tracking session for order %s", order_id)
    return session


def get_tracking_session(order_id: str) -> dict | None:
    r = get_client()
    data = r.get(f"tracking:order:{order_id}")
    if data is None:
        return None
    return json.loads(data)


def delete_tracking_session(order_id: str):
    r = get_client()
    keys = [
        f"tracking:order:{order_id}",
        f"location:order:{order_id}:buyer",
        f"location:order:{order_id}:runner",
        f"conn:order:{order_id}:buyer",
        f"conn:order:{order_id}:runner",
    ]
    r.delete(*keys)
    logger.info("Deleted tracking session and data for order %s", order_id)


# ── GPS Locations ──────────────────────────────────────────────────────────
# Written every ~3 seconds by buyer/runner via WebSocket

def set_location(order_id: str, role: str, lat: float, lng: float, user_id: str):
    r = get_client()
    location = {
        "lat": lat,
        "lng": lng,
        "user_id": user_id,
        "timestamp": time.time(),
    }
    r.set(f"location:order:{order_id}:{role}", json.dumps(location), ex=LOCATION_TTL)


def get_location(order_id: str, role: str) -> dict | None:
    r = get_client()
    data = r.get(f"location:order:{order_id}:{role}")
    if data is None:
        return None
    return json.loads(data)


# ── WebSocket Connection Registry ─────────────────────────────────────────
# Maps order_id + role -> connectionId and reverse lookup for disconnect cleanup

def register_connection(order_id: str, role: str, connection_id: str):
    r = get_client()
    pipe = r.pipeline()
    pipe.set(f"conn:order:{order_id}:{role}", connection_id, ex=CONNECTION_TTL)
    pipe.set(
        f"conn:reverse:{connection_id}",
        json.dumps({"order_id": order_id, "role": role}),
        ex=CONNECTION_TTL,
    )
    pipe.execute()
    logger.info("Registered connection %s for order %s role %s", connection_id, order_id, role)


def get_connection_id(order_id: str, role: str) -> str | None:
    r = get_client()
    return r.get(f"conn:order:{order_id}:{role}")


def get_reverse_connection(connection_id: str) -> dict | None:
    r = get_client()
    data = r.get(f"conn:reverse:{connection_id}")
    if data is None:
        return None
    return json.loads(data)


def remove_connection(connection_id: str):
    r = get_client()
    reverse = get_reverse_connection(connection_id)
    pipe = r.pipeline()
    pipe.delete(f"conn:reverse:{connection_id}")
    if reverse:
        pipe.delete(f"conn:order:{reverse['order_id']}:{reverse['role']}")
    pipe.execute()
    logger.info("Removed connection %s", connection_id)


def resolve_role(order_id: str, user_id: str) -> str | None:
    session = get_tracking_session(order_id)
    if session is None:
        return None
    if user_id == session["buyer_id"]:
        return "buyer"
    if user_id == session["runner_id"]:
        return "runner"
    return None
