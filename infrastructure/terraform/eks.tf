# eks.tf
# ─────────────────────────────────────────────────────────────────────────────
# EKS Cluster + Fargate Profiles + IRSA (IAM Roles for Service Accounts)
#
# ARCHITECTURE:
#   - Fully serverless: NO EC2 worker nodes, everything runs on Fargate
#   - Control plane is managed by AWS (you never SSH into it)
#   - Two Fargate profiles: one for app pods (foodit), one for CoreDNS (kube-system)
#   - IRSA enables pods to assume AWS IAM roles without hardcoded credentials
#
# IRSA ROLES DEFINED HERE:
#   1. order-mgmt-sa       → Kafka (MSK) — composite orchestrator
#   2. order-service-sa    → DynamoDB (orders table) — atomic
#   3. payment-mgmt-sa     → Kafka + DynamoDB (payments table) — composite
#   4. payment-wrapper-sa  → Secrets Manager (Stripe key) — wrapper
#   5. location-sa         → no IAM policies — atomic (Redis + WebSocket only)
#   6. chat-sa             → Kafka (MSK) + Keyspaces — atomic (WebSocket)
#   7. user-service-sa     → DynamoDB (users table) — Fargate REST
#   8. menu-sa             → DynamoDB (menu tables) + S3 (images) — atomic
#   9. delivery-sa         → Kafka (MSK) — composite orchestrator
#  10. ALB Controller      → create/manage AWS Application Load Balancers
# ─────────────────────────────────────────────────────────────────────────────

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "19.21.0"

  cluster_name    = var.cluster_name
  cluster_version = "1.29"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  enable_irsa = true

  cluster_endpoint_public_access  = true
  cluster_endpoint_private_access = true

  fargate_profiles = {
    foodit_app = {
      name = "foodit-profile"
      selectors = [
        { namespace = "foodit" }
      ]
      subnet_ids = module.vpc.private_subnets
    }
    kube_system = {
      name = "coredns-profile"
      selectors = [
        { namespace = "kube-system" }
      ]
      subnet_ids = module.vpc.private_subnets
    }
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# SHARED POLICIES (reusable across multiple roles)
# ─────────────────────────────────────────────────────────────────────────────

# Kafka (MSK Serverless) — shared by all services that publish/consume events
resource "aws_iam_policy" "kafka_policy" {
  name = "foodit-kafka-access"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["kafka-cluster:Connect", "kafka-cluster:DescribeCluster"]
        Resource = aws_msk_cluster.kafka.arn
      },
      {
        Effect = "Allow"
        Action = [
          "kafka-cluster:CreateTopic",
          "kafka-cluster:DescribeTopic",
          "kafka-cluster:AlterTopic",
          "kafka-cluster:WriteData",
          "kafka-cluster:ReadData"
        ]
        Resource = "${replace(aws_msk_cluster.kafka.arn, ":cluster/", ":topic/")}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "kafka-cluster:DescribeGroup",
          "kafka-cluster:AlterGroup"
        ]
        Resource = "${replace(aws_msk_cluster.kafka.arn, ":cluster/", ":group/")}/*"
      }
    ]
  })
}

# Secrets Manager — Stripe key (used by payment-wrapper-service)
resource "aws_iam_policy" "secrets_policy" {
  name = "foodit-read-secrets"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = aws_secretsmanager_secret.stripe_key.arn
    }]
  })
}

# Keyspaces — chat tables (used by chat-service)
resource "aws_iam_policy" "keyspaces_policy" {
  name = "foodit-keyspaces-access"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["cassandra:*"]
        Resource = "*"
      }
    ]
  })
}

# ─────────────────────────────────────────────────────────────────────────────
# 1. ORDER MANAGEMENT SERVICE (Composite — Kafka publisher/consumer)
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_iam_role" "order_mgmt_role" {
  name = "foodit-order-mgmt-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = module.eks.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${module.eks.oidc_provider}:sub" = "system:serviceaccount:foodit:order-mgmt-sa"
          "${module.eks.oidc_provider}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "order_mgmt_kafka_attach" {
  role       = aws_iam_role.order_mgmt_role.name
  policy_arn = aws_iam_policy.kafka_policy.arn
}

# ─────────────────────────────────────────────────────────────────────────────
# 2. ORDER SERVICE (Atomic — DynamoDB only)
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_iam_role" "order_service_role" {
  name = "foodit-order-service-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = module.eks.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${module.eks.oidc_provider}:sub" = "system:serviceaccount:foodit:order-service-sa"
          "${module.eks.oidc_provider}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

resource "aws_iam_policy" "order_dynamodb_policy" {
  name = "foodit-order-dynamodb-access"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem", "dynamodb:PutItem",
        "dynamodb:UpdateItem", "dynamodb:DeleteItem",
        "dynamodb:Query", "dynamodb:Scan"
      ]
      Resource = [
        aws_dynamodb_table.orders.arn,
        "${aws_dynamodb_table.orders.arn}/index/*"
      ]
    }]
  })
}

resource "aws_iam_role_policy_attachment" "order_service_dynamodb_attach" {
  role       = aws_iam_role.order_service_role.name
  policy_arn = aws_iam_policy.order_dynamodb_policy.arn
}

# ─────────────────────────────────────────────────────────────────────────────
# 3. PAYMENT MANAGEMENT SERVICE (Composite — Kafka + DynamoDB payments)
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_iam_role" "payment_mgmt_role" {
  name = "foodit-payment-mgmt-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = module.eks.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${module.eks.oidc_provider}:sub" = "system:serviceaccount:foodit:payment-mgmt-sa"
          "${module.eks.oidc_provider}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

resource "aws_iam_policy" "payment_dynamodb_policy" {
  name = "foodit-payment-dynamodb-access"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem", "dynamodb:PutItem",
        "dynamodb:UpdateItem", "dynamodb:DeleteItem",
        "dynamodb:Query", "dynamodb:Scan"
      ]
      Resource = aws_dynamodb_table.payments.arn
    }]
  })
}

resource "aws_iam_role_policy_attachment" "payment_mgmt_kafka_attach" {
  role       = aws_iam_role.payment_mgmt_role.name
  policy_arn = aws_iam_policy.kafka_policy.arn
}

resource "aws_iam_role_policy_attachment" "payment_mgmt_dynamodb_attach" {
  role       = aws_iam_role.payment_mgmt_role.name
  policy_arn = aws_iam_policy.payment_dynamodb_policy.arn
}

# ─────────────────────────────────────────────────────────────────────────────
# 4. PAYMENT WRAPPER SERVICE (Wrapper — Secrets Manager for Stripe)
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_iam_role" "payment_wrapper_role" {
  name = "foodit-payment-wrapper-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = module.eks.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${module.eks.oidc_provider}:sub" = "system:serviceaccount:foodit:payment-wrapper-sa"
          "${module.eks.oidc_provider}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "payment_wrapper_secrets_attach" {
  role       = aws_iam_role.payment_wrapper_role.name
  policy_arn = aws_iam_policy.secrets_policy.arn
}

resource "aws_iam_policy" "payment_wrapper_dynamodb" {
  name = "foodit-payment-wrapper-dynamodb"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query", "dynamodb:Scan"]
      Resource = [
        aws_dynamodb_table.payments.arn,
        "${aws_dynamodb_table.payments.arn}/index/*"
      ]
    }]
  })
}

resource "aws_iam_role_policy_attachment" "payment_wrapper_dynamodb_attach" {
  role       = aws_iam_role.payment_wrapper_role.name
  policy_arn = aws_iam_policy.payment_wrapper_dynamodb.arn
}

# ─────────────────────────────────────────────────────────────────────────────
# 5. LOCATION SERVICE (Atomic — Redis only, no Kafka)
#    Sessions created/closed via REST by delivery-management-service
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_iam_role" "location_role" {
  name = "foodit-location-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = module.eks.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${module.eks.oidc_provider}:sub" = "system:serviceaccount:foodit:location-sa"
          "${module.eks.oidc_provider}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}
# No IAM policy attachments — location-service only uses Redis (network-level auth via db_sg)

# ─────────────────────────────────────────────────────────────────────────────
# 6. CHAT SERVICE (Atomic — Kafka + Keyspaces)
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_iam_role" "chat_role" {
  name = "foodit-chat-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = module.eks.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${module.eks.oidc_provider}:sub" = "system:serviceaccount:foodit:chat-sa"
          "${module.eks.oidc_provider}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "chat_kafka_attach" {
  role       = aws_iam_role.chat_role.name
  policy_arn = aws_iam_policy.kafka_policy.arn
}

resource "aws_iam_role_policy_attachment" "chat_keyspaces_attach" {
  role       = aws_iam_role.chat_role.name
  policy_arn = aws_iam_policy.keyspaces_policy.arn
}


# ─────────────────────────────────────────────────────────────────────────────
# 7. USER SERVICE — Fargate REST (DynamoDB users table)
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_iam_role" "user_fargate_role" {
  name = "foodit-user-fargate-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = module.eks.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${module.eks.oidc_provider}:sub" = "system:serviceaccount:foodit:user-service-sa"
          "${module.eks.oidc_provider}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

resource "aws_iam_policy" "user_fargate_dynamodb_policy" {
  name = "foodit-user-fargate-dynamodb-access"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem", "dynamodb:PutItem",
        "dynamodb:UpdateItem", "dynamodb:DeleteItem",
        "dynamodb:Query"
      ]
      Resource = aws_dynamodb_table.users.arn
    }]
  })
}

resource "aws_iam_role_policy_attachment" "user_fargate_dynamodb_attach" {
  role       = aws_iam_role.user_fargate_role.name
  policy_arn = aws_iam_policy.user_fargate_dynamodb_policy.arn
}

# ─────────────────────────────────────────────────────────────────────────────
# 8. MENU SERVICE (Atomic — DynamoDB + S3)
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_iam_role" "menu_role" {
  name = "foodit-menu-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = module.eks.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${module.eks.oidc_provider}:sub" = "system:serviceaccount:foodit:menu-sa"
          "${module.eks.oidc_provider}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

resource "aws_iam_policy" "menu_dynamodb_policy" {
  name = "foodit-menu-dynamodb-access"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem", "dynamodb:PutItem",
        "dynamodb:UpdateItem", "dynamodb:DeleteItem",
        "dynamodb:Query", "dynamodb:Scan"
      ]
      Resource = [
        aws_dynamodb_table.menu_stores.arn,
        aws_dynamodb_table.menu_items.arn
      ]
    }]
  })
}

resource "aws_iam_policy" "menu_s3_policy" {
  name = "foodit-menu-s3-access"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ]
      Resource = [
        aws_s3_bucket.assets.arn,
        "${aws_s3_bucket.assets.arn}/*"
      ]
    }]
  })
}

resource "aws_iam_role_policy_attachment" "menu_dynamodb_attach" {
  role       = aws_iam_role.menu_role.name
  policy_arn = aws_iam_policy.menu_dynamodb_policy.arn
}

resource "aws_iam_role_policy_attachment" "menu_s3_attach" {
  role       = aws_iam_role.menu_role.name
  policy_arn = aws_iam_policy.menu_s3_policy.arn
}

# ─────────────────────────────────────────────────────────────────────────────
# 9. DELIVERY MANAGEMENT SERVICE (Composite — Kafka only, no DB)
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_iam_role" "delivery_role" {
  name = "foodit-delivery-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = module.eks.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${module.eks.oidc_provider}:sub" = "system:serviceaccount:foodit:delivery-sa"
          "${module.eks.oidc_provider}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "delivery_kafka_attach" {
  role       = aws_iam_role.delivery_role.name
  policy_arn = aws_iam_policy.kafka_policy.arn
}

# ─────────────────────────────────────────────────────────────────────────────
# 10. ALB CONTROLLER
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_iam_role" "alb_controller_role" {
  name = "foodit-alb-controller-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = module.eks.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${module.eks.oidc_provider}:sub" = "system:serviceaccount:kube-system:aws-load-balancer-controller"
          "${module.eks.oidc_provider}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

resource "aws_iam_policy" "alb_controller_policy" {
  name = "foodit-alb-controller-policy"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ec2:DescribeAccountAttributes",
          "ec2:DescribeAddresses",
          "ec2:DescribeAvailabilityZones",
          "ec2:DescribeInternetGateways",
          "ec2:DescribeVpcs",
          "ec2:DescribeVpcPeeringConnections",
          "ec2:DescribeSubnets",
          "ec2:DescribeSecurityGroups",
          "ec2:DescribeInstances",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DescribeTags",
          "ec2:DescribeCoipPools",
          "ec2:GetCoipPoolUsage",
          "ec2:DescribeInstanceTypes",
          "elasticloadbalancing:DescribeLoadBalancers",
          "elasticloadbalancing:DescribeLoadBalancerAttributes",
          "elasticloadbalancing:DescribeListeners",
          "elasticloadbalancing:DescribeListenerCertificates",
          "elasticloadbalancing:DescribeSSLPolicies",
          "elasticloadbalancing:DescribeRules",
          "elasticloadbalancing:DescribeTargetGroups",
          "elasticloadbalancing:DescribeTargetGroupAttributes",
          "elasticloadbalancing:DescribeTargetHealth",
          "elasticloadbalancing:DescribeTags",
          "elasticloadbalancing:DescribeTrustStores"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ec2:AuthorizeSecurityGroupIngress",
          "ec2:RevokeSecurityGroupIngress",
          "ec2:CreateSecurityGroup",
          "ec2:DeleteSecurityGroup",
          "ec2:CreateTags",
          "ec2:DeleteTags"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "elasticloadbalancing:CreateLoadBalancer",
          "elasticloadbalancing:CreateTargetGroup",
          "elasticloadbalancing:CreateListener",
          "elasticloadbalancing:CreateRule",
          "elasticloadbalancing:DeleteLoadBalancer",
          "elasticloadbalancing:DeleteTargetGroup",
          "elasticloadbalancing:DeleteListener",
          "elasticloadbalancing:DeleteRule",
          "elasticloadbalancing:ModifyLoadBalancerAttributes",
          "elasticloadbalancing:ModifyTargetGroup",
          "elasticloadbalancing:ModifyTargetGroupAttributes",
          "elasticloadbalancing:ModifyListener",
          "elasticloadbalancing:ModifyRule",
          "elasticloadbalancing:AddTags",
          "elasticloadbalancing:RemoveTags",
          "elasticloadbalancing:RegisterTargets",
          "elasticloadbalancing:DeregisterTargets",
          "elasticloadbalancing:SetWebAcl",
          "elasticloadbalancing:SetSecurityGroups",
          "elasticloadbalancing:SetSubnets",
          "elasticloadbalancing:SetIpAddressType"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = ["iam:CreateServiceLinkedRole"]
        Resource = "*"
        Condition = {
          StringEquals = {
            "iam:AWSServiceName" = "elasticloadbalancing.amazonaws.com"
          }
        }
      },
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:DescribeUserPoolClient",
          "acm:ListCertificates",
          "acm:DescribeCertificate",
          "iam:ListServerCertificates",
          "iam:GetServerCertificate",
          "waf-regional:GetWebACL",
          "waf-regional:GetWebACLForResource",
          "waf-regional:AssociateWebACL",
          "waf-regional:DisassociateWebACL",
          "wafv2:GetWebACL",
          "wafv2:GetWebACLForResource",
          "wafv2:AssociateWebACL",
          "wafv2:DisassociateWebACL",
          "shield:GetSubscriptionState",
          "shield:DescribeProtection",
          "shield:CreateProtection",
          "shield:DeleteProtection"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "alb_controller_attach" {
  role       = aws_iam_role.alb_controller_role.name
  policy_arn = aws_iam_policy.alb_controller_policy.arn
}
