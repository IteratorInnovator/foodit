import boto3
from .config import AWS_REGION, STORES_TABLE, ITEMS_TABLE

dynamodb = boto3.resource(
    "dynamodb",
    region_name=AWS_REGION,
)

stores_table = dynamodb.Table(STORES_TABLE)
items_table = dynamodb.Table(ITEMS_TABLE)