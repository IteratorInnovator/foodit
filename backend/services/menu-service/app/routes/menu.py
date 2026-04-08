from fastapi import APIRouter, HTTPException
from typing import List
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from ..db import stores_table, items_table
from ..models import Store, MenuItem

router = APIRouter(tags=["menu"])

@router.get("/stores", response_model=List[Store])
def get_stores():
    try:
        res = stores_table.scan()
        items = res.get("Items", [])

        # Optional: handle pagination (if > 1MB)
        while "LastEvaluatedKey" in res:
            res = stores_table.scan(ExclusiveStartKey=res["LastEvaluatedKey"])
            items.extend(res.get("Items", []))

        return items
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/stores/{store_id}", response_model=Store)
def get_store(store_id: str):
    try:
        res = stores_table.get_item(Key={"store_id": store_id})
        item = res.get("Item")

        if not item:
            raise HTTPException(status_code=404, detail="Store not found")

        return item
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/stores/{store_id}/items", response_model=List[MenuItem])
def get_store_menu(store_id: str):
    try:
        res = items_table.query(
            KeyConditionExpression=Key("store_id").eq(store_id)
        )
        return res.get("Items", [])
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/health")
def health():
    return {"status": "healthy"}