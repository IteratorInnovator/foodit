from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
import logging
import time

from app import redis_client
from app.connection_registry import registry
from app.pubsub_manager import pubsub_manager

router = APIRouter()
logger = logging.getLogger(__name__)


@router.websocket("/ws/location")
async def websocket_endpoint(websocket: WebSocket):
    """
    Native WebSocket endpoint for real-time GPS tracking.

    Flow:
    1. Client connects → sends {"type": "connect", "order_id": "...", "user_id": "..."}
    2. Service determines role (buyer/runner) from tracking session
    3. Stores WebSocket in connection registry
    4. Client sends {"type": "update", "lat": ..., "lng": ...} every ~3 seconds
    5. Service publishes to Redis pub/sub → all pods receive
    6. Pods push updates to their local WebSocket connections
    """

    await websocket.accept()

    order_id = None
    role = None
    user_id = None

    logger.info("WebSocket connection accepted")

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type")

            if msg_type == "connect":
                order_id = message.get("order_id")
                user_id = message.get("user_id")

                if not order_id or not user_id:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Missing order_id or user_id"
                    })
                    continue

                session = redis_client.get_tracking_session(order_id)
                if not session:
                    await websocket.send_json({
                        "type": "error",
                        "message": "No active tracking session"
                    })
                    continue

                role = redis_client.resolve_role(order_id, user_id)
                if not role:
                    await websocket.send_json({
                        "type": "error",
                        "message": "User not authorized for this order"
                    })
                    continue

                await registry.add(order_id, role, websocket)

                logger.info(f"Registered: order={order_id}, role={role}, user={user_id}")

                await websocket.send_json({
                    "type": "connected",
                    "role": role,
                    "order_id": order_id
                })

            elif msg_type == "update":
                if not order_id or not role:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Not connected - send 'connect' first"
                    })
                    continue

                lat = message.get("lat")
                lng = message.get("lng")

                if lat is None or lng is None:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Missing lat or lng"
                    })
                    continue

                redis_client.set_location(order_id, role, float(lat), float(lng), user_id)

                await pubsub_manager.publish_location(
                    order_id=order_id,
                    role=role,
                    lat=float(lat),
                    lng=float(lng),
                    user_id=user_id,
                    timestamp=time.time()
                )

                await websocket.send_json({"type": "ack"})

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "disconnect":
                logger.info(f"Client requested disconnect: order={order_id}, role={role}")
                break

            else:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Unknown message type: {msg_type}"
                })

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: order={order_id}, role={role}")

    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)

    finally:
        if order_id and role:
            await registry.remove(order_id, role)
            logger.info(f"Cleaned up connection: order={order_id}, role={role}")
