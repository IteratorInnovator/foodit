import os
from dotenv import load_dotenv

load_dotenv()

AWS_REGION = os.environ["AWS_REGION"]
STORES_TABLE = os.environ["STORES_TABLE"]
ITEMS_TABLE = os.environ["ITEMS_TABLE"]