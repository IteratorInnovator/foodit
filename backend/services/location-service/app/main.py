import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import redis_client
from app.config import settings
from app.pubsub_manager import pubsub_manager
from app.routes.location import router as location_router
from app.routes.websocket import router as websocket_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.getLogger(__name__).info("Starting location-service (env=%s)", settings.ENV)
    pubsub_manager.start()
    yield
    pubsub_manager.stop()
    redis_client.close_client()


app = FastAPI(title="Foodit Location Service", lifespan=lifespan)

app.include_router(location_router)
app.include_router(websocket_router)


@app.get("/health")
def health_check():
    return {"status": "healthy"}
