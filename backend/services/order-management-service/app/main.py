import logging

from fastapi import FastAPI

from app.config import settings
from app.routes.orders import router as orders_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

app = FastAPI(title="Foodit Order Management Service")

app.include_router(orders_router)


@app.get("/")
def read_root():
    return {"message": "Foodit Order Management Service is running", "env": settings.ENV}


@app.get("/health")
def health_check():
    return {"status": "healthy"}
