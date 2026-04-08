# main.tf

# 1. PROVIDER CONFIGURATION
# We are telling Terraform we want to talk to AWS in Singapore.
provider "aws" {
  region = var.region

  # Tags apply to EVERY resource created. Good for cost tracking.
  default_tags {
    tags = {
      Project     = "Foodit"
      Environment = "Dev"
      Owner       = "Jared-Chan"
    }
  }
}

# 2. TERRAFORM VERSION LOCK
# Ensures we use stable versions of the plugins.
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
  }
}
