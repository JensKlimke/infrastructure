#!/bin/bash

# Script to stop the production stack

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/.."

echo "🛑 Stopping production stack..."
echo ""

cd "$PROJECT_DIR"

# Stop all services
docker-compose -f docker-compose.yml -f docker-compose.mongo.yml down

echo ""
echo "✅ Production stack stopped successfully!"
echo ""
echo "💡 To start again:"
echo "   $SCRIPT_DIR/start-production.sh"
echo ""
