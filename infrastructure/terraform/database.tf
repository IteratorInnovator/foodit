# database.tf

# ── 1. DYNAMODB ──────────────────────────────────────────────────────────────

# Order Service (Atomic) — stores individual orders
resource "aws_dynamodb_table" "orders" {
  name         = "orders"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "order_id"

  attribute {
    name = "order_id"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  attribute {
    name = "created_at"
    type = "S"
  }

  attribute {
    name = "buyer_id"
    type = "S"
  }

  attribute {
    name = "runner_id"
    type = "S"
  }

  global_secondary_index {
    name            = "status-created_at-index"
    hash_key        = "status"
    range_key       = "created_at"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "buyer-index"
    hash_key        = "buyer_id"
    range_key       = "created_at"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "runner-index"
    hash_key        = "runner_id"
    range_key       = "created_at"
    projection_type = "ALL"
  }

  lifecycle { prevent_destroy = true }
}

# User Service — user profiles (shared by Lambda triggers + Fargate REST)
resource "aws_dynamodb_table" "users" {
  name         = "users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  lifecycle { prevent_destroy = true }
}

# Menu Service — restaurant/store listings
resource "aws_dynamodb_table" "menu_stores" {
  name         = "menu_stores"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "store_id"

  attribute {
    name = "store_id"
    type = "S"
  }

  lifecycle { prevent_destroy = true }
}

# Menu Service — items per store
resource "aws_dynamodb_table" "menu_items" {
  name         = "menu_items"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "store_id"
  range_key    = "item_id"

  attribute {
    name = "store_id"
    type = "S"
  }

  attribute {
    name = "item_id"
    type = "S"
  }

  lifecycle { prevent_destroy = true }
}

# Payment Management Service — payment records
resource "aws_dynamodb_table" "payments" {
  name         = "payments"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"
  range_key    = "id"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "id"
    type = "S"
  }

  lifecycle { prevent_destroy = true }
}

# ── 2. REDIS (ElastiCache) ──────────────────────────────────────────────────
# Shared Redis instance for real-time services (no IAM auth — network-level security via db_sg)
#   - Location Service: GPS caching + pub/sub for cross-pod WebSocket delivery
#   - Chat Service: pub/sub for cross-pod WebSocket message delivery
# Key namespacing prevents collisions (location:* vs chat:*)
resource "aws_elasticache_subnet_group" "redis_subnet" {
  name       = "foodit-redis-subnet"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "foodit-cache"
  engine               = "redis"
  node_type            = "cache.t3.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  engine_version       = "7.0"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.redis_subnet.name
  security_group_ids   = [aws_security_group.db_sg.id]
}

# ── 3. KAFKA (MSK Provisioned) ─────────────────────────────────────────────
# Event bus for composite services (order.accepted, order.completed, etc.)
resource "aws_msk_configuration" "kafka" {
  kafka_versions = ["3.6.0"]
  name           = "foodit-events-config"

  server_properties = <<PROPERTIES
auto.create.topics.enable=true
default.replication.factor=2
min.insync.replicas=1
num.partitions=1
PROPERTIES
}

resource "aws_msk_cluster" "kafka" {
  cluster_name           = "foodit-kafka"
  kafka_version          = "3.6.0"
  number_of_broker_nodes = 2

  broker_node_group_info {
    instance_type   = "kafka.t3.small"
    client_subnets  = module.vpc.private_subnets
    security_groups = [aws_security_group.db_sg.id]

    storage_info {
      ebs_storage_info {
        volume_size = 10
      }
    }
  }

  client_authentication {
    sasl {
      iam = true
    }
  }

  configuration_info {
    arn      = aws_msk_configuration.kafka.arn
    revision = aws_msk_configuration.kafka.latest_revision
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "TLS"
    }
  }
}

# ── 4. KEYSPACES (Chat Service — message persistence) ──────────────────────
resource "aws_keyspaces_keyspace" "chat" {
  name = "FoodIT"

  lifecycle { prevent_destroy = true }
}

# Chat rooms — one per order
resource "aws_keyspaces_table" "chat_rooms" {
  keyspace_name = aws_keyspaces_keyspace.chat.name
  table_name    = "chat_rooms"

  schema_definition {
    column {
      name = "chat_room_id"
      type = "uuid"
    }
    column {
      name = "order_id"
      type = "uuid"
    }
    column {
      name = "buyer_id"
      type = "uuid"
    }
    column {
      name = "runner_id"
      type = "uuid"
    }
    column {
      name = "status"
      type = "text"
    }
    column {
      name = "created_at"
      type = "timestamp"
    }
    column {
      name = "closed_at"
      type = "timestamp"
    }

    partition_key {
      name = "chat_room_id"
    }
  }

  lifecycle { prevent_destroy = true }
}

# Messages — ordered by time within each chat room
resource "aws_keyspaces_table" "messages" {
  keyspace_name = aws_keyspaces_keyspace.chat.name
  table_name    = "messages"

  schema_definition {
    column {
      name = "chat_room_id"
      type = "uuid"
    }
    column {
      name = "message_id"
      type = "timeuuid"
    }
    column {
      name = "sender_id"
      type = "uuid"
    }
    column {
      name = "content"
      type = "text"
    }
    column {
      name = "sent_at"
      type = "timestamp"
    }

    partition_key {
      name = "chat_room_id"
    }
    clustering_key {
      name     = "message_id"
      order_by = "DESC"
    }
  }

  lifecycle { prevent_destroy = true }
}

# Lookup table — find chat rooms by user
resource "aws_keyspaces_table" "chat_rooms_by_user" {
  keyspace_name = aws_keyspaces_keyspace.chat.name
  table_name    = "chat_rooms_by_user"

  schema_definition {
    column {
      name = "user_id"
      type = "uuid"
    }
    column {
      name = "chat_room_id"
      type = "uuid"
    }
    column {
      name = "created_at"
      type = "timestamp"
    }
    column {
      name = "order_id"
      type = "uuid"
    }
    column {
      name = "status"
      type = "text"
    }

    partition_key {
      name = "user_id"
    }
    clustering_key {
      name     = "chat_room_id"
      order_by = "ASC"
    }
    clustering_key {
      name     = "created_at"
      order_by = "DESC"
    }
  }

  lifecycle { prevent_destroy = true }
}

# ── 5. S3 (Store Assets — logos, banners, etc.) ──────────────────────────
resource "aws_s3_bucket" "assets" {
  bucket = "foodit-assets"

  lifecycle { prevent_destroy = true }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── 7. SECRETS MANAGER ────────────────────────────────────────────────────
resource "aws_secretsmanager_secret" "stripe_key" {
  name        = "foodit/stripe-secret"
  description = "Stores the Stripe Secret Key for the Payment Wrapper Service"

  lifecycle { prevent_destroy = true }
}
