#!/usr/bin/env bash

# Print welcome
echo "=========================================="
echo "    AI Agent MVP - Local Development      "
echo "=========================================="

echo "🚀 Starting dependencies via Docker Compose..."
# We only start the needed backing services, not 'backend' or 'web' containers
docker compose up -d postgres redis etcd minio milvus markitdown-service

echo "⏳ Waiting for services to be ready (approx 10s)..."
sleep 10

echo "🚀 Starting Backend (Spring Boot)..."
cd backend
mvn spring-boot:run &
BACKEND_PID=$!
cd ..

echo "🚀 Starting Frontend (Vite)..."
cd web
npm run dev &
FRONTEND_PID=$!
cd ..

echo "=========================================="
echo "✅ All services started locally!"
echo "   Backend PID: $BACKEND_PID"
echo "   Frontend PID: $FRONTEND_PID"
echo "   Press Ctrl+C to stop."
echo "=========================================="

# Trap SIGINT and SIGTERM to gracefully stop
cleanup() {
    echo ""
    echo "🛑 Stopping processes..."
    if kill -0 $BACKEND_PID 2>/dev/null; then
        kill -TERM $BACKEND_PID
    fi
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        kill -TERM $FRONTEND_PID
    fi
    wait $BACKEND_PID 2>/dev/null || true
    wait $FRONTEND_PID 2>/dev/null || true
    echo "👋 Stopped."
    exit 0
}

trap cleanup SIGINT SIGTERM

# Wait indefinitely until interrupted
wait
