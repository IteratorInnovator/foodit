# Foodit Backend — Infrastructure

AWS infrastructure + Kubernetes workloads managed by Terraform. All microservice images are pre-built in ECR. Persistent resources (databases, S3, Cognito, Secrets Manager, Lambda) are protected from destruction and survive teardowns.

---

## Architecture

```
Internet → API Gateway (Cognito JWT auth)
              ↓
           ALB (internet-facing)
              ↓
     EKS Fargate (9 services)
              ↓
     AWS Managed Services
       - DynamoDB (orders, users, menu_stores, menu_items, payments)
       - Keyspaces (chat_rooms, messages, chat_rooms_by_user)
       - MSK Provisioned (Kafka — order event bus)
       - ElastiCache Redis (location + chat pub/sub)
       - S3 (foodit-assets)
       - Secrets Manager (Stripe key)
       - Cognito (user auth)
       - Lambda (Cognito post_confirmation trigger)
```

### Service Communication

```
Order Management (orchestrator)
  → User Service (HTTP)         GET /api/users/{id}/stripe/customer
  → Payment Service (HTTP)      POST /payments/create
  → Order Service (HTTP)        POST /api/orders, PUT /api/orders/{id}
  → Kafka topic "orders"        publishes order.accepted/completed/cancelled/mia

Delivery Management (Kafka consumer: order.accepted, order.completed, order.mia)
  → Chat Service (HTTP)         POST /api/chat/rooms
  → Location Service (HTTP)     POST /location/sessions, PUT /location/sessions/{id}/close

Payment Management (Kafka consumer: order.completed, order.mia)
  → User Service (HTTP)         GET /api/users/{id}/stripe/connect
  → Payment Service (HTTP)      POST /transfers/create, POST /refunds/create
```

### ALB Ingress Routes

| Path | Service | Port |
|------|---------|------|
| `/health` | order-management-service | 80 |
| `/orders/*` | order-management-service | 80 |
| `/api/orders/*` | order-service | 80 |
| `/payments/*` | payment-wrapper-service | 80 |
| `/api/chat/*` | chat-service | 80 |
| `/location/*` | location-service | 80 |
| `/api/users/*` | user-service | 80 |
| `/stores/*` | menu-service | 80 |
| `/buyers/*`, `/runners/*`, `/transactions/*`, `/transfers/*`, `/refunds/*` | payment-wrapper-service | 80 |
| `/ws/chat/*` | chat-service (WebSocket) | 80 |
| `/ws/location` | location-service (WebSocket) | 80 |
| `/reviews/*` | Redirect to OutSystems | — |

---

## Prerequisites

- **AWS CLI** v2.x configured with `ap-southeast-1`
- **Terraform** v1.5+
- **kubectl**
- **Docker Desktop** (only needed if rebuilding images)

---

## Setup (Bring Up)

### Step 1: Initialize Terraform

```bash
cd infra/terraform
terraform init
```

### Step 2: Import persistent resources into state

These resources survive `terraform destroy` and must be re-imported each time:

```bash
# DynamoDB tables
terraform import aws_dynamodb_table.orders orders
terraform import aws_dynamodb_table.users users
terraform import aws_dynamodb_table.menu_stores menu_stores
terraform import aws_dynamodb_table.menu_items menu_items
terraform import aws_dynamodb_table.payments payments

# S3
terraform import aws_s3_bucket.assets foodit-assets

# Cognito
terraform import aws_cognito_user_pool.foodit ap-southeast-1_oMqPf53ag
terraform import aws_cognito_user_pool_client.foodit_client ap-southeast-1_oMqPf53ag/7325rcqvatrgsivism46je6foe

# Keyspaces
terraform import aws_keyspaces_keyspace.chat FoodIT
terraform import aws_keyspaces_table.chat_rooms FoodIT/chat_rooms
terraform import aws_keyspaces_table.messages FoodIT/messages
terraform import aws_keyspaces_table.chat_rooms_by_user FoodIT/chat_rooms_by_user

# Secrets Manager
terraform import aws_secretsmanager_secret.stripe_key foodit/stripe-secret

# CloudWatch (use MSYS_NO_PATHCONV=1 on Git Bash to prevent path conversion)
MSYS_NO_PATHCONV=1 terraform import 'module.eks.aws_cloudwatch_log_group.this[0]' /aws/eks/foodit-cluster/cluster
```

**Note:** The Cognito import requires the Kubernetes/Helm providers to be available, which need EKS to exist. If imports fail with "Invalid provider configuration", skip Cognito import for now and proceed to Step 3. Import it after Step 3 completes.

### Step 3: First apply — create compute + networking

This creates EKS, VPC, MSK Kafka, Redis, K8s pods, ALB, and API Gateway (without routes). Takes ~25 minutes (MSK Provisioned is the bottleneck).

```bash
terraform apply
```

**Note:** If the CloudWatch log group import in Step 2 failed, the apply may error with "log group already exists". Import it and re-run:
```bash
MSYS_NO_PATHCONV=1 terraform import 'module.eks.aws_cloudwatch_log_group.this[0]' /aws/eks/foodit-cluster/cluster
terraform apply
```

### Step 4: Patch CoreDNS for Fargate

```bash
aws eks update-kubeconfig --name foodit-cluster --region ap-southeast-1
kubectl patch deployment coredns -n kube-system -p '{"spec":{"template":{"metadata":{"annotations":{"eks.amazonaws.com/compute-type":"fargate"}}}}}'
```

### Step 5: Second apply — enable API Gateway routes

Once the ALB is up (created in Step 3), enable the API Gateway routes:

```bash
terraform apply -var="enable_api_routes=true"
```

### Step 6: Verify

```bash
# All 9 pods should be Running
kubectl get pods -n foodit

# Test health endpoint
curl http://$(terraform output -raw alb_dns)/health

# Test stores
curl http://$(terraform output -raw alb_dns)/stores
```

### Outputs

```bash
terraform output
```

| Output | Used By |
|--------|---------|
| `api_gateway_url` | Frontend — base URL for REST API calls |
| `alb_dns` | Frontend — WebSocket URL (`wss://<alb_dns>/ws/location`) |
| `cognito_user_pool_id` | Frontend — Cognito SDK |
| `cognito_app_client_id` | Frontend — Cognito SDK |
| `assets_bucket` | Menu service — S3 bucket for store images |

---

## Teardown (Bring Down)

### Step 1: Remove persistent resources from Terraform state

This tells Terraform to stop tracking them — they remain untouched in AWS.

```bash
cd infra/terraform

terraform state rm \
  aws_dynamodb_table.orders \
  aws_dynamodb_table.users \
  aws_dynamodb_table.menu_stores \
  aws_dynamodb_table.menu_items \
  aws_dynamodb_table.payments \
  aws_keyspaces_keyspace.chat \
  aws_keyspaces_table.chat_rooms \
  aws_keyspaces_table.messages \
  aws_keyspaces_table.chat_rooms_by_user \
  aws_s3_bucket.assets \
  aws_s3_bucket_public_access_block.assets \
  aws_secretsmanager_secret.stripe_key \
  aws_cognito_user_pool.foodit \
  aws_cognito_user_pool_client.foodit_client \
  aws_lambda_function.user_service \
  aws_lambda_permission.cognito_invoke \
  aws_iam_role.user_lambda_role \
  aws_iam_policy.user_dynamodb_policy \
  aws_iam_policy.user_lambda_logs \
  aws_iam_policy.user_lambda_vpc \
  aws_iam_role_policy_attachment.user_dynamodb_attach \
  aws_iam_role_policy_attachment.user_logs_attach \
  aws_iam_role_policy_attachment.user_vpc_attach \
  aws_security_group.user_lambda_sg
```

### Step 2: Destroy compute and networking

```bash
terraform destroy -auto-approve
```

This destroys: EKS, VPC, MSK Kafka, Redis, ALB, API Gateway, IAM roles, K8s resources.

This survives: DynamoDB tables, Keyspaces tables, S3 bucket, Secrets Manager, Cognito, Lambda, ECR images.

---

## What Survives Teardown (Free/Near-Free)

| Resource | Cost When Idle |
|----------|---------------|
| DynamoDB (5 tables, PAY_PER_REQUEST) | $0/day |
| Keyspaces (3 tables, on-demand) | ~$0/day |
| S3 (foodit-assets) | ~$0/day |
| Secrets Manager (1 secret) | $0.01/day |
| Cognito (user pool + client) | $0/day |
| Lambda (user-service trigger) | $0/day |
| ECR (9 repos with images) | ~$0/day |

## What Gets Destroyed (Costs Money)

| Resource | Cost/Day |
|----------|----------|
| EKS Control Plane | $2.40 |
| Fargate Pods (9x) | ~$1.50 |
| MSK Provisioned (2 brokers) | ~$4.80 |
| NAT Gateway | $1.17 |
| ElastiCache Redis | $0.41 |
| ALB | ~$0.64 |
| **Total** | **~$10.92/day** |

---

## Terraform Files

| File | Purpose |
|------|---------|
| `main.tf` | Provider configuration (AWS, Kubernetes, Helm) |
| `variables.tf` | Input variables (region, VPC CIDR, cluster name, enable_api_routes) |
| `vpc.tf` | VPC, subnets, NAT Gateway |
| `eks.tf` | EKS cluster, Fargate profiles, IRSA roles, IAM policies |
| `database.tf` | DynamoDB, ElastiCache Redis, MSK Kafka, Keyspaces, S3, Secrets Manager |
| `security.tf` | Security groups for Redis + Kafka |
| `apigateway.tf` | HTTP API Gateway, Cognito JWT authorizer, routes |
| `cognito.tf` | Cognito User Pool + App Client |
| `lambda.tf` | User service Lambda (Cognito trigger) |
| `kubernetes.tf` | K8s namespace, deployments, services, service accounts, ConfigMap, ALB Ingress, Helm ALB Controller |
| `outputs.tf` | Terraform outputs |

---

## Troubleshooting

### "Invalid provider configuration" during import
The Kubernetes/Helm providers depend on EKS. Skip the failing import, run `terraform apply` first, then import after.

### Pods stuck in ImagePullBackOff
All deployments use `imagePullPolicy: Always`. If still stuck, check ECR image exists:
```bash
aws ecr describe-images --repository-name foodit/<service-name> --region ap-southeast-1 --query 'imageDetails[?imageTags[?contains(@,`latest`)]].imageTags'
```

### CoreDNS Pending
Run the Fargate patch from Step 4.

### ALB not created
```bash
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
```

### Kafka consumers not receiving messages
Check consumer logs for SASL errors. Verify the IAM role has `kafka-cluster:*` permissions on the MSK cluster ARN.

### Chat service 500
Check Keyspaces IAM policy has `cassandra:*` on `*`. Verify `CASSANDRA_KEYSPACE=FoodIT` in the config map.

### Stripe calls failing
Ensure the Stripe key is set in Secrets Manager:
```bash
aws secretsmanager put-secret-value --secret-id foodit/stripe-secret --secret-string "sk_test_YOUR_KEY" --region ap-southeast-1
```
