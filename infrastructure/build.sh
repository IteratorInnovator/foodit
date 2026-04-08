#!/bin/bash
# build.sh - Docker build & push helper for Foodit microservices
#
# Usage: ./build.sh <service-folder-name>
# Example: ./build.sh order-service
#
# Prerequisites:
#   - Service repos cloned as siblings (../order-service/, ../chat-service/, etc.)
#   - AWS CLI configured (aws configure)
#   - Docker running
#   - ECR repositories already created
#
# After pushing images, update terraform/kubernetes.tf with the ECR image URLs
# and run `terraform apply` to deploy the new images.

SERVICE=$1
REGION="ap-southeast-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URL="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/foodit-${SERVICE}"

if [ -z "$SERVICE" ]; then
  echo "Usage: ./build.sh <service-name>"
  exit 1
fi

if [ ! -d "../$SERVICE" ]; then
  echo "Error: ../$SERVICE not found. Clone the service repo as a sibling directory."
  exit 1
fi

echo "🔹 Logging into ECR..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com

echo "🔹 Building Docker Image for $SERVICE..."
docker build -t $SERVICE ../$SERVICE

echo "🔹 Tagging & Pushing..."
docker tag $SERVICE:latest $ECR_URL:latest
docker push $ECR_URL:latest

echo "✅ Success! Image pushed to: $ECR_URL:latest"