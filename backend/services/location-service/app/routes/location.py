import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import redis_client

router = APIRouter(prefix="/location", tags=["location"])
logger = logging.getLogger(__name__)


class CreateSessionRequest(BaseModel):
    order_id: str
    buyer_id: str
    runner_id: str


@router.post("/sessions", status_code=201)
def create_session(body: CreateSessionRequest):
    """Called by delivery-management-service when order.accepted is consumed."""
    redis_client.create_tracking_session(body.order_id, body.buyer_id, body.runner_id)
    logger.info("Session created via REST: order=%s", body.order_id)
    return {"session_id": body.order_id}


@router.put("/sessions/{session_id}/close")
def close_session(session_id: str):
    """Called by delivery-management-service when order.completed or order.mia is consumed."""
    session = redis_client.get_tracking_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="No active tracking session")
    redis_client.delete_tracking_session(session_id)
    logger.info("Session closed via REST: order=%s", session_id)
    return {"status": "closed", "session_id": session_id}


@router.get("/{order_id}")
def get_locations(order_id: str):
    session = redis_client.get_tracking_session(order_id)
    if session is None:
        raise HTTPException(status_code=404, detail="No active tracking session")

    buyer_loc = redis_client.get_location(order_id, "buyer")
    runner_loc = redis_client.get_location(order_id, "runner")

    return {
        "order_id": order_id,
        "status": session.get("status", "active"),
        "buyer": buyer_loc,
        "runner": runner_loc,
    }


@router.get("/{order_id}/session")
def get_session(order_id: str):
    session = redis_client.get_tracking_session(order_id)
    if session is None:
        raise HTTPException(status_code=404, detail="No active tracking session")
    return session
