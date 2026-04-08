#!/bin/bash

# Setup script to copy .env.example to .env for all services
echo "Setting up .env files for all backend services..."

SERVICE_COUNT=0
for service in backend/services/*/; do
  if [ -f "$service/.env.example" ]; then
    cp "$service/.env.example" "$service/.env"
    echo "✓ Created .env for $(basename $service)"
    ((SERVICE_COUNT++))
  else
    echo "⚠ No .env.example found for $(basename $service)"
  fi
done

echo ""
echo "✅ Setup complete! Created .env files for $SERVICE_COUNT services."
echo ""
echo "Next steps:"
echo "1. Configure AWS credentials and service URLs in each .env file"
echo "2. Run: docker-compose up -d --build"
echo "3. Check status: docker-compose ps"
