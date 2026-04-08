import redis
import json
import asyncio
import logging
import threading

from app.config import settings
from app.connection_registry import registry

logger = logging.getLogger(__name__)


class PubSubManager:
    """
    Manages Redis pub/sub for broadcasting location updates across all pods.

    Architecture:
    - Each location update is PUBLISHED to channel "location:order:{order_id}"
    - All pods SUBSCRIBE to "location:*" pattern
    - When pod receives update, it checks if it has the OTHER party's connection
    - If yes, pushes update directly via WebSocket

    Threading Model:
    - Subscriber runs in background daemon thread (Redis pub/sub is blocking)
    - Publisher is async (called from WebSocket handler)
    - Bridge sync→async using event loop
    """

    def __init__(self):
        self._publish_client: redis.Redis = None
        self._subscribe_client: redis.Redis = None
        self._subscriber_thread: threading.Thread = None
        self._stop_event = threading.Event()
        self._event_loop: asyncio.AbstractEventLoop = None

    def start(self):
        """Start the pub/sub subscriber in background thread."""
        logger.info("Starting PubSubManager...")

        self._publish_client = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            ssl=settings.REDIS_SSL,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5
        )

        self._subscribe_client = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            ssl=settings.REDIS_SSL,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=None
        )

        try:
            self._event_loop = asyncio.get_running_loop()
        except RuntimeError:
            self._event_loop = asyncio.new_event_loop()

        self._subscriber_thread = threading.Thread(
            target=self._subscriber_loop,
            daemon=True,
            name="redis-pubsub-subscriber"
        )
        self._subscriber_thread.start()

        logger.info("✓ PubSubManager started")

    def stop(self):
        """Stop the subscriber gracefully."""
        logger.info("Stopping PubSubManager...")

        self._stop_event.set()

        if self._subscriber_thread:
            self._subscriber_thread.join(timeout=5)

        if self._publish_client:
            self._publish_client.close()

        if self._subscribe_client:
            self._subscribe_client.close()

        logger.info("✓ PubSubManager stopped")

    async def publish_location(self, order_id: str, role: str, lat: float,
                               lng: float, user_id: str, timestamp: float):
        """Publish location update to all pods via Redis pub/sub."""
        message = {
            "order_id": order_id,
            "role": role,
            "lat": lat,
            "lng": lng,
            "user_id": user_id,
            "timestamp": timestamp
        }

        channel = f"location:order:{order_id}"

        try:
            self._publish_client.publish(channel, json.dumps(message))
            logger.debug(f"Published location: order={order_id}, role={role}")
        except Exception as e:
            logger.error(f"Failed to publish location: {e}")

    def _subscriber_loop(self):
        """Background thread that subscribes to Redis pub/sub."""
        pubsub = self._subscribe_client.pubsub()

        try:
            pubsub.psubscribe("location:*")
            logger.info("✓ Subscribed to location:* channels")

            for message in pubsub.listen():
                if self._stop_event.is_set():
                    logger.info("Stop event received, exiting subscriber loop")
                    break

                if message["type"] == "pmessage":
                    try:
                        data = json.loads(message["data"])
                        self._handle_location_update(data)
                    except json.JSONDecodeError as e:
                        logger.error(f"Invalid JSON in pub/sub message: {e}")
                    except Exception as e:
                        logger.error(f"Error handling pub/sub message: {e}", exc_info=True)

        except Exception as e:
            logger.error(f"Subscriber loop error: {e}", exc_info=True)

        finally:
            pubsub.punsubscribe("location:*")
            pubsub.close()
            logger.info("Subscriber loop exited")

    def _handle_location_update(self, data: dict):
        """Handle incoming location update from Redis pub/sub."""
        order_id = data["order_id"]
        role = data["role"]

        other_role = "buyer" if role == "runner" else "runner"

        logger.debug(f"Received pub/sub: order={order_id}, from={role}, sending_to={other_role}")

        asyncio.run_coroutine_threadsafe(
            self._push_to_connection(order_id, other_role, data),
            self._event_loop
        )

    async def _push_to_connection(self, order_id: str, role: str, data: dict):
        """Push location update to WebSocket connection."""
        websocket = await registry.get(order_id, role)

        if websocket:
            try:
                await websocket.send_json({
                    "type": "location_update",
                    "order_id": data["order_id"],
                    "role": data["role"],
                    "lat": data["lat"],
                    "lng": data["lng"],
                    "user_id": data["user_id"],
                    "timestamp": data["timestamp"]
                })

                logger.debug(f"✓ Pushed to {role} for order {order_id}")

            except Exception as e:
                logger.error(f"Failed to push to WebSocket: {e}")
                await registry.remove(order_id, role)
        else:
            logger.debug(
                f"No local connection for order={order_id}, role={role} "
                "(another pod has it)"
            )


pubsub_manager = PubSubManager()
