#!/bin/bash

# Test script to see how Claude authentication works

echo "Testing Claude authentication methods..."
echo ""

# Test 1: Check if claude responds when already authenticated
echo "Test 1: Checking if Claude is already authenticated..."
if echo "1+1" | claude -p 2>/dev/null | grep -q "2"; then
    echo "✓ Claude is authenticated and working"
else
    echo "✗ Claude is not authenticated or not working"
fi

echo ""
echo "Test 2: Checking what Claude setup-token does..."
echo "Running: claude setup-token (will timeout if interactive)"

# This will likely fail or need interaction
timeout 2 claude setup-token 2>&1 || echo "Command requires interactive terminal"

echo ""
echo "Test 3: Checking if Claude has any session/auth files..."
find ~ -name "*claude*" -type f 2>/dev/null | grep -E "(auth|token|session|login)" | head -5

echo ""
echo "Done testing."