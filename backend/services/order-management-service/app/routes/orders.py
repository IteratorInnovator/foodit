import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app import kafka_producer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orders")

# ── Request Models ────────────────────────────────────────────────────────


class CartItem(BaseModel):
    menu_item_id: str
    name: str
    quantity: int
    unit_price: int


class DropOff(BaseModel):
    address: str
    latitude: float
    longitude: float


class CheckoutRequest(BaseModel):
    buyer_id: str
    menu_store_id: str
    items: list[CartItem]
    description: str | None = None
    food_cost: int
    delivery_fee: int
    platform_fee: int
    drop_off: DropOff


class AcceptRequest(BaseModel):
    runner_id: str


# ── Helpers ───────────────────────────────────────────────────────────────

def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _call_service(method: str, url: str, **kwargs) -> httpx.Response:
    try:
        async with httpx.AsyncClient() as client:
            resp = await getattr(client, method)(url, **kwargs)
        return resp
    except httpx.HTTPError as exc:
        logger.exception("Downstream service call failed: %s %s", method.upper(), url)
        raise HTTPException(
            status_code=502,
            detail=f"Downstream service unavailable: {url}",
        ) from exc


# ── POST /orders/checkout ─────────────────────────────────────────────────

@router.post("/checkout", status_code=201)
async def checkout(body: CheckoutRequest):
    # 1. Get buyer's Stripe Customer ID from User Service
    user_resp = await _call_service(
        "get",
        f"{settings.USER_SERVICE_URL}/api/users/{body.buyer_id}/stripe/customer",
    )
    if user_resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch buyer payment info")
    stripe_customer_id = user_resp.json()["stripe_customer_id"]

    # 2. Create PaymentIntent via Payment Wrapper Service
    total_amount_cents = body.food_cost + body.delivery_fee + body.platform_fee
    pay_resp = await _call_service(
        "post",
        f"{settings.PAYMENT_WRAPPER_SERVICE_URL}/payments/create",
        json={
            "user_id": body.buyer_id,
            "customer_id": stripe_customer_id,
            # payment-service expects major currency units, while checkout sends cents.
            "amount": total_amount_cents / 100,
        },
    )
    if pay_resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to create payment")
    payment_data = pay_resp.json()

    # 3. Create order via Order Service
    order_resp = await _call_service(
        "post",
        f"{settings.ORDER_SERVICE_URL}/api/orders",
        json={
            "buyer_id": body.buyer_id,
            "menu_store_id": body.menu_store_id,
            "items": [item.model_dump() for item in body.items],
            "food_cost": body.food_cost,
            "delivery_fee": body.delivery_fee,
            "platform_fee": body.platform_fee,
            "drop_off": {
                "lat": body.drop_off.latitude,
                "lng": body.drop_off.longitude,
                "address": body.drop_off.address,
            },
            "payment_intent_id": payment_data["payment_intent_id"],
            **({"description": body.description} if body.description else {}),
        },
    )
    if order_resp.status_code != 201:
        try:
            error_detail = order_resp.json().get("error") or order_resp.text
        except Exception:
            error_detail = order_resp.text
        raise HTTPException(status_code=502, detail=f"Failed to create order: {error_detail}")
    order_data = order_resp.json()

    return {
        "order_id": order_data["order_id"],
        "status": order_data["status"],
        "payment_intent_id": payment_data["payment_intent_id"],
    }


# ── PUT /orders/{order_id}/accept ─────────────────────────────────────────

@router.put("/{order_id}/accept")
async def accept_order(order_id: str, body: AcceptRequest):
    # 1. Update order status + assign runner via Order Service
    resp = await _call_service(
        "put",
        f"{settings.ORDER_SERVICE_URL}/api/orders/{order_id}/accept",
        json={"runner_id": body.runner_id},
    )
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="order not found")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to update order")
    order_data = resp.json()

    # 2. Publish Kafka event
    kafka_producer.publish({
        "event_type": "order.accepted",
        "order_id": order_id,
        "buyer_id": order_data["buyer_id"],
        "runner_id": order_data.get("runner_id", body.runner_id),
        "timestamp": _timestamp(),
    })

    return {"order_id": order_id, "status": "ACCEPTED", "runner_id": body.runner_id}


# ── PUT /orders/{order_id}/complete ───────────────────────────────────────

@router.put("/{order_id}/complete")
async def complete_order(order_id: str):
    # 1. Get current order to retrieve buyer_id and runner_id
    get_resp = await _call_service(
        "get",
        f"{settings.ORDER_SERVICE_URL}/api/orders/{order_id}",
    )
    if get_resp.status_code == 404:
        raise HTTPException(status_code=404, detail="order not found")
    if get_resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch order")
    order_data = get_resp.json()

    # 2. Update order status via Order Service
    resp = await _call_service(
        "put",
        f"{settings.ORDER_SERVICE_URL}/api/orders/{order_id}",
        json={"status": "COMPLETED"},
    )
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="order not found")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to update order")

    # 3. Publish Kafka event
    kafka_producer.publish({
        "event_type": "order.completed",
        "order_id": order_id,
        "buyer_id": order_data["buyer_id"],
        "runner_id": order_data.get("runner_id", ""),
        # Order Service stores amounts in cents; payment-service expects major units.
        "amount": (order_data.get("delivery_fee", 0) + order_data.get("food_cost", 0)) / 100,
        "payment_intent_id": order_data.get("payment_intent_id", ""),
        "timestamp": _timestamp(),
    })

    return {"order_id": order_id, "status": "COMPLETED"}


# ── PUT /orders/{order_id}/cancel ─────────────────────────────────────────

@router.put("/{order_id}/cancel")
async def cancel_order(order_id: str):
    # 1. Get current order to check status and retrieve buyer_id
    get_resp = await _call_service(
        "get",
        f"{settings.ORDER_SERVICE_URL}/api/orders/{order_id}",
    )
    if get_resp.status_code == 404:
        raise HTTPException(status_code=404, detail="order not found")
    if get_resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch order")
    order_data = get_resp.json()

    if order_data["status"] != "PENDING":
        raise HTTPException(status_code=400, detail="can only cancel PENDING orders")

    # 2. Update order status via Order Service
    resp = await _call_service(
        "put",
        f"{settings.ORDER_SERVICE_URL}/api/orders/{order_id}/cancel",
    )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to update order")

    # 3. Publish Kafka event
    kafka_producer.publish({
        "event_type": "order.cancelled",
        "order_id": order_id,
        "buyer_id": order_data["buyer_id"],
        "timestamp": _timestamp(),
    })

    return {"order_id": order_id, "status": "CANCELLED"}


# ── PUT /orders/{order_id}/mia ────────────────────────────────────────────

@router.put("/{order_id}/mia")
async def mia_order(order_id: str):
    # 1. Get current order to retrieve buyer_id and runner_id
    get_resp = await _call_service(
        "get",
        f"{settings.ORDER_SERVICE_URL}/api/orders/{order_id}",
    )
    if get_resp.status_code == 404:
        raise HTTPException(status_code=404, detail="order not found")
    if get_resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch order")
    order_data = get_resp.json()

    # 2. Update order status via Order Service
    resp = await _call_service(
        "put",
        f"{settings.ORDER_SERVICE_URL}/api/orders/{order_id}",
        json={"status": "MIA"},
    )
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="order not found")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to update order")

    # 3. Publish Kafka event
    kafka_producer.publish({
        "event_type": "order.mia",
        "order_id": order_id,
        "buyer_id": order_data["buyer_id"],
        "runner_id": order_data.get("runner_id", ""),
        "payment_intent_id": order_data.get("payment_intent_id", ""),
        "timestamp": _timestamp(),
    })

    return {"order_id": order_id, "status": "MIA"}
