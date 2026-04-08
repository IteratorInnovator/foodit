from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = {"env_file": ".env"}

    AWS_REGION: str = "ap-southeast-1"
    ENV: str = "dev"

    # Redis (ElastiCache) — location caching
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_SSL: bool = False  # True in production (ElastiCache requires TLS)


settings = Settings()
