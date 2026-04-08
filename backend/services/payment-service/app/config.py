import os
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


def _get_stripe_key() -> str:
    """Fetch Stripe API key from Secrets Manager if STRIPE_SECRET_ID is set,
    otherwise fall back to STRIPE_API_KEY env var."""
    secret_id = os.getenv("STRIPE_SECRET_ID", "")
    if secret_id:
        try:
            import boto3
            region = os.getenv("AWS_REGION", "ap-southeast-1")
            client = boto3.client("secretsmanager", region_name=region)
            resp = client.get_secret_value(SecretId=secret_id)
            logger.info("Loaded Stripe key from Secrets Manager: %s", secret_id)
            return resp["SecretString"]
        except Exception as e:
            logger.warning("Failed to fetch Stripe key from Secrets Manager: %s", e)
    return os.getenv("STRIPE_API_KEY", "")


class Settings:
    # AWS
    AWS_REGION: str = os.getenv("AWS_REGION", "ap-southeast-1")

    # DynamoDB
    PAYMENTS_TABLE: str = os.getenv("PAYMENTS_TABLE", "payments")

    # Stripe
    STRIPE_API_KEY: str = _get_stripe_key()

    # Platform Settings
    PLATFORM_FEE_PERCENT: int = int(os.getenv("PLATFORM_FEE_PERCENT", "10"))
    CURRENCY: str = os.getenv("CURRENCY", "sgd")
    ENV: str = os.getenv("ENV", "dev")

settings = Settings()
