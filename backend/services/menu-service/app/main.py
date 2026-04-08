from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes.menu import router as menu_router

app = FastAPI(title="FoodIT Menu Service")

# allow frontend calls
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(menu_router)

@app.get("/health")
def health():
    return {"status": "ok"}