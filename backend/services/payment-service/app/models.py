from typing import Optional
from pydantic import BaseModel


# Stripe Direct
class PaymentIntentRequest(BaseModel):
    user_id: str
    customer_id: str
    amount: float
    metadata: Optional[dict] = None


class PaymentIntentResponse(BaseModel):
    payment_intent_id: str
    status: str
    amount: float
    currency: str


class TransferRequest(BaseModel):
    user_id: str
    destination_account_id: str
    amount: float
    payment_intent_id: Optional[str] = None
    description: Optional[str] = None
    metadata: Optional[dict] = None


class TransferResponse(BaseModel):
    transfer_id: str
    amount: float
    currency: str


class RefundRequest(BaseModel):
    user_id: str
    payment_intent_id: str
    amount: Optional[float] = None


class RefundResponse(BaseModel):
    refund_id: str
    status: str
    amount: float


# Runner
class OnboardRunnerRequest(BaseModel):
    email: str
    name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class OnboardRunnerResponse(BaseModel):
    stripe_connect_id: str
    message: str


# Buyer
class OnboardBuyerRequest(BaseModel):
    email: str
    name: str
    metadata: Optional[dict] = None


class OnboardBuyerResponse(BaseModel):
    stripe_customer_id: str
    message: str


# Transactions
class Transaction(BaseModel):
    id: str
    type: str
    user_id: str
    amount: float
    status: Optional[str] = None
    created_at: str
