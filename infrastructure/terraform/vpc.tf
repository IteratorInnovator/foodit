# vpc.tf

# We use the official AWS module to save writing 200 lines of routing code manually.
# It implements the "Well-Architected" framework automatically.

data "aws_availability_zones" "available" {}
data "aws_region" "current" {}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.0.0"

  name = "foodit-vpc"
  cidr = var.vpc_cidr

  # AVAILABILITY ZONES (High Availability)
  # We use 2 AZs (e.g., ap-southeast-1a, ap-southeast-1b)
  azs = slice(data.aws_availability_zones.available.names, 0, 2)

  # SUBNET DEFINITIONS
  # Public: 10.0.1.0/24 & 10.0.2.0/24 (For ALB & NAT Gateway)
  public_subnets  = ["10.0.1.0/24", "10.0.2.0/24"]
  
  # Private: 10.0.3.0/24 & 10.0.4.0/24 (For Fargate Pods & Databases)
  private_subnets = ["10.0.3.0/24", "10.0.4.0/24"]

  # NAT GATEWAY CONFIGURATION (The "Exit Door")
  # We enable NAT so private pods can talk to Stripe/Cognito.
  enable_nat_gateway = true
  
  # COST SAVING: We use only ONE NAT Gateway shared by all AZs.
  # Saves ~$30/month compared to "one per AZ".
  single_nat_gateway = true
  
  # DNS SUPPORT
  # Required for Service Discovery (how 'job-service' finds 'order-service')
  enable_dns_hostnames = true
  enable_dns_support   = true

  # TAGS FOR KUBERNETES
  # These tags tell the AWS Load Balancer Controller where to put the ALBs.
  public_subnet_tags = {
    "kubernetes.io/role/elb" = 1 
  }
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = 1
  }
}

# VPC ENDPOINTS (The "Secret Tunnels")
# These allow Fargate to talk to AWS services without leaving the private network.

# 1. S3 Gateway Endpoint (For storing Chat images cost-effectively)
resource "aws_vpc_endpoint" "s3" {
  vpc_id       = module.vpc.vpc_id
  service_name = "com.amazonaws.${data.aws_region.current.name}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids = module.vpc.private_route_table_ids
}

# 2. DynamoDB Gateway Endpoint (For Job, Order, and User services)
resource "aws_vpc_endpoint" "dynamodb" {
  vpc_id            = module.vpc.vpc_id
  service_name      = "com.amazonaws.${data.aws_region.current.name}.dynamodb"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = module.vpc.private_route_table_ids
}

# 3. Secrets Manager Interface Endpoint (For secure Stripe Key retrieval)
resource "aws_vpc_endpoint" "secrets" {
  vpc_id            = module.vpc.vpc_id
  service_name      = "com.amazonaws.${data.aws_region.current.name}.secretsmanager"
  vpc_endpoint_type = "Interface"
  subnet_ids        = module.vpc.private_subnets
  
  security_group_ids = [aws_security_group.vpce_sg.id]
  private_dns_enabled = true
}

# Security Group for the Interface Endpoints (Allow HTTPS from VPC)
resource "aws_security_group" "vpce_sg" {
  name   = "foodit-vpce-sg"
  vpc_id = module.vpc.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr] # Allow anyone in the VPC to use this endpoint
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}