from fastapi import FastAPI

from app.routes import router

app = FastAPI(title="FoodIT Escrow Service")
app.include_router(router)
