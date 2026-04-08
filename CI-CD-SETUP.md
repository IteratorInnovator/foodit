# CI/CD Pipeline Setup

Foodit uses **GitLab CI/CD** to automatically build Docker images and push them to **AWS ECR (Elastic Container Registry)** on every push to the `main` branch.

## Pipeline Overview

Each microservice has its own `.gitlab-ci.yml` file with a standardized pipeline:

```
┌─────────────┐      ┌─────────────┐
│  Test Stage │  →   │ Build Stage │
│             │      │             │
│  • SAST     │      │ • Docker    │
│  • Secrets  │      │   Build     │
│             │      │ • ECR Push  │
└─────────────┘      └─────────────┘
```

### Pipeline Stages

1. **Test Stage**
   - **SAST (Static Application Security Testing)** - Scans code for security vulnerabilities
   - **Secret Detection** - Scans for accidentally committed secrets (API keys, passwords, etc.)
   - **Unit Tests** (location-service) - Runs pytest tests
   - **Linting** (location-service) - Runs ruff linter

2. **Build Stage**
   - Builds Docker image using the service's `Dockerfile`
   - Tags image with commit SHA and `latest`
   - Pushes both tags to AWS ECR

---

## AWS ECR Configuration

### ECR Repository Naming Convention

Each service pushes to its own ECR repository:

```
<AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/<service-name>:<tag>
```

**Example:**
```
123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/order-service:abc123
123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/order-service:latest
```

### Required ECR Repositories

Create these repositories in AWS ECR (ap-southeast-1):

- `foodit/order-service`
- `foodit/user-service`
- `foodit/chat-service`
- `foodit/payment-service`
- `foodit/location-service`
- `foodit/menu-service`
- `foodit/order-management-service`
- `foodit/delivery-management-service`
- `foodit/payment-management-service`

### Create ECR Repositories via AWS CLI

```bash
export AWS_REGION=ap-southeast-1

services=(
  "order-service"
  "user-service"
  "chat-service"
  "payment-service"
  "location-service"
  "menu-service"
  "order-management-service"
  "delivery-management-service"
  "payment-management-service"
)

for service in "${services[@]}"; do
  aws ecr create-repository \
    --repository-name "foodit/$service" \
    --region $AWS_REGION \
    --image-scanning-configuration scanOnPush=true \
    --encryption-configuration encryptionType=AES256
done
```

---

## GitLab CI/CD Variables

Configure these variables in GitLab:
**Settings → CI/CD → Variables**

| Variable | Description | Example | Protected | Masked |
|----------|-------------|---------|-----------|--------|
| `AWS_ACCOUNT_ID` | Your AWS Account ID | `123456789012` | ✅ | ✅ |
| `AWS_ACCESS_KEY_ID` | AWS IAM Access Key | `AKIA...` | ✅ | ✅ |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM Secret Key | `secret...` | ✅ | ✅ |
| `AWS_REGION` | AWS Region | `ap-southeast-1` | ❌ | ❌ |

### Required IAM Permissions

The IAM user/role must have these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## Pipeline Configuration

### Example .gitlab-ci.yml (order-service)

```yaml
stages:
  - test
  - build

include:
  - template: Security/SAST.gitlab-ci.yml
  - template: Security/Secret-Detection.gitlab-ci.yml

variables:
  SECRET_DETECTION_ENABLED: "true"
  AWS_REGION: ap-southeast-1
  ECR_REPOSITORY: foodit/order-service
  IMAGE_TAG: $CI_COMMIT_SHORT_SHA
  IMAGE_URI: $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG
  LATEST_IMAGE_URI: $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:latest

sast:
  stage: test

secret_detection:
  stage: test

build_and_push:
  stage: build
  image: docker:27
  services:
    - docker:27-dind
  variables:
    DOCKER_TLS_CERTDIR: "/certs"
  before_script:
    - apk add --no-cache python3 py3-pip
    - pip install --break-system-packages awscli
    - aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
  script:
    - docker build --pull -t "$IMAGE_URI" -t "$LATEST_IMAGE_URI" .
    - docker push "$IMAGE_URI"
    - docker push "$LATEST_IMAGE_URI"
  only:
    - main
```

### Key Variables Explained

- `$CI_COMMIT_SHORT_SHA` - First 8 characters of Git commit SHA (e.g., `abc12345`)
- `$AWS_ACCOUNT_ID` - Your AWS account ID (configured in GitLab variables)
- `$IMAGE_URI` - Full ECR image URI with commit SHA tag
- `$LATEST_IMAGE_URI` - Full ECR image URI with `latest` tag

---

## How It Works

### 1. Developer Pushes to Main Branch

```bash
git add .
git commit -m "feat: add new feature"
git push origin main
```

### 2. GitLab CI Triggers Pipeline

- Pipeline automatically runs on `main` branch only (configured via `only: - main`)

### 3. Test Stage Executes

```
✓ Running SAST scan...
✓ Running secret detection...
✓ All tests passed!
```

### 4. Build Stage Executes

```bash
# Authenticate to AWS ECR
aws ecr get-login-password | docker login ...

# Build Docker image with two tags
docker build -t 123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/order-service:abc12345 .
docker build -t 123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/order-service:latest .

# Push both tags to ECR
docker push 123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/order-service:abc12345
docker push 123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/order-service:latest
```

### 5. Images Available in ECR

Images can now be pulled by:
- EKS clusters
- EC2 instances
- Local development (with proper AWS credentials)

---

## Pulling Images from ECR

### Authenticate Docker to ECR

```bash
aws ecr get-login-password --region ap-southeast-1 | \
  docker login --username AWS --password-stdin \
  <AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com
```

### Pull Specific Version

```bash
docker pull <AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/order-service:abc12345
```

### Pull Latest Version

```bash
docker pull <AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/order-service:latest
```

---

## Monitoring Pipeline

### View Pipeline Status

1. Go to **GitLab → CI/CD → Pipelines**
2. Click on a pipeline to see detailed logs
3. Check each stage (Test, Build) for success/failure

### Common Issues

#### 1. **ECR Login Failed**
```
Error: Cannot perform an interactive login from a non TTY device
```

**Solution:** Ensure `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are set in GitLab variables.

#### 2. **ECR Repository Not Found**
```
Error: Repository does not exist
```

**Solution:** Create ECR repository using AWS CLI or Console (see above).

#### 3. **Permission Denied**
```
Error: denied: User is not authorized to perform: ecr:PutImage
```

**Solution:** Add required IAM permissions to the IAM user/role (see above).

---

## Best Practices

1. **Tag Strategy**
   - Use commit SHA for traceability
   - Use `latest` for development/staging
   - Use semantic versioning (e.g., `v1.2.3`) for production releases

2. **Security Scanning**
   - ECR image scanning is enabled (`scanOnPush=true`)
   - SAST catches vulnerabilities before deployment
   - Secret detection prevents credential leaks

3. **Multi-Environment Support**
   - Create separate ECR repositories for dev/staging/prod
   - Use GitLab environments to control deployments
   - Example: `foodit-dev/order-service`, `foodit-prod/order-service`

4. **Image Optimization**
   - Use multi-stage Dockerfiles to reduce image size
   - Leverage Docker layer caching
   - Use `.dockerignore` to exclude unnecessary files

---

## Troubleshooting

### Check GitLab Pipeline Logs

```bash
# View pipeline status
gitlab-runner verify

# Check specific job logs
gitlab-runner exec docker build_and_push
```

### Test ECR Push Locally

```bash
# Login to ECR
aws ecr get-login-password --region ap-southeast-1 | \
  docker login --username AWS --password-stdin \
  <AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com

# Build image
docker build -t foodit/order-service:test .

# Tag for ECR
docker tag foodit/order-service:test \
  <AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/order-service:test

# Push to ECR
docker push <AWS_ACCOUNT_ID>.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/order-service:test
```

### Verify Image in ECR

```bash
# List images in repository
aws ecr describe-images \
  --repository-name foodit/order-service \
  --region ap-southeast-1

# Get image details
aws ecr describe-images \
  --repository-name foodit/order-service \
  --image-ids imageTag=latest \
  --region ap-southeast-1
```

---

## Next Steps

After images are pushed to ECR:

1. **Update Kubernetes Deployments** - Point to new ECR image URIs
2. **Configure ArgoCD** - Sync Kubernetes manifests with ECR images
3. **Set up Image Promotion** - Promote images from dev → staging → prod
4. **Enable Auto-Deployment** - Use GitLab CI to deploy to EKS automatically

See `infrastructure/README.md` for deployment instructions.
