#!/bin/bash
set -e

DOCKER_DIR=".docker"
COMPOSE_FILE="$DOCKER_DIR/docker-compose.yml"
IMAGE_NAME="ghcr.io/ankimcp/headless-anki:x11-vnc-v1.1.0"

echo "=== Full E2E Test Scenario ==="

# Cleanup function
cleanup() {
    echo ""
    echo "=== Cleanup ==="

    echo "Stopping containers..."
    docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || true

    echo "Removing image..."
    docker rmi "$IMAGE_NAME" 2>/dev/null || true

    echo "Cleanup complete"
}

# Set trap to cleanup on exit (success or failure)
trap cleanup EXIT

# Step 1: Clean start
echo ""
echo "Step 1: Fresh start - removing existing containers and image"
cleanup
trap cleanup EXIT  # Re-set trap after manual cleanup

# Step 2: Build project
echo ""
echo "Step 2: Building project"
npm run build

# Step 3: Start docker compose
echo ""
echo "Step 3: Starting Anki container"
docker compose -f "$COMPOSE_FILE" up -d

# Step 4: Wait for AnkiConnect
echo ""
echo "Step 4: Waiting for AnkiConnect to be ready"
for i in {1..60}; do
    if curl -s http://localhost:8765 -X POST -d '{"action":"version","version":6}' | grep -q "result"; then
        echo "AnkiConnect is ready"
        break
    fi
    if [ $i -eq 60 ]; then
        echo "ERROR: AnkiConnect failed to start after 60 attempts"
        docker compose -f "$COMPOSE_FILE" logs
        exit 1
    fi
    echo "Attempt $i/60 - waiting..."
    sleep 2
done

# Step 5: Start HTTP server
echo ""
echo "Step 5: Starting HTTP server"
npm run start:prod:http &
HTTP_PID=$!
sleep 5

# Verify server is running
if ! curl -s http://127.0.0.1:3000 > /dev/null 2>&1; then
    echo "ERROR: HTTP server failed to start"
    kill $HTTP_PID 2>/dev/null || true
    exit 1
fi
echo "HTTP server running (PID: $HTTP_PID)"

# Step 6: Run E2E tests
echo ""
echo "Step 6: Running E2E tests"
TEST_FAILED=0

echo ""
echo "Running HTTP tests..."
if npm run e2e:test:http; then
    echo "HTTP tests passed"
else
    echo "ERROR: HTTP tests failed"
    TEST_FAILED=1
fi

echo ""
echo "Running STDIO tests..."
if npm run e2e:test:stdio; then
    echo "STDIO tests passed"
else
    echo "ERROR: STDIO tests failed"
    TEST_FAILED=1
fi

# Kill HTTP server
kill $HTTP_PID 2>/dev/null || true

# Step 7: Results
echo ""
echo "=== Results ==="
if [ $TEST_FAILED -eq 0 ]; then
    echo "All E2E tests passed!"
else
    echo "ERROR: Some E2E tests failed"
    exit 1
fi
