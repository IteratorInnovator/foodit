# outputs.tf
# ─────────────────────────────────────────────────────────────────────────────
# Values printed after `terraform apply` for external consumers.
# IAM roles, service accounts, DB endpoints, and K8s resources are all
# auto-wired internally by Terraform — no manual copy-paste needed.
# These outputs exist only for frontend configuration and debugging.
# ─────────────────────────────────────────────────────────────────────────────

# Frontend uses this as the base URL for all REST API calls
output "api_gateway_url" {
  description = "Public REST API URL (requires Cognito JWT)"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

# Frontend constructs WebSocket URL from this (wss://<alb_dns>/ws/location)
output "alb_dns" {
  description = "Internal ALB DNS for WebSocket connections"
  value       = local.alb_dns
}

# Frontend needs this to initialize the Cognito auth SDK
output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.foodit.id
}

# Frontend needs this to authenticate users via Cognito
output "cognito_app_client_id" {
  description = "Cognito App Client ID"
  value       = aws_cognito_user_pool_client.foodit_client.id
}

# S3 bucket for store assets (logos, menu images, etc.)
output "assets_bucket" {
  description = "S3 bucket name for foodit assets"
  value       = aws_s3_bucket.assets.id
}
