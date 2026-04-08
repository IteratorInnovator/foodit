# cognito.tf
# ─────────────────────────────────────────────────────────────────────────────
# AWS Cognito — handles ALL user authentication for the Foodit platform.
#
# HOW IT FITS IN THE ARCHITECTURE:
#   1. Frontend calls Cognito directly to sign up / sign in (no backend involved)
#   2. Cognito returns a JWT (access token + ID token)
#   3. Frontend sends the JWT in the Authorization header on every API call
#   4. API Gateway validates the JWT before forwarding to the internal ALB
#   5. If the JWT is invalid/expired, API Gateway returns 401 — request never reaches pods
#
# LAMBDA TRIGGERS:
#   - post_confirmation:   After a user verifies their email → Lambda creates a
#                          user record in DynamoDB (users table)
#   - post_authentication: After every successful login → Lambda can update
#                          last_login timestamp or sync user data
# ─────────────────────────────────────────────────────────────────────────────

# COGNITO USER POOL (Authentication)
# Handles sign-up, sign-in, and token issuance for Foodit users.
resource "aws_cognito_user_pool" "foodit" {
  name = "User pool - gkonrp"

  # Sign-in configuration
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Password policy
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  # Schema: standard email attribute
  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }

  # Lambda triggers — added after Lambda is created
  # lambda_config {
  #   post_confirmation   = aws_lambda_function.user_service.arn
  #   post_authentication = aws_lambda_function.user_service.arn
  # }

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [name, lambda_config, schema]
  }
}

# APP CLIENT (Frontend uses this to authenticate)
# This is a "public client" (no secret) — suitable for SPAs and mobile apps
# where the client secret can't be kept confidential.
resource "aws_cognito_user_pool_client" "foodit_client" {
  name         = "FoodIT"
  user_pool_id = aws_cognito_user_pool.foodit.id

  # Auth flows the frontend will use
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",   # Simple email + password login
    "ALLOW_REFRESH_TOKEN_AUTH",   # Silent token refresh (no re-login)
    "ALLOW_USER_SRP_AUTH"         # Secure Remote Password (password never sent over wire)
  ]

  # Token validity
  access_token_validity  = 1   # 1 hour
  refresh_token_validity = 30  # 30 days

  # No secret for public clients (SPA/mobile)
  generate_secret = false

  lifecycle {
    prevent_destroy = true
    ignore_changes  = all
  }
}
