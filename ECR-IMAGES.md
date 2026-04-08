# AWS ECR Image Registry

## Image Tagging Strategy

Each service builds and pushes **2 Docker images** with different tags on every push to `main`:

1. **Commit SHA Tag** - For traceability and rollback
2. **Latest Tag** - For development and staging

### Example Build Output

```bash
# Build command creates both tags
docker build --pull \
  -t 123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/order-service:abc12345 \
  -t 123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/order-service:latest .

# Push both tags
docker push 123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/order-service:abc12345
docker push 123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/order-service:latest
```

---

## ECR Repository Structure

```
AWS ECR (ap-southeast-1)
├── foodit/order-service
│   ├── abc12345 (commit SHA)
│   └── latest
├── foodit/user-service
│   ├── def67890
│   └── latest
├── foodit/chat-service
│   ├── ghi11111
│   └── latest
├── foodit/payment-service
│   ├── jkl22222
│   └── latest
├── foodit/location-service
│   ├── mno33333
│   └── latest
├── foodit/menu-service
│   ├── pqr44444
│   └── latest
├── foodit/order-management-service
│   ├── stu55555
│   └── latest
├── foodit/delivery-management-service
│   ├── vwx66666
│   └── latest
└── foodit/payment-management-service
    ├── yz777777
    └── latest
```

---

## Image URI Format

```
<AWS_ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/<REPOSITORY>:<TAG>
```

### Components

- **AWS_ACCOUNT_ID** - Your 12-digit AWS account ID
- **REGION** - `ap-southeast-1` (Singapore)
- **REPOSITORY** - `foodit/<service-name>`
- **TAG** - Either commit SHA (e.g., `abc12345`) or `latest`

### All Service Image URIs

Replace `<AWS_ACCOUNT_ID>` with your actual AWS account ID:

```bash
# Order Service
<AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/order-service:latest
<AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/order-service:<commit-sha>

# User Service
<AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/user-service:latest
<AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/user-service:<commit-sha>

# Chat Service
<AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/chat-service:latest
<AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/chat-service:<commit-sha>

# Payment Service
<AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/payment-service:latest
<AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/payment-service:<commit-sha>

# Location Service
<AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/location-service:latest
<AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/location-service:<commit-sha>

# Menu Service
<AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/menu-service:latest
<AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/menu-service:<commit-sha>

# Order Management Service
<AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/order-management-service:latest
<AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/order-management-service:<commit-sha>

# Delivery Management Service
<AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/delivery-management-service:latest
<AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/delivery-management-service:<commit-sha>

# Payment Management Service
<AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/payment-management-service:latest
<AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/payment-management-service:<commit-sha>
```

---

## Usage in Kubernetes

### Deployment Example

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
spec:
  template:
    spec:
      containers:
      - name: order-service
        # Option 1: Use latest (for dev/staging)
        image: <AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/order-service:latest

        # Option 2: Use specific commit SHA (for production)
        # image: <AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/order-service:abc12345

        imagePullPolicy: Always  # Always pull latest
```

### ImagePullSecrets

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: ecr-registry-secret
  namespace: foodit
type: kubernetes.io/dockerconfigjson
data:
  .dockerconfigjson: <base64-encoded-docker-config>
```

---

## Benefits of Dual Tagging

### 1. Commit SHA Tag (`abc12345`)
- ✅ **Immutable** - Never changes, ensures consistency
- ✅ **Traceable** - Links directly to Git commit
- ✅ **Rollback** - Easy to revert to specific version
- ✅ **Production** - Best for production deployments

**Use case:**
```bash
# Deploy specific version to production
kubectl set image deployment/order-service \
  order-service=<ECR_URI>/foodit/order-service:abc12345
```

### 2. Latest Tag (`latest`)
- ✅ **Convenience** - No need to update version numbers
- ✅ **Development** - Quick testing of newest changes
- ✅ **CI/CD** - Automatic updates in dev/staging

**Use case:**
```bash
# Always pull newest version in development
docker pull <ECR_URI>/foodit/order-service:latest
```

---

## Viewing Images in ECR

### List All Tags for a Service

```bash
aws ecr list-images \
  --repository-name foodit/order-service \
  --region ap-southeast-1
```

### Get Image Details

```bash
aws ecr describe-images \
  --repository-name foodit/order-service \
  --image-ids imageTag=latest \
  --region ap-southeast-1
```

### Get Image Digest

```bash
aws ecr batch-get-image \
  --repository-name foodit/order-service \
  --image-ids imageTag=latest \
  --query 'images[].imageId.imageDigest' \
  --output text \
  --region ap-southeast-1
```

---

## Image Lifecycle Management

### Retention Policy

Configure lifecycle policies to automatically delete old images:

```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep last 10 images",
      "selection": {
        "tagStatus": "any",
        "countType": "imageCountMoreThan",
        "countNumber": 10
      },
      "action": {
        "type": "expire"
      }
    }
  ]
}
```

Apply policy:
```bash
aws ecr put-lifecycle-policy \
  --repository-name foodit/order-service \
  --lifecycle-policy-text file://lifecycle-policy.json \
  --region ap-southeast-1
```

---

## Security

### Image Scanning

All ECR repositories have **scan on push** enabled:

```bash
aws ecr describe-images \
  --repository-name foodit/order-service \
  --image-ids imageTag=latest \
  --region ap-southeast-1 \
  --query 'imageDetails[0].imageScanStatus'
```

### View Scan Results

```bash
aws ecr describe-image-scan-findings \
  --repository-name foodit/order-service \
  --image-id imageTag=latest \
  --region ap-southeast-1
```

---

## Quick Reference

| Action | Command |
|--------|---------|
| Login to ECR | `aws ecr get-login-password --region ap-southeast-1 \| docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com` |
| Pull latest image | `docker pull <ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/order-service:latest` |
| Pull specific version | `docker pull <ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/order-service:abc12345` |
| List all images | `aws ecr list-images --repository-name foodit/order-service --region ap-southeast-1` |
| Delete image | `aws ecr batch-delete-image --repository-name foodit/order-service --image-ids imageTag=abc12345 --region ap-southeast-1` |
