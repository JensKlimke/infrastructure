#!/bin/bash

# Script to start the local development stack with all services
# This includes Traefik, web application, auth middleware, MongoDB, and Mongo Express

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/.."

echo "🚀 Starting local development stack..."
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

# Check if certificates exist
if [ ! -f "$PROJECT_DIR/certs/localhost.crt" ] || [ ! -f "$PROJECT_DIR/certs/localhost.key" ]; then
    echo "⚠️  Local certificates not found"
    echo "🔐 Generating self-signed certificates..."
    "$SCRIPT_DIR/generate-local-certs.sh"
    echo ""
fi

# Stop any running containers from these compose files
echo "🛑 Stopping any existing containers..."
cd "$PROJECT_DIR"
docker-compose -f docker-compose.local.yml -f docker-compose.mongo.local.yml -f docker-compose.shorty.local.yml down 2>/dev/null || true
echo ""

# Start the local development stack
echo "🚀 Starting all services..."
docker-compose -f docker-compose.local.yml -f docker-compose.mongo.local.yml -f docker-compose.shorty.local.yml up -d
echo ""

# Wait a moment for services to initialize
echo "⏳ Waiting for services to start..."
sleep 3
echo ""

# Show status
echo "📊 Service Status:"
docker-compose -f docker-compose.local.yml -f docker-compose.mongo.local.yml -f docker-compose.shorty.local.yml ps
echo ""

# Show URLs
echo "✅ Local development stack started successfully!"
echo ""
echo "🌐 Available services:"
echo "   - Main website:    https://${DOMAIN}"
echo "   - Mongo Express:   https://mongo.${DOMAIN}"
echo "   - Shorty:          https://shorty.${DOMAIN}"
echo "   - Shorty API:      https://api.shorty.${DOMAIN}"
echo "   - MongoDB:         mongodb://localhost:${MONGO_PORT:-27017}"
echo "   - Traefik:         http://localhost:${TRAEFIK_DASHBOARD_PORT:-8083}"
echo ""
echo "⚠️  Note: Your browser will show a security warning for self-signed certificates."
echo "   You can safely proceed by clicking 'Advanced' and 'Proceed to localhost'."
echo ""
echo "📝 Logs:"
echo "   View all logs:     docker-compose -f docker-compose.local.yml -f docker-compose.mongo.local.yml -f docker-compose.shorty.local.yml logs -f"
echo "   View specific:     docker logs <container-name>"
echo ""
echo "🛑 To stop:"
echo "   cd $PROJECT_DIR && docker-compose -f docker-compose.local.yml -f docker-compose.mongo.local.yml -f docker-compose.shorty.local.yml down"
echo ""
