#!/bin/bash

# Script to start the production stack with all services
# This includes Traefik, web application, auth middleware, MongoDB, and Mongo Express

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/.."

echo "🚀 Starting production stack..."
echo ""

# Check if .env file exists
if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo "❌ Error: .env file not found"
    echo "📝 Please create a .env file based on .env.example:"
    echo "   cp .env.example .env"
    echo "   # Then edit .env with your actual values"
    exit 1
fi

# Load environment variables
source "$PROJECT_DIR/.env"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running"
    echo "💡 Please start Docker Desktop and try again"
    exit 1
fi

# Create Traefik network if it doesn't exist
echo "🔧 Checking Traefik network..."
if ! docker network inspect traefik_network > /dev/null 2>&1; then
    echo "📡 Creating traefik_network..."
    docker network create traefik_network
    echo "✅ Network created"
else
    echo "✅ Network already exists"
fi
echo ""

# Stop any running containers from these compose files
echo "🛑 Stopping any existing containers..."
cd "$PROJECT_DIR"
docker-compose -f docker-compose.yml -f docker-compose.mongo.yml down 2>/dev/null || true
echo ""

# Start the production stack
echo "🚀 Starting all services..."
docker-compose -f docker-compose.yml -f docker-compose.mongo.yml up -d --build
echo ""

# Wait a moment for services to initialize
echo "⏳ Waiting for services to start..."
sleep 3
echo ""

# Show status
echo "📊 Service Status:"
docker-compose -f docker-compose.yml -f docker-compose.mongo.yml ps
echo ""

# Show URLs
echo "✅ Production stack started successfully!"
echo ""
echo "🌐 Available services:"
echo "   - Main website:    https://${DOMAIN}"
echo "   - Mongo Express:   https://mongo.${DOMAIN}"
echo ""
echo "📝 Logs:"
echo "   View all logs:     docker-compose -f docker-compose.yml -f docker-compose.mongo.yml logs -f"
echo "   View specific:     docker logs <container-name>"
echo ""
echo "🛑 To stop:"
echo "   cd $PROJECT_DIR && docker-compose -f docker-compose.yml -f docker-compose.mongo.yml down"
echo ""
