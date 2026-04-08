# security.tf
# ─────────────────────────────────────────────────────────────────────────────
# Security Groups for data-layer services (Redis, Kafka).
#
# PRINCIPLE: Least-privilege network access.
#   - Only pods within the VPC CIDR can reach the databases.
#   - Each port is opened individually (6379 for Redis, 9098 for Kafka IAM).
#   - Nothing outside the VPC can talk to these services.
#
# USED BY:
#   - database.tf → Redis (aws_elasticache_cluster) and MSK (aws_msk_serverless_cluster)
#     both reference this SG.
# ─────────────────────────────────────────────────────────────────────────────

# DATABASE SECURITY GROUP
# Attached to Redis and MSK.
# Rule: "Only allow traffic from the VPC CIDR (aka the Fargate Pods)"
resource "aws_security_group" "db_sg" {
  name        = "foodit-db-sg"
  description = "Allow internal access to databases"
  vpc_id      = module.vpc.vpc_id

  # Redis — used by location-service for real-time GPS caching
  ingress {
    description = "Allow Redis from Fargate"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  # Kafka (MSK Serverless IAM port) — used by order-service and chat-service
  # Port 9098 is the IAM-authenticated bootstrap port (not 9092 which is plaintext)
  ingress {
    description = "Allow Kafka IAM from Fargate"
    from_port   = 9098
    to_port     = 9098
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
