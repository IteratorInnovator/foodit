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

table = dynamodb.Table(os.environ["ITEMS_TABLE"])

menu_items = [
    {
        "store_id": "bcfb3664-d8bf-45a6-a610-676f8e4b9966",
        "item_id": "5347aeb7-c5bc-47e0-ada7-fa911aac60f2",
        "name": "Laksa",
        "price": Decimal("5.2"),
    },
    {
        "store_id": "bcfb3664-d8bf-45a6-a610-676f8e4b9966",
        "item_id": "8ae1142b-f8d5-4ade-8901-245df29707c4",
        "name": "Chicken Rice",
        "price": Decimal("4.5"),
    },
    {
        "store_id": "bcfb3664-d8bf-45a6-a610-676f8e4b9966",
        "item_id": "d553ef45-fa98-4923-bd1f-1f198d64c855",
        "name": "Ban Mian",
        "price": Decimal("5"),
    },
    {
        "store_id": "7ad9ef9a-8a40-408c-a491-e82cd851d060",
        "item_id": "30768f9d-05f4-4b3d-ab17-4bde1070e8a4",
        "name": "Protein Supreme",
        "price": Decimal("7.5"),
    },
    {
        "store_id": "7ad9ef9a-8a40-408c-a491-e82cd851d060",
        "item_id": "373f2cb0-8108-4e29-9a5c-dc01db5bf02b",
        "name": "Mango Magic",
        "price": Decimal("6.5"),
    },
    {
        "store_id": "7ad9ef9a-8a40-408c-a491-e82cd851d060",
        "item_id": "cd8dd6cc-a6cd-49ff-93f7-ab36fef35cb2",
        "name": "All Berry Bang",
        "price": Decimal("6.5"),
    },
    {
        "store_id": "87c51997-c25b-4388-9ed9-dee3bf48b58e",
        "item_id": "6a7b1c75-2919-44e4-9fd8-0676d38e8fb6",
        "name": "Bolognese",
        "price": Decimal("7.8"),
    },
    {
        "store_id": "87c51997-c25b-4388-9ed9-dee3bf48b58e",
        "item_id": "79ed37a7-0e9e-41ef-afbb-a96dd97c3502",
        "name": "Arrabiata",
        "price": Decimal("7.2"),
    },
    {
        "store_id": "87c51997-c25b-4388-9ed9-dee3bf48b58e",
        "item_id": "b5676416-6c13-4753-8c48-67c49bbf11c3",
        "name": "Aglio Olio",
        "price": Decimal("6.8"),
    },
    {
        "store_id": "87c51997-c25b-4388-9ed9-dee3bf48b58e",
        "item_id": "c504eb46-2075-4e4d-9150-38d0c7953332",
        "name": "Carbonara",
        "price": Decimal("7.8"),
    },
    {
        "store_id": "ae0488cb-a3a2-4f1c-8e37-8ab07280d9b6",
        "item_id": "639808ba-34e7-4e5d-b975-785b5904596c",
        "name": "Chicken Teriyaki",
        "price": Decimal("8.2"),
    },
    {
        "store_id": "ae0488cb-a3a2-4f1c-8e37-8ab07280d9b6",
        "item_id": "7f73ca52-5fb1-42f9-b6d8-45c0584dd936",
        "name": "Italian B.M.T.",
        "price": Decimal("7.9"),
    },
    {
        "store_id": "ae0488cb-a3a2-4f1c-8e37-8ab07280d9b6",
        "item_id": "bca6eabc-2746-407a-bfcf-7c9d0a1f48da",
        "name": "Tuna Sub",
        "price": Decimal("7.5"),
    },
    {
        "store_id": "597522e4-c1cf-45cb-b013-fa77cb349206",
        "item_id": "1411cc6f-829a-41d4-a03a-60c0746d68e5",
        "name": "Quesadilla",
        "price": Decimal("8.2"),
    },
    {
        "store_id": "597522e4-c1cf-45cb-b013-fa77cb349206",
        "item_id": "1df73c45-93eb-4ae1-bb26-b773c5e216d7",
        "name": "Chicken Burrito",
        "price": Decimal("8.9"),
    },
    {
        "store_id": "597522e4-c1cf-45cb-b013-fa77cb349206",
        "item_id": "ec9732e8-64e6-4dbc-bc69-6f04950bda8a",
        "name": "Beef Daily Bowl",
        "price": Decimal("9.5"),
    },
]


def seed() -> None:
    for item in menu_items:
        table.put_item(Item=item)
        print(f"Inserted: {item['name']}")

    print(f"\nSuccessfully inserted {len(menu_items)} items")


if __name__ == "__main__":
    seed()
