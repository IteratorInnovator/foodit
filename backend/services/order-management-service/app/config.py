from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = {"env_file": ".env"}

    AWS_REGION: str = "ap-southeast-1"
    ENV: str = "dev"

    # Internal service URLs (injected by K8s ConfigMap)
    ORDER_SERVICE_URL: str = "http://localhost:8001"
    USER_SERVICE_URL: str = "http://localhost:8002"
    PAYMENT_WRAPPER_SERVICE_URL: str = "http://localhost:8003"

    # Kafka (MSK Serverless) — event publishing
    KAFKA_BROKERS: str = "localhost:9092"
    KAFKA_TOPIC_ORDERS: str = "orders"


settings = Settings()
