# apigateway.tf
#
# HTTP API GATEWAY:
# - REST routes with Cognito JWT auth + rate limiting
# - Routes through VPC Link to the internal ALB managed by K8s
#
# WEBSOCKET:
# - Direct connections to ALB (no API Gateway)
# - Client connects via wss://api.foodit.com/ws/location
# - ALB handles native WebSocket protocol upgrade
# - Services use FastAPI @app.websocket endpoints + Redis pub/sub

# -----------------------------------------------------------------
# ALB DNS - AUTOMATICALLY READ FROM KUBERNETES
# -----------------------------------------------------------------
# The ALB is created by the K8s ALB Controller (managed in kubernetes.tf).
# Terraform automatically reads the ALB DNS from the Ingress status.
# No manual variable passing needed!
#
# The local.alb_dns variable is defined in kubernetes.tf and contains
# the ALB DNS hostname extracted from the Ingress resource.

# -----------------------------------------------------------------
# SECURITY GROUP FOR VPC LINK
# -----------------------------------------------------------------

resource "aws_security_group" "apigw_vpclink_sg" {
  name        = "foodit-apigw-vpclink-sg"
  description = "Allow API Gateway VPC Link to reach internal ALB"
  vpc_id      = module.vpc.vpc_id

  egress {
    description = "Allow HTTP to internal ALB"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }
}

# -----------------------------------------------------------------
# VPC LINK (Private tunnel from API Gateway into VPC)
# -----------------------------------------------------------------
# Used by HTTP API Gateway to reach internal ALB.

resource "aws_apigatewayv2_vpc_link" "foodit" {
  name               = "foodit-vpc-link"
  subnet_ids         = module.vpc.private_subnets
  security_group_ids = [aws_security_group.apigw_vpclink_sg.id]
}

# =================================================================
# 1. HTTP API (REST)
# =================================================================

resource "aws_apigatewayv2_api" "foodit" {
  name          = "foodit-api"
  protocol_type = "HTTP"
  description   = "Foodit REST API — routes to internal ALB via VPC Link"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
    max_age       = 3600
  }
}

# COGNITO JWT AUTHORIZER
resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.foodit.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "foodit-cognito-authorizer"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.foodit_client.id]
    issuer   = "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.foodit.id}"
  }
}

# LOOK UP THE ALB AND ITS LISTENER from the DNS hostname
# API Gateway HTTP API with VPC_LINK requires a Listener ARN, not a DNS URL.
data "aws_lb" "foodit" {
  count = var.enable_api_routes ? 1 : 0

  tags = {
    "ingress.k8s.aws/stack" = "foodit-group"
  }

  depends_on = [data.kubernetes_ingress_v1.foodit]
}

data "aws_lb_listener" "foodit_http" {
  count             = var.enable_api_routes ? 1 : 0
  load_balancer_arn = data.aws_lb.foodit[0].arn
  port              = 80
}

# INTEGRATION (ALB — direct HTTP, no VPC Link)
# Only created when ALB DNS is available (not "PENDING").
# On first apply, ALB hasn't been provisioned yet — run terraform apply again once ALB is up.
#
# Why no VPC Link? The ALB is internet-facing (required for direct WebSocket access).
# VPC Links can only reach internal ALBs. API Gateway routes to the ALB's public URL instead.
resource "aws_apigatewayv2_integration" "alb" {
  count = var.enable_api_routes ? 1 : 0

  api_id             = aws_apigatewayv2_api.foodit.id
  integration_type   = "HTTP_PROXY"
  integration_uri    = "http://${local.alb_dns}/$default"
  integration_method = "ANY"

  # Pass the original request path through to the ALB
  request_parameters = {
    "overwrite:path" = "$request.path"
  }

  depends_on = [data.kubernetes_ingress_v1.foodit]
}

# ROUTES — Authenticated (Cognito JWT required)
locals {
  authenticated_routes   = []
  unauthenticated_routes = ["orders", "payments", "api/chat", "location", "api/users", "api/orders", "buyers", "runners", "transactions", "transfers", "refunds", "reviews", "stores"]
}

resource "aws_apigatewayv2_route" "authenticated" {
  for_each           = var.enable_api_routes ? toset(local.authenticated_routes) : toset([])
  api_id             = aws_apigatewayv2_api.foodit.id
  route_key          = "ANY /${each.value}/{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.alb[0].id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "authenticated_root" {
  for_each           = var.enable_api_routes ? toset(local.authenticated_routes) : toset([])
  api_id             = aws_apigatewayv2_api.foodit.id
  route_key          = "ANY /${each.value}"
  target             = "integrations/${aws_apigatewayv2_integration.alb[0].id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# ROUTES — Unauthenticated
resource "aws_apigatewayv2_route" "health" {
  count     = var.enable_api_routes ? 1 : 0
  api_id    = aws_apigatewayv2_api.foodit.id
  route_key = "GET /health"
  target    = "integrations/${aws_apigatewayv2_integration.alb[0].id}"
}

resource "aws_apigatewayv2_route" "unauthenticated" {
  for_each  = var.enable_api_routes ? toset(local.unauthenticated_routes) : toset([])
  api_id    = aws_apigatewayv2_api.foodit.id
  route_key = "ANY /${each.value}/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.alb[0].id}"
}

resource "aws_apigatewayv2_route" "unauthenticated_root" {
  for_each  = var.enable_api_routes ? toset(local.unauthenticated_routes) : toset([])
  api_id    = aws_apigatewayv2_api.foodit.id
  route_key = "ANY /${each.value}"
  target    = "integrations/${aws_apigatewayv2_integration.alb[0].id}"
}

# STAGE (Auto-deploy, with throttling)
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.foodit.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 100
    throttling_rate_limit  = 50
  }
}

# =================================================================
# 2. WEBSOCKET (Direct via ALB)
# =================================================================
# WebSocket connections now go directly to the ALB (no API Gateway).
# - Client connects via wss://api.foodit.com/ws/location
# - ALB handles WebSocket protocol upgrade (Connection: Upgrade header)
# - Sticky sessions ensure same client → same pod
# - Services implement native @app.websocket endpoints (FastAPI)
# - Redis pub/sub handles cross-pod messaging
#
# DELETED: API Gateway WebSocket resources (foodit_ws, ws_* integrations/routes)
