import time
import stripe

from app.config import settings

stripe.api_key = settings.STRIPE_API_KEY
HARDCODED_PHONE = "+6580000000"


def create_runner_account(
    email: str,
    first_name: str,
    last_name: str,
) -> stripe.Account:
    individual = {
        "first_name": first_name,
        "last_name": last_name,
        "full_name_aliases": ["Test", "Test"],
        "nationality": "SG",
        "email": email,
        "phone": HARDCODED_PHONE,
        "dob": {"day": "1", "month": "1", "year": "2000"},
        "address": {
            "line1": "Sample Address",
            "postal_code": "Sample Postal",
            "city": "Singapore",
            "country": "SG",
        },
        "id_number": "S0000000Z",
    }

    return stripe.Account.create(
        type="custom",
        country="SG",
        email=email,
        capabilities={
            "card_payments": {"requested": True},
            "transfers": {"requested": True},
        },
        business_type="individual",
        business_profile={
            "mcc": "5734",
            "url": "https://accessible.stripe.com",
            "product_description": "Delivery Services SG",
        },
        individual=individual,
        tos_acceptance={"date": int(time.time()), "ip": "127.0.0.1"},
        external_account="btok_sg",
    )


def create_buyer_customer(email: str, name: str, metadata: dict | None) -> stripe.Customer:
    return stripe.Customer.create(
        email=email,
        name=name,
        phone=HARDCODED_PHONE,
        metadata=metadata or {},
    )


def create_payment_intent(buyer_id: str, amount_cents: int, metadata: dict | None) -> stripe.PaymentIntent:
    return stripe.PaymentIntent.create(
        amount=amount_cents,
        currency=settings.CURRENCY,
        customer=buyer_id,
        payment_method_types=["card"],
        payment_method="pm_card_visa",
        confirm=True,
        metadata=metadata or {},
    )


def create_transfer(
    amount_cents: int,
    destination: str,
    description: str,
    metadata: dict | None,
    source_transaction: str | None = None,
) -> stripe.Transfer:
    params = {
        "amount": amount_cents,
        "currency": settings.CURRENCY,
        "destination": destination,
        "description": description,
        "metadata": metadata or {},
    }
    if source_transaction:
        params["source_transaction"] = source_transaction
    return stripe.Transfer.create(**params)


def get_payment_intent_source_transaction(payment_intent_id: str) -> str:
    payment_intent = stripe.PaymentIntent.retrieve(payment_intent_id)
    latest_charge = getattr(payment_intent, "latest_charge", None)
    if not latest_charge:
        raise stripe.error.InvalidRequestError(
            "PaymentIntent has no latest_charge for transfer sourcing",
            param="payment_intent_id",
        )
    return str(latest_charge)


def create_refund(payment_intent_id: str, amount_cents: int | None) -> stripe.Refund:
    params = {"payment_intent": payment_intent_id}
    if amount_cents is not None:
        params["amount"] = amount_cents
    return stripe.Refund.create(**params)


def seed_test_balance(amount_cents: int) -> stripe.Charge:
    return stripe.Charge.create(
        amount=amount_cents,
        currency=settings.CURRENCY,
        source="tok_bypassPending",
        description="Test funds for platform balance",
    )
