# infra/variables.tf

variable "region" {
  description = "AWS Region"
  default     = "ap-southeast-1"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  default     = "10.0.0.0/16"
}

variable "cluster_name" {
  description = "Name of the EKS Cluster"
  default     = "foodit-cluster"
}

variable "enable_api_routes" {
  description = "Set to true on second apply once ALB is provisioned"
  type        = bool
  default     = false
}