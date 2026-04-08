from fastapi import WebSocket
import asyncio
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class ConnectionRegistry:
    """
    Thread-safe in-memory registry of active WebSocket connections.

    Structure: {order_id: {role: websocket}}
    Example: {"order-123": {"buyer": <WebSocket>, "runner": <WebSocket>}}
    """

    def __init__(self):
        self._connections: Dict[str, Dict[str, WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def add(self, order_id: str, role: str, websocket: WebSocket):
        """Register a WebSocket connection."""
        async with self._lock:
            if order_id not in self._connections:
                self._connections[order_id] = {}

            self._connections[order_id][role] = websocket
            logger.info(
                f"✓ Added connection: order={order_id}, role={role}, "
                f"total_orders={len(self._connections)}"
            )

    async def get(self, order_id: str, role: str) -> Optional[WebSocket]:
        """Get a specific WebSocket connection."""
        async with self._lock:
            return self._connections.get(order_id, {}).get(role)

    async def remove(self, order_id: str, role: str):
        """Remove a WebSocket connection."""
        async with self._lock:
            if order_id in self._connections:
                removed = self._connections[order_id].pop(role, None)

                if not self._connections[order_id]:
                    del self._connections[order_id]

                if removed:
                    logger.info(
                        f"✓ Removed connection: order={order_id}, role={role}, "
                        f"remaining_orders={len(self._connections)}"
                    )

    async def count(self) -> int:
        """Get total number of active orders."""
        async with self._lock:
            return len(self._connections)


registry = ConnectionRegistry()
