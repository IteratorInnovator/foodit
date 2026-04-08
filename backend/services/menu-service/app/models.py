from pydantic import BaseModel
from typing import List

class Store(BaseModel):
    store_id: str
    name: str
    cuisine: str
    image_url: str
    address: str
    lat: float
    lng: float
    place_id: str

class MenuItem(BaseModel):
    store_id: str
    item_id: str
    name: str
    price: float

class StoreWithMenu(Store):
    menu: List[MenuItem]