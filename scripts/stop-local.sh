#!/bin/bash

# Script to stop the local development stack

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/.."

echo "🛑 Stopping local development stack..."
echo ""

cd "$PROJECT_DIR"

# Stop all services
docker-compose -f docker-compose.local.yml -f docker-compose.mongo.local.yml -f docker-compose.shorty.local.yml down

echo ""
echo "✅ Local development stack stopped successfully!"
echo ""
echo "💡 To start again:"
echo "   $SCRIPT_DIR/start-local.sh"
echo ""
