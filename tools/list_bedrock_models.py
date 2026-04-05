import boto3
from dotenv import load_dotenv
import os

load_dotenv()

client = boto3.client(
    "bedrock",
    region_name=os.getenv("AWS_REGION", "us-east-1"),
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
)

response = client.list_foundation_models()

models = response["modelSummaries"]
print(f"Found {len(models)} models:\n")

for model in sorted(models, key=lambda m: m["modelId"]):
    print(f"  {model['modelId']}")
    print(f"    Provider : {model['providerName']}")
    print(f"    Name     : {model['modelName']}")
    print(f"    Input    : {', '.join(model.get('inputModalities', []))}")
    print(f"    Output   : {', '.join(model.get('outputModalities', []))}")
    print()
