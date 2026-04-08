import stripe
from fastapi import APIRouter, HTTPException

from app.config import settings
from app.models import (
    OnboardRunnerRequest, OnboardRunnerResponse,
    OnboardBuyerRequest, OnboardBuyerResponse,
    PaymentIntentRequest, PaymentIntentResponse,
    TransferRequest, TransferResponse,
    RefundRequest, RefundResponse,
    Transaction,
)
from app import services, database

router = APIRouter()


def _resolve_runner_first_last_name(req: OnboardRunnerRequest) -> tuple[str, str]:
    if req.name and req.name.strip():
        parts = req.name.strip().split(maxsplit=1)
        first_name = parts[0]
        # Stripe expects both names; for single-token names, reuse the same token.
        last_name = parts[1] if len(parts) > 1 else parts[0]
        return first_name, last_name

    if req.first_name and req.last_name and req.first_name.strip() and req.last_name.strip():
        return req.first_name.strip(), req.last_name.strip()

    raise HTTPException(
        status_code=400,
        detail="Provide `name` or both `first_name` and `last_name`",
    )


@router.get("/")
def read_root():
    return {"message": "FoodIT Payment Service is running", "env": settings.ENV}


@router.get("/health")
def health_check():
    return {"status": "healthy"}


@router.get("/transactions/{user_id}", response_model=list[Transaction])
def get_transactions(user_id: str):
    items = database.get_transactions_by_user(user_id)
    return [
        Transaction(
            id=item["id"],
            type=item["type"],
            user_id=item["user_id"],
            amount=float(item["amount"]),
            status=item.get("status"),
            created_at=item["created_at"],
        )
        for item in items
    ]


@router.post("/runners/onboard", response_model=OnboardRunnerResponse)
def onboard_runner(req: OnboardRunnerRequest):
    first_name, last_name = _resolve_runner_first_last_name(req)
    try:
        account = services.create_runner_account(
            email=req.email,
            first_name=first_name,
            last_name=last_name,
        )
        return OnboardRunnerResponse(
            stripe_connect_id=account.id,
            message="Runner onboarded successfully",
        )
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/buyers/onboard", response_model=OnboardBuyerResponse)
def onboard_buyer(req: OnboardBuyerRequest):
    try:
        customer = services.create_buyer_customer(
            email=req.email,
            name=req.name,
            metadata=req.metadata,
        )
        return OnboardBuyerResponse(
            stripe_customer_id=customer.id,
            message="Buyer onboarded successfully",
        )
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/payments/create", response_model=PaymentIntentResponse)
def create_payment(req: PaymentIntentRequest):
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    try:
        amount_cents = round(req.amount * 100)
        payment = services.create_payment_intent(
            buyer_id=req.customer_id,
            amount_cents=amount_cents,
            metadata=req.metadata,
        )
        database.save_payment(
            payment_intent_id=payment.id,
            user_id=req.user_id,
            customer_id=req.customer_id,
            amount=round(amount_cents / 100, 2),
            status=payment.status,
        )
        return PaymentIntentResponse(
            payment_intent_id=payment.id,
            status=payment.status,
            amount=round(amount_cents / 100, 2),
            currency=settings.CURRENCY,
        )
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/transfers/create", response_model=TransferResponse)
def create_transfer(req: TransferRequest):
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    try:
        amount_cents = round(req.amount * 100)
        source_transaction = None
        if req.payment_intent_id:
            source_transaction = services.get_payment_intent_source_transaction(
                req.payment_intent_id
            )
        transfer = services.create_transfer(
            amount_cents=amount_cents,
            destination=req.destination_account_id,
            description=req.description or "Transfer",
            metadata=req.metadata,
            source_transaction=source_transaction,
        )
        database.save_transfer(
            transfer_id=transfer.id,
            user_id=req.user_id,
            destination_id=req.destination_account_id,
            amount=round(amount_cents / 100, 2),
        )
        return TransferResponse(
            transfer_id=transfer.id,
            amount=round(amount_cents / 100, 2),
            currency=settings.CURRENCY,
        )
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/refunds/create", response_model=RefundResponse)
def create_refund(req: RefundRequest):
    try:
        amount_cents = int(req.amount * 100) if req.amount is not None else None
        refund = services.create_refund(
            payment_intent_id=req.payment_intent_id,
            amount_cents=amount_cents,
        )
        database.save_refund(
            refund_id=refund.id,
            user_id=req.user_id,
            payment_intent_id=req.payment_intent_id,
            amount=round(refund.amount / 100, 2),
            status=refund.status,
        )
        return RefundResponse(
            refund_id=refund.id,
            status=refund.status,
            amount=round(refund.amount / 100, 2),
        )
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/balance/seed")
def seed_balance(amount: float = 1000):
    if settings.ENV == "prod":
        raise HTTPException(status_code=403, detail="Seeding is disabled in production")

    try:
        amount_cents = int(amount * 100)
        charge = services.seed_test_balance(amount_cents)
        return {
            "charge_id": charge.id,
            "amount": amount,
            "currency": settings.CURRENCY,
            "message": f"${amount:.2f} added to platform test balance",
        }
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))
