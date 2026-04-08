# kubernetes.tf
# ─────────────────────────────────────────────────────────────────────────────
# Manages Kubernetes resources via Terraform (replaces manual kubectl apply)
#
# SERVICES (10 total):
#   Composite:  order-management-service, delivery-management-service, payment-management-service
#   Atomic:     order-service, chat-service, location-service, menu-service
#   Wrapper:    payment-wrapper-service
#   Fargate:    user-service (REST API)
#   Lambda:     user-service (Cognito triggers — defined in lambda.tf)
# ─────────────────────────────────────────────────────────────────────────────

# ══════════════════════════════════════════════════════════════════════════════
# PROVIDERS
# ══════════════════════════════════════════════════════════════════════════════

data "aws_eks_cluster_auth" "cluster" {
  name = module.eks.cluster_name
}

data "aws_caller_identity" "current" {}

provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
  token                  = data.aws_eks_cluster_auth.cluster.token
}

provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
    token                  = data.aws_eks_cluster_auth.cluster.token
  }
}

# ══════════════════════════════════════════════════════════════════════════════
# 1. NAMESPACE
# ══════════════════════════════════════════════════════════════════════════════

resource "kubernetes_namespace" "foodit" {
  metadata {
    name = "foodit"
    labels = {
      "elbv2.k8s.aws/pod-readiness-gate-inject" = "enabled"
    }
  }
}

# ══════════════════════════════════════════════════════════════════════════════
# 2. SERVICE ACCOUNTS
# ══════════════════════════════════════════════════════════════════════════════

# Order Management Service (Composite — Kafka)
resource "kubernetes_service_account" "order_mgmt_sa" {
  metadata {
    name      = "order-mgmt-sa"
    namespace = kubernetes_namespace.foodit.metadata[0].name
    annotations = {
      "eks.amazonaws.com/role-arn" = aws_iam_role.order_mgmt_role.arn
    }
  }
}

# Order Service (Atomic — DynamoDB)
resource "kubernetes_service_account" "order_service_sa" {
  metadata {
    name      = "order-service-sa"
    namespace = kubernetes_namespace.foodit.metadata[0].name
    annotations = {
      "eks.amazonaws.com/role-arn" = aws_iam_role.order_service_role.arn
    }
  }
}

# Payment Management Service (Composite — Kafka + DynamoDB)
resource "kubernetes_service_account" "payment_mgmt_sa" {
  metadata {
    name      = "payment-mgmt-sa"
    namespace = kubernetes_namespace.foodit.metadata[0].name
    annotations = {
      "eks.amazonaws.com/role-arn" = aws_iam_role.payment_mgmt_role.arn
    }
  }
}

# Payment Wrapper Service (Wrapper — Secrets Manager)
resource "kubernetes_service_account" "payment_wrapper_sa" {
  metadata {
    name      = "payment-wrapper-sa"
    namespace = kubernetes_namespace.foodit.metadata[0].name
    annotations = {
      "eks.amazonaws.com/role-arn" = aws_iam_role.payment_wrapper_role.arn
    }
  }
}

# Chat Service (Atomic — Kafka + Keyspaces)
resource "kubernetes_service_account" "chat_sa" {
  metadata {
    name      = "chat-sa"
    namespace = kubernetes_namespace.foodit.metadata[0].name
    annotations = {
      "eks.amazonaws.com/role-arn" = aws_iam_role.chat_role.arn
    }
  }
}

# Location Service (Atomic — Kafka)
resource "kubernetes_service_account" "location_sa" {
  metadata {
    name      = "location-sa"
    namespace = kubernetes_namespace.foodit.metadata[0].name
    annotations = {
      "eks.amazonaws.com/role-arn" = aws_iam_role.location_role.arn
    }
  }
}

# User Service — Fargate REST (DynamoDB)
resource "kubernetes_service_account" "user_service_sa" {
  metadata {
    name      = "user-service-sa"
    namespace = kubernetes_namespace.foodit.metadata[0].name
    annotations = {
      "eks.amazonaws.com/role-arn" = aws_iam_role.user_fargate_role.arn
    }
  }
}

# Menu Service (Atomic — DynamoDB + S3)
resource "kubernetes_service_account" "menu_sa" {
  metadata {
    name      = "menu-sa"
    namespace = kubernetes_namespace.foodit.metadata[0].name
    annotations = {
      "eks.amazonaws.com/role-arn" = aws_iam_role.menu_role.arn
    }
  }
}

# Delivery Management Service (Composite — Kafka)
resource "kubernetes_service_account" "delivery_sa" {
  metadata {
    name      = "delivery-sa"
    namespace = kubernetes_namespace.foodit.metadata[0].name
    annotations = {
      "eks.amazonaws.com/role-arn" = aws_iam_role.delivery_role.arn
    }
  }
}

# ALB Controller
resource "kubernetes_service_account" "alb_controller" {
  metadata {
    name      = "aws-load-balancer-controller"
    namespace = "kube-system"
    annotations = {
      "eks.amazonaws.com/role-arn" = aws_iam_role.alb_controller_role.arn
    }
  }
}

# ══════════════════════════════════════════════════════════════════════════════
# 3. CONFIGMAP
# ══════════════════════════════════════════════════════════════════════════════

resource "kubernetes_config_map" "foodit_config" {
  metadata {
    name      = "foodit-config"
    namespace = kubernetes_namespace.foodit.metadata[0].name
  }

  data = {
    AWS_REGION = var.region

    # Internal Service Discovery URLs
    ORDER_MANAGEMENT_SERVICE_URL    = "http://order-management-service.foodit.svc.cluster.local:80"
    ORDER_SERVICE_URL               = "http://order-service.foodit.svc.cluster.local:80"
    PAYMENT_MANAGEMENT_SERVICE_URL  = "http://payment-management-service.foodit.svc.cluster.local:80"
    PAYMENT_SERVICE_URL             = "http://payment-wrapper-service.foodit.svc.cluster.local:80"
    PAYMENT_WRAPPER_SERVICE_URL     = "http://payment-wrapper-service.foodit.svc.cluster.local:80"
    CHAT_SERVICE_URL                = "http://chat-service.foodit.svc.cluster.local:80/api"
    LOCATION_SERVICE_URL            = "http://location-service.foodit.svc.cluster.local:80"
    USER_SERVICE_URL                = "http://user-service.foodit.svc.cluster.local:80"
    MENU_SERVICE_URL                = "http://menu-service.foodit.svc.cluster.local:80"
    DELIVERY_MANAGEMENT_SERVICE_URL = "http://delivery-management-service.foodit.svc.cluster.local:80"

    # DynamoDB table names
    STORES_TABLE       = aws_dynamodb_table.menu_stores.name
    ITEMS_TABLE        = aws_dynamodb_table.menu_items.name
    DYNAMODB_TABLE_NAME = aws_dynamodb_table.users.name

    # User service config
    PORT              = "8080"
    COGNITO_CLIENT_ID = aws_cognito_user_pool_client.foodit_client.id

    # Keyspaces (Cassandra)
    CASSANDRA_HOSTS    = "cassandra.${var.region}.amazonaws.com"
    CASSANDRA_KEYSPACE = aws_keyspaces_keyspace.chat.name

    # AWS Managed Services
    DYNAMODB_ENDPOINT     = "https://dynamodb.${var.region}.amazonaws.com"
    REDIS_HOST            = aws_elasticache_cluster.redis.cache_nodes[0].address
    REDIS_ADDR            = "${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379"
    KAFKA_BROKERS         = aws_msk_cluster.kafka.bootstrap_brokers_sasl_iam
    # KAFKA_GROUP_ID set per-deployment via env override
    MSK_AUTH_MECHANISM    = "iam"
    COGNITO_USER_POOL_ID  = aws_cognito_user_pool.foodit.id
    COGNITO_APP_CLIENT_ID = aws_cognito_user_pool_client.foodit_client.id
    STRIPE_SECRET_ID      = aws_secretsmanager_secret.stripe_key.name
  }
}

# ══════════════════════════════════════════════════════════════════════════════
# 3.5 COREDNS FARGATE PATCH
# ══════════════════════════════════════════════════════════════════════════════
# EKS CoreDNS defaults to EC2 scheduling. On Fargate-only clusters, CoreDNS
# stays Pending because it lacks a toleration for the Fargate taint.
# This patch adds the required toleration so CoreDNS schedules on Fargate.

resource "null_resource" "coredns_patch" {
  provisioner "local-exec" {
    command = <<-EOT
      aws eks update-kubeconfig --name ${module.eks.cluster_name} --region ${var.region}
      kubectl patch deployment coredns -n kube-system --type merge -p "{\"spec\":{\"template\":{\"spec\":{\"tolerations\":[{\"key\":\"eks.amazonaws.com/compute-type\",\"operator\":\"Exists\"},{\"key\":\"CriticalAddonsOnly\",\"operator\":\"Exists\"},{\"key\":\"node.kubernetes.io/not-ready\",\"operator\":\"Exists\",\"effect\":\"NoExecute\",\"tolerationSeconds\":300},{\"key\":\"node.kubernetes.io/unreachable\",\"operator\":\"Exists\",\"effect\":\"NoExecute\",\"tolerationSeconds\":300},{\"key\":\"node-role.kubernetes.io/control-plane\",\"effect\":\"NoSchedule\"}]}}}}"
    EOT
  }

  depends_on = [module.eks]
}

# ══════════════════════════════════════════════════════════════════════════════
# 4. ALB CONTROLLER VIA HELM
# ══════════════════════════════════════════════════════════════════════════════

resource "helm_release" "alb_controller" {
  # Pre-destroy: delete ingresses so the ALB controller removes the ALB
  # before EKS is torn down. Without this, the ALB lingers and blocks subnet/IGW deletion.
  provisioner "local-exec" {
    when    = destroy
    command = <<-EOT
      aws eks update-kubeconfig --name foodit-cluster --region ap-southeast-1 2>/dev/null
      kubectl delete ingress --all -n foodit --timeout=120s 2>/dev/null || true
      echo "Waiting 60s for ALB controller to delete the ALB..."
      sleep 60
    EOT
  }
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  namespace  = "kube-system"
  version    = "1.6.2"

  set {
    name  = "clusterName"
    value = module.eks.cluster_name
  }

  set {
    name  = "serviceAccount.create"
    value = "false"
  }

  set {
    name  = "serviceAccount.name"
    value = "aws-load-balancer-controller"
  }

  set {
    name  = "region"
    value = var.region
  }

  set {
    name  = "vpcId"
    value = module.vpc.vpc_id
  }

  depends_on = [
    kubernetes_service_account.alb_controller,
    module.eks
  ]
}

# ══════════════════════════════════════════════════════════════════════════════
# 5. DEPLOYMENTS & SERVICES
# ══════════════════════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────────────────────────────────
# 5.1 ORDER MANAGEMENT SERVICE (Composite — routes to order-service)
# ─────────────────────────────────────────────────────────────────────────────

resource "kubernetes_deployment" "order_management_service" {
  wait_for_rollout = false

  metadata {
    name      = "order-management-service"
    namespace = kubernetes_namespace.foodit.metadata[0].name
  }

  spec {
    replicas = 1

    selector {
      match_labels = { app = "order-management-service" }
    }

    template {
      metadata {
        labels = { app = "order-management-service" }
      }

      spec {
        service_account_name = kubernetes_service_account.order_mgmt_sa.metadata[0].name

        container {
          name              = "order-management-service"
          image             = "633605692850.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/order-management-service:latest"
          image_pull_policy = "Always"
          port {
            container_port = 80
          }

          env_from {
            config_map_ref {
              name = kubernetes_config_map.foodit_config.metadata[0].name
            }
          }

          readiness_probe {
            http_get {
              path = "/health"
              port = 80
            }
            initial_delay_seconds = 5
            period_seconds        = 10
          }

          liveness_probe {
            http_get {
              path = "/health"
              port = 80
            }
            initial_delay_seconds = 15
            period_seconds        = 20
          }

          resources {
            requests = {
              cpu    = "256m"
              memory = "512Mi"
            }
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "order_management_service" {
  metadata {
    name      = "order-management-service"
    namespace = kubernetes_namespace.foodit.metadata[0].name
  }
  spec {
    type     = "ClusterIP"
    selector = { app = "order-management-service" }
    port {
      port        = 80
      target_port = 80
    }
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# 5.2 ORDER SERVICE (Atomic — DynamoDB orders table)
# ─────────────────────────────────────────────────────────────────────────────

resource "kubernetes_deployment" "order_service" {
  wait_for_rollout = false

  metadata {
    name      = "order-service"
    namespace = kubernetes_namespace.foodit.metadata[0].name
  }

  spec {
    replicas = 1

    selector {
      match_labels = { app = "order-service" }
    }

    template {
      metadata {
        labels = { app = "order-service" }
      }

      spec {
        service_account_name = kubernetes_service_account.order_service_sa.metadata[0].name

        container {
          name              = "order-service"
          image             = "633605692850.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/order-service:latest"
          image_pull_policy = "Always"
          port {
            container_port = 8080
          }

          env_from {
            config_map_ref {
              name = kubernetes_config_map.foodit_config.metadata[0].name
            }
          }

          readiness_probe {
            http_get {
              path = "/health"
              port = 8080
            }
            initial_delay_seconds = 5
            period_seconds        = 10
          }

          liveness_probe {
            http_get {
              path = "/health"
              port = 8080
            }
            initial_delay_seconds = 15
            period_seconds        = 20
          }

          resources {
            requests = {
              cpu    = "256m"
              memory = "512Mi"
            }
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "order_service" {
  metadata {
    name      = "order-service"
    namespace = kubernetes_namespace.foodit.metadata[0].name
  }
  spec {
    type     = "ClusterIP"
    selector = { app = "order-service" }
    port {
      port        = 80
      target_port = 8080
    }
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# 5.3 PAYMENT MANAGEMENT SERVICE (Composite — Kafka + DynamoDB payments)
# ─────────────────────────────────────────────────────────────────────────────

resource "kubernetes_deployment" "payment_management_service" {
  wait_for_rollout = false

  metadata {
    name      = "payment-management-service"
    namespace = kubernetes_namespace.foodit.metadata[0].name
  }

  spec {
    replicas = 1

    selector {
      match_labels = { app = "payment-management-service" }
    }

    template {
      metadata {
        labels = { app = "payment-management-service" }
      }

      spec {
        service_account_name = kubernetes_service_account.payment_mgmt_sa.metadata[0].name

        container {
          name              = "payment-management-service"
          image             = "633605692850.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/payment-management-service:latest"
          image_pull_policy = "Always"

          env_from {
            config_map_ref {
              name = kubernetes_config_map.foodit_config.metadata[0].name
            }
          }

          env {
            name  = "KAFKA_GROUP_ID"
            value = "foodit-payment-group"
          }

          resources {
            requests = {
              cpu    = "256m"
              memory = "512Mi"
            }
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "payment_management_service" {
  metadata {
    name      = "payment-management-service"
    namespace = kubernetes_namespace.foodit.metadata[0].name
  }
  spec {
    type     = "ClusterIP"
    selector = { app = "payment-management-service" }
    port {
      port        = 80
      target_port = 80
    }
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# 5.4 PAYMENT WRAPPER SERVICE (Wrapper — Stripe via Secrets Manager)
# ─────────────────────────────────────────────────────────────────────────────

resource "kubernetes_deployment" "payment_wrapper_service" {
  wait_for_rollout = false

  metadata {
    name      = "payment-wrapper-service"
    namespace = kubernetes_namespace.foodit.metadata[0].name
  }

  spec {
    replicas = 1

    selector {
      match_labels = { app = "payment-wrapper-service" }
    }

    template {
      metadata {
        labels = { app = "payment-wrapper-service" }
      }

      spec {
        service_account_name = kubernetes_service_account.payment_wrapper_sa.metadata[0].name

        container {
          name              = "payment-wrapper-service"
          image             = "633605692850.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/payment-service:latest"
          image_pull_policy = "Always"
          port {
            container_port = 80
          }

          env_from {
            config_map_ref {
              name = kubernetes_config_map.foodit_config.metadata[0].name
            }
          }

          env {
            name  = "STRIPE_SECRET_ID"
            value = "foodit/stripe-secret"
          }

          readiness_probe {
            http_get {
              path = "/health"
              port = 80
            }
            initial_delay_seconds = 5
            period_seconds        = 10
          }

          liveness_probe {
            http_get {
              path = "/health"
              port = 80
            }
            initial_delay_seconds = 15
            period_seconds        = 20
          }

          resources {
            requests = {
              cpu    = "256m"
              memory = "512Mi"
            }
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "payment_wrapper_service" {
  metadata {
    name      = "payment-wrapper-service"
    namespace = kubernetes_namespace.foodit.metadata[0].name
  }
  spec {
    type     = "ClusterIP"
    selector = { app = "payment-wrapper-service" }
    port {
      port        = 80
      target_port = 80
    }
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# 5.5 CHAT SERVICE (Atomic — Kafka + Keyspaces + WebSocket)
# ─────────────────────────────────────────────────────────────────────────────

resource "kubernetes_deployment" "chat_service" {
  wait_for_rollout = false

  metadata {
    name      = "chat-service"
    namespace = kubernetes_namespace.foodit.metadata[0].name
  }

  spec {
    replicas = 1

    selector {
      match_labels = { app = "chat-service" }
    }

    template {
      metadata {
        labels = { app = "chat-service" }
      }

      spec {
        service_account_name = kubernetes_service_account.chat_sa.metadata[0].name

        container {
          name              = "chat-service"
          image             = "633605692850.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/chat-service:latest"
          image_pull_policy = "Always"
          port {
            container_port = 8080
          }

          env_from {
            config_map_ref {
              name = kubernetes_config_map.foodit_config.metadata[0].name
            }
          }

          readiness_probe {
            http_get {
              path = "/health"
              port = 8080
            }
            initial_delay_seconds = 5
            period_seconds        = 10
          }

          liveness_probe {
            http_get {
              path = "/health"
              port = 8080
            }
            initial_delay_seconds = 15
            period_seconds        = 20
          }

          resources {
            requests = {
              cpu    = "256m"
              memory = "512Mi"
            }
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "chat_service" {
  metadata {
    name      = "chat-service"
    namespace = kubernetes_namespace.foodit.metadata[0].name
    annotations = {
      "alb.ingress.kubernetes.io/target-group-attributes" = "stickiness.enabled=true,stickiness.lb_cookie.duration_seconds=600"
    }
  }
  spec {
    type     = "ClusterIP"
    selector = { app = "chat-service" }
    port {
      port        = 80
      target_port = 8080
    }
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# 5.6 LOCATION SERVICE (Atomic — Redis + WebSocket, no Kafka)
# ─────────────────────────────────────────────────────────────────────────────

resource "kubernetes_deployment" "location_service" {
  wait_for_rollout = false

  metadata {
    name      = "location-service"
    namespace = kubernetes_namespace.foodit.metadata[0].name
  }

  spec {
    replicas = 1

    selector {
      match_labels = { app = "location-service" }
    }

    template {
      metadata {
        labels = { app = "location-service" }
      }

      spec {
        service_account_name = kubernetes_service_account.location_sa.metadata[0].name

        container {
          name              = "location-service"
          image             = "633605692850.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/location-service:latest"
          image_pull_policy = "Always"
          port {
            container_port = 80
          }

          env_from {
            config_map_ref {
              name = kubernetes_config_map.foodit_config.metadata[0].name
            }
          }

          readiness_probe {
            http_get {
              path = "/health"
              port = 80
            }
            initial_delay_seconds = 5
            period_seconds        = 10
          }

          liveness_probe {
            http_get {
              path = "/health"
              port = 80
            }
            initial_delay_seconds = 15
            period_seconds        = 20
          }

          resources {
            requests = {
              cpu    = "256m"
              memory = "512Mi"
            }
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "location_service" {
  metadata {
    name      = "location-service"
    namespace = kubernetes_namespace.foodit.metadata[0].name
    annotations = {
      "alb.ingress.kubernetes.io/target-group-attributes" = "stickiness.enabled=true,stickiness.lb_cookie.duration_seconds=600"
    }
  }
  spec {
    type     = "ClusterIP"
    selector = { app = "location-service" }
    port {
      port        = 80
      target_port = 80
    }
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# 5.7 USER SERVICE — Fargate REST (DynamoDB users table)
# ─────────────────────────────────────────────────────────────────────────────

resource "kubernetes_deployment" "user_service" {
  wait_for_rollout = false

  metadata {
    name      = "user-service"
    namespace = kubernetes_namespace.foodit.metadata[0].name
  }

  spec {
    replicas = 1

    selector {
      match_labels = { app = "user-service" }
    }

    template {
      metadata {
        labels = { app = "user-service" }
      }

      spec {
        service_account_name = kubernetes_service_account.user_service_sa.metadata[0].name

        container {
          name              = "user-service"
          image             = "633605692850.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/user-service:latest"
          image_pull_policy = "Always"
          port {
            container_port = 8080
          }

          env_from {
            config_map_ref {
              name = kubernetes_config_map.foodit_config.metadata[0].name
            }
          }

          readiness_probe {
            http_get {
              path = "/health"
              port = 8080
            }
            initial_delay_seconds = 5
            period_seconds        = 10
          }

          liveness_probe {
            http_get {
              path = "/health"
              port = 8080
            }
            initial_delay_seconds = 15
            period_seconds        = 20
          }

          resources {
            requests = {
              cpu    = "256m"
              memory = "512Mi"
            }
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "user_service" {
  metadata {
    name      = "user-service"
    namespace = kubernetes_namespace.foodit.metadata[0].name
  }
  spec {
    type     = "ClusterIP"
    selector = { app = "user-service" }
    port {
      port        = 80
      target_port = 8080
    }
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# 5.8 MENU SERVICE (Atomic — DynamoDB + S3)
# ─────────────────────────────────────────────────────────────────────────────

resource "kubernetes_deployment" "menu_service" {
  wait_for_rollout = false

  metadata {
    name      = "menu-service"
    namespace = kubernetes_namespace.foodit.metadata[0].name
  }

  spec {
    replicas = 1

    selector {
      match_labels = { app = "menu-service" }
    }

    template {
      metadata {
        labels = { app = "menu-service" }
      }

      spec {
        service_account_name = kubernetes_service_account.menu_sa.metadata[0].name

        container {
          name              = "menu-service"
          image             = "633605692850.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/menu-service:latest"
          image_pull_policy = "Always"
          port {
            container_port = 8080
          }

          env_from {
            config_map_ref {
              name = kubernetes_config_map.foodit_config.metadata[0].name
            }
          }

          readiness_probe {
            http_get {
              path = "/health"
              port = 8080
            }
            initial_delay_seconds = 5
            period_seconds        = 10
          }

          liveness_probe {
            http_get {
              path = "/health"
              port = 8080
            }
            initial_delay_seconds = 15
            period_seconds        = 20
          }

          resources {
            requests = {
              cpu    = "256m"
              memory = "512Mi"
            }
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "menu_service" {
  metadata {
    name      = "menu-service"
    namespace = kubernetes_namespace.foodit.metadata[0].name
  }
  spec {
    type     = "ClusterIP"
    selector = { app = "menu-service" }
    port {
      port        = 80
      target_port = 8080
    }
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# 5.9 DELIVERY MANAGEMENT SERVICE (Composite — Kafka, no DB)
# ─────────────────────────────────────────────────────────────────────────────

resource "kubernetes_deployment" "delivery_management_service" {
  wait_for_rollout = false

  metadata {
    name      = "delivery-management-service"
    namespace = kubernetes_namespace.foodit.metadata[0].name
  }

  spec {
    replicas = 1

    selector {
      match_labels = { app = "delivery-management-service" }
    }

    template {
      metadata {
        labels = { app = "delivery-management-service" }
      }

      spec {
        service_account_name = kubernetes_service_account.delivery_sa.metadata[0].name

        container {
          name              = "delivery-management-service"
          image             = "633605692850.dkr.ecr.ap-southeast-1.amazonaws.com/foodit/delivery-management-service:latest"
          image_pull_policy = "Always"

          env_from {
            config_map_ref {
              name = kubernetes_config_map.foodit_config.metadata[0].name
            }
          }

          env {
            name  = "KAFKA_GROUP_ID"
            value = "foodit-delivery-group"
          }

          resources {
            requests = {
              cpu    = "256m"
              memory = "512Mi"
            }
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "delivery_management_service" {
  metadata {
    name      = "delivery-management-service"
    namespace = kubernetes_namespace.foodit.metadata[0].name
  }
  spec {
    type     = "ClusterIP"
    selector = { app = "delivery-management-service" }
    port {
      port        = 80
      target_port = 80
    }
  }
}

# ══════════════════════════════════════════════════════════════════════════════
# 6. INGRESS — MAIN
# ══════════════════════════════════════════════════════════════════════════════

resource "kubernetes_ingress_v1" "foodit" {
  metadata {
    name      = "foodit-ingress"
    namespace = kubernetes_namespace.foodit.metadata[0].name

    annotations = {
      "alb.ingress.kubernetes.io/scheme"                    = "internet-facing"
      "alb.ingress.kubernetes.io/target-type"               = "ip"
      "alb.ingress.kubernetes.io/group.name"                = "foodit-group"
      "alb.ingress.kubernetes.io/healthcheck-path"          = "/health"
      "alb.ingress.kubernetes.io/success-codes"             = "200"
      "alb.ingress.kubernetes.io/target-group-attributes"   = "stickiness.enabled=true,stickiness.lb_cookie.duration_seconds=3600"
      "alb.ingress.kubernetes.io/load-balancer-attributes"  = "idle_timeout.timeout_seconds=3600"
    }
  }

  spec {
    ingress_class_name = "alb"

    rule {
      http {
        # Health Check
        path {
          path      = "/health"
          path_type = "Exact"
          backend {
            service {
              name = kubernetes_service.order_management_service.metadata[0].name
              port { number = 80 }
            }
          }
        }

        # REST API routes — Composite services (ALB-facing)
        path {
          path      = "/orders"
          path_type = "Prefix"
          backend {
            service {
              name = kubernetes_service.order_management_service.metadata[0].name
              port { number = 80 }
            }
          }
        }

        # Order Service (atomic CRUD) — /api/orders/*
        path {
          path      = "/api/orders"
          path_type = "Prefix"
          backend {
            service {
              name = kubernetes_service.order_service.metadata[0].name
              port { number = 80 }
            }
          }
        }

        path {
          path      = "/payments"
          path_type = "Prefix"
          backend {
            service {
              name = kubernetes_service.payment_wrapper_service.metadata[0].name
              port { number = 80 }
            }
          }
        }

        # REST API routes — Atomic services (ALB-facing)
        # Chat service expects /api/chat/*
        path {
          path      = "/api/chat"
          path_type = "Prefix"
          backend {
            service {
              name = kubernetes_service.chat_service.metadata[0].name
              port { number = 80 }
            }
          }
        }

        path {
          path      = "/location"
          path_type = "Prefix"
          backend {
            service {
              name = kubernetes_service.location_service.metadata[0].name
              port { number = 80 }
            }
          }
        }

        # User service expects /api/users/*
        path {
          path      = "/api/users"
          path_type = "Prefix"
          backend {
            service {
              name = kubernetes_service.user_service.metadata[0].name
              port { number = 80 }
            }
          }
        }

        # Menu service expects /stores/*
        path {
          path      = "/stores"
          path_type = "Prefix"
          backend {
            service {
              name = kubernetes_service.menu_service.metadata[0].name
              port { number = 80 }
            }
          }
        }

        # Payment service (buyers/runners onboarding)
        path {
          path      = "/buyers"
          path_type = "Prefix"
          backend {
            service {
              name = kubernetes_service.payment_wrapper_service.metadata[0].name
              port { number = 80 }
            }
          }
        }

        path {
          path      = "/runners"
          path_type = "Prefix"
          backend {
            service {
              name = kubernetes_service.payment_wrapper_service.metadata[0].name
              port { number = 80 }
            }
          }
        }

        path {
          path      = "/transactions"
          path_type = "Prefix"
          backend {
            service {
              name = kubernetes_service.payment_wrapper_service.metadata[0].name
              port { number = 80 }
            }
          }
        }

        path {
          path      = "/transfers"
          path_type = "Prefix"
          backend {
            service {
              name = kubernetes_service.payment_wrapper_service.metadata[0].name
              port { number = 80 }
            }
          }
        }

        path {
          path      = "/refunds"
          path_type = "Prefix"
          backend {
            service {
              name = kubernetes_service.payment_wrapper_service.metadata[0].name
              port { number = 80 }
            }
          }
        }

        # WebSocket upgrade paths
        path {
          path      = "/ws/chat"
          path_type = "Prefix"
          backend {
            service {
              name = kubernetes_service.chat_service.metadata[0].name
              port { number = 80 }
            }
          }
        }

        path {
          path      = "/ws/location"
          path_type = "Prefix"
          backend {
            service {
              name = kubernetes_service.location_service.metadata[0].name
              port { number = 80 }
            }
          }
        }
      }
    }
  }

  depends_on = [helm_release.alb_controller]
}

# ══════════════════════════════════════════════════════════════════════════════
# 7. INGRESS — REVIEWS REDIRECT
# ══════════════════════════════════════════════════════════════════════════════

resource "kubernetes_ingress_v1" "reviews_redirect" {
  metadata {
    name      = "foodit-reviews-redirect"
    namespace = kubernetes_namespace.foodit.metadata[0].name

    annotations = {
      "alb.ingress.kubernetes.io/scheme"     = "internet-facing"
      "alb.ingress.kubernetes.io/group.name" = "foodit-group"
      "alb.ingress.kubernetes.io/actions.reviews-redirect" = jsonencode({
        type = "redirect"
        redirectConfig = {
          host       = "personal-ncksqeg2.outsystemscloud.com"
          path       = "/Reviews/rest/ReviewAPI/#{path}"
          port       = "443"
          protocol   = "HTTPS"
          query      = "#{query}"
          statusCode = "HTTP_301"
        }
      })
    }
  }

  spec {
    ingress_class_name = "alb"

    rule {
      http {
        path {
          path      = "/reviews"
          path_type = "Prefix"
          backend {
            service {
              name = "reviews-redirect"
              port { name = "use-annotation" }
            }
          }
        }
      }
    }
  }

  depends_on = [helm_release.alb_controller]
}

# ══════════════════════════════════════════════════════════════════════════════
# 8. READ ALB DNS AUTOMATICALLY
# ══════════════════════════════════════════════════════════════════════════════

data "kubernetes_ingress_v1" "foodit" {
  metadata {
    name      = kubernetes_ingress_v1.foodit.metadata[0].name
    namespace = kubernetes_ingress_v1.foodit.metadata[0].namespace
  }

  depends_on = [kubernetes_ingress_v1.foodit]
}

locals {
  alb_dns = try(
    data.kubernetes_ingress_v1.foodit.status[0].load_balancer[0].ingress[0].hostname,
    "PENDING"
  )
}

