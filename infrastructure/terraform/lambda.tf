# lambda.tf
# ─────────────────────────────────────────────────────────────────────────────
# User Service Lambda — the ONLY service that runs outside of EKS.
#
# WHY LAMBDA INSTEAD OF EKS?
#   The user-service is triggered by Cognito lifecycle events (post_confirmation,
#   post_authentication), not HTTP requests. Lambda is the natural fit because
#   Cognito natively invokes Lambda triggers — no API Gateway or ALB needed.
#
# WHAT IT DOES:
#   - post_confirmation:   Creates a user record in DynamoDB (users table)
#   - post_authentication: Updates last_login or syncs user metadata
#
# NETWORK:
#   Runs inside the VPC (private subnets) so it can reach DynamoDB via the
#   Gateway VPC Endpoint (no internet traffic, lower latency).
#
# SOURCE CODE:
#   Lives in the sibling repo: ../user-service/deployment.zip
#   Must be packaged BEFORE running terraform apply (see README Phase 1).
# ─────────────────────────────────────────────────────────────────────────────

# IAM ROLE for the Lambda function
resource "aws_iam_role" "user_lambda_role" {
  name = "foodit-user-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

# Policy: DynamoDB access to users table only
# Scoped to a single table ARN — not "dynamodb:*" on "*"
resource "aws_iam_policy" "user_dynamodb_policy" {
  name = "foodit-user-dynamodb-access"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query"
      ]
      Resource = aws_dynamodb_table.users.arn
    }]
  })
}

# Policy: CloudWatch Logs (required for Lambda debugging)
resource "aws_iam_policy" "user_lambda_logs" {
  name = "foodit-user-lambda-logs"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ]
      Resource = "arn:aws:logs:*:*:*"
    }]
  })
}

# Policy: VPC access (ENI management for Lambda in private subnets)
# Lambda needs to create/delete ENIs to attach to the VPC
resource "aws_iam_policy" "user_lambda_vpc" {
  name = "foodit-user-lambda-vpc"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "ec2:CreateNetworkInterface",
        "ec2:DescribeNetworkInterfaces",
        "ec2:DeleteNetworkInterface"
      ]
      Resource = "*"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "user_dynamodb_attach" {
  role       = aws_iam_role.user_lambda_role.name
  policy_arn = aws_iam_policy.user_dynamodb_policy.arn
}

resource "aws_iam_role_policy_attachment" "user_logs_attach" {
  role       = aws_iam_role.user_lambda_role.name
  policy_arn = aws_iam_policy.user_lambda_logs.arn
}

resource "aws_iam_role_policy_attachment" "user_vpc_attach" {
  role       = aws_iam_role.user_lambda_role.name
  policy_arn = aws_iam_policy.user_lambda_vpc.arn
}

# SECURITY GROUP for the Lambda function
resource "aws_security_group" "user_lambda_sg" {
  name        = "foodit-user-lambda-sg"
  description = "Security group for user-service Lambda"
  vpc_id      = module.vpc.vpc_id

  # Egress only — Lambda needs outbound to reach DynamoDB via Gateway Endpoint
  # No ingress needed: Cognito invokes Lambda via AWS invoke API, not network
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# THE LAMBDA FUNCTION
resource "aws_lambda_function" "user_service" {
  lifecycle { prevent_destroy = true }

  function_name = "foodit-user-service"
  role          = aws_iam_role.user_lambda_role.arn
  handler       = "lambda_function.handler"
  runtime       = "python3.11"
  timeout       = 30
  memory_size   = 256

  # Source code — packaged as a zip (user-service repo must be cloned as a sibling)
  filename         = "${path.module}/../../user-service/deployment.zip"
  source_code_hash = filebase64sha256("${path.module}/../../user-service/deployment.zip")

  # VPC configuration — runs in private subnets (same as Fargate pods)
  # This allows Lambda to reach DynamoDB via the Gateway VPC Endpoint
  vpc_config {
    subnet_ids         = module.vpc.private_subnets
    security_group_ids = [aws_security_group.user_lambda_sg.id]
  }

  environment {
    variables = {
      USERS_TABLE     = aws_dynamodb_table.users.name
      AWS_REGION_NAME = var.region
    }
  }
}

# COGNITO PERMISSION: Allow Cognito to invoke the Lambda
# Without this, Cognito will get "Access Denied" when trying to trigger the function
resource "aws_lambda_permission" "cognito_invoke" {
  statement_id  = "AllowCognitoInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.user_service.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.foodit.arn
}
