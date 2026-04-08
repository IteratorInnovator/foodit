from datetime import datetime
import boto3
from boto3.dynamodb.conditions import Key

from app.config import settings

dynamodb = boto3.resource(
    "dynamodb",
    region_name=settings.AWS_REGION,
)

payments_table = dynamodb.Table(settings.PAYMENTS_TABLE)


def save_payment(payment_intent_id: str, user_id: str, customer_id: str, amount: float, status: str):
    payments_table.put_item(Item={
        "user_id": user_id,
        "id": payment_intent_id,
        "type": "payment",
        "customer_id": customer_id,
        "amount": str(amount),
        "status": status,
        "created_at": datetime.utcnow().isoformat(),
    })


def save_transfer(transfer_id: str, user_id: str, destination_id: str, amount: float):
    payments_table.put_item(Item={
        "user_id": user_id,
        "id": transfer_id,
        "type": "transfer",
        "destination_id": destination_id,
        "amount": str(amount),
        "created_at": datetime.utcnow().isoformat(),
    })


def save_refund(refund_id: str, user_id: str, payment_intent_id: str, amount: float, status: str):
    payments_table.put_item(Item={
        "user_id": user_id,
        "id": refund_id,
        "type": "refund",
        "payment_intent_id": payment_intent_id,
        "amount": str(amount),
        "status": status,
        "created_at": datetime.utcnow().isoformat(),
    })


def get_transactions_by_user(user_id: str) -> list:
    response = payments_table.query(
        KeyConditionExpression=Key("user_id").eq(user_id),
    )
    return response.get("Items", [])
