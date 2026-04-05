import boto3
import json
from dotenv import load_dotenv
import os

load_dotenv()

client = boto3.client(
    "bedrock-runtime",
    region_name=os.getenv("AWS_REGION", "us-east-1"),
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
)

model_id = "moonshotai.kimi-k2.5"

payload = {
    "messages": [
        {"role": "user", "content": [{"type": "text", "text": "Say hello and tell me what model you are."}]}
    ]
}

response = client.invoke_model(
    modelId=model_id,
    body=json.dumps(payload),
    contentType="application/json",
    accept="application/json",
)

result = json.loads(response["body"].read())
print(json.dumps(result, indent=2))
