import os
from decimal import Decimal

import boto3
from dotenv import load_dotenv

load_dotenv()

dynamodb = boto3.resource(
    "dynamodb",
    region_name=os.environ["AWS_REGION"],
    aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
)

table = dynamodb.Table(os.environ["STORES_TABLE"])

stores = [
    {
        "store_id": "bcfb3664-d8bf-45a6-a610-676f8e4b9966",
        "name": "Koufu",
        "cuisine": "Local",
        "image_url": "https://foodit-assets.s3.ap-southeast-1.amazonaws.com/stores/koufu.jpg",
        "address": "70 Stamford Rd, #B1-26/28, Singapore 178901",
        "lat": Decimal("1.2962936000000003"),
        "lng": Decimal("103.85015790000001"),
        "place_id": "ChIJl-wbe6MZ2jERbsynAv88UnY",
    },
    {
        "store_id": "7ad9ef9a-8a40-408c-a491-e82cd851d060",
        "name": "Boost Juice",
        "cuisine": "Drinks",
        "image_url": "https://foodit-assets.s3.ap-southeast-1.amazonaws.com/stores/boost.jpg",
        "address": "68 Orchard Rd, #B2-55 Plaza Singapura, Singapore 238839",
        "lat": Decimal("1.3004562"),
        "lng": Decimal("103.84500410000001"),
        "place_id": "ChIJc6zIfr0Z2jERSnr6SJ_NiZo",
    },
    {
        "store_id": "87c51997-c25b-4388-9ed9-dee3bf48b58e",
        "name": "Pasta Express",
        "cuisine": "Italian",
        "image_url": "https://foodit-assets.s3.ap-southeast-1.amazonaws.com/stores/pasta_express.jpg",
        "address": "40 Stamford Rd, Singapore 178908",
        "lat": Decimal("1.2959728000000001"),
        "lng": Decimal("103.849544"),
        "place_id": "ChIJ1fDPlqMZ2jERhVUhXOCHbFg",
    },
    {
        "store_id": "ae0488cb-a3a2-4f1c-8e37-8ab07280d9b6",
        "name": "Subway",
        "cuisine": "Sandwiches",
        "image_url": "https://foodit-assets.s3.ap-southeast-1.amazonaws.com/stores/subway.jpg",
        "address": "80 Stamford Rd, #01-62 SMU School of Computing and Information Systems Building, Singapore 178902",
        "lat": Decimal("1.2974603"),
        "lng": Decimal("103.8497504"),
        "place_id": "ChIJ-d6RjKMZ2jERWNy4OSVuFus",
    },
    {
        "store_id": "597522e4-c1cf-45cb-b013-fa77cb349206",
        "name": "Stuff'd",
        "cuisine": "Mexican",
        "image_url": "https://foodit-assets.s3.ap-southeast-1.amazonaws.com/stores/stuffd.jpg",
        "address": "252 North Bridge Road, #B1-56 Raffles City Shopping Centre, Singapore 179103",
        "lat": Decimal("1.2937139"),
        "lng": Decimal("103.8536702"),
        "place_id": "ChIJPXqA8LgZ2jER8cMngscWlh8",
    },
]


def seed() -> None:
    for store in stores:
        table.put_item(Item=store)
        print(f"Inserted: {store['name']}")

    print(f"\nSuccessfully inserted {len(stores)} stores")


if __name__ == "__main__":
    seed()
