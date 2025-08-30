#!/bin/bash

echo "=== PDF Filler Debug Script ==="
echo "Timestamp: $(date)"
echo ""

# 1. Kill any existing instances
echo "1. Killing any existing PDF Filler processes..."
pkill -f "PDF Filler" 2>/dev/null
sleep 2

# 2. Check if port is free
echo "2. Checking if port 3456 is free..."
if lsof -i :3456 | grep LISTEN > /dev/null; then
    echo "   ❌ Port 3456 is still in use!"
    lsof -i :3456
else
    echo "   ✅ Port 3456 is free"
fi
echo ""

# 3. Launch the app the same way as double-clicking
echo "3. Launching PDF Filler app (simulating double-click)..."
open "/Users/silverbook/Sites/gemini-pdf-filler/dist/mac-arm64/PDF Filler.app"
echo "   App launched, waiting for startup..."
sleep 5

# 4. Check if server started
echo ""
echo "4. Checking if server started on port 3456..."
if lsof -i :3456 | grep LISTEN > /dev/null; then
    echo "   ✅ Server is listening on port 3456"
    lsof -i :3456 | grep LISTEN
else
    echo "   ❌ Server is NOT listening on port 3456"
fi
echo ""

# 5. Test server health
echo "5. Testing server health endpoint..."
if curl -s http://localhost:3456/api/health > /dev/null 2>&1; then
    echo "   ✅ Server is responding:"
    curl -s http://localhost:3456/api/health | python3 -m json.tool
else
    echo "   ❌ Server is NOT responding"
fi
echo ""

# 6. Check running processes
echo "6. PDF Filler processes running:"
ps aux | grep "PDF Filler" | grep -v grep | while read line; do
    echo "   $line" | cut -c1-150
done
echo ""

# 7. Check Console logs for errors
echo "7. Checking for recent errors in Console (last 30 seconds)..."
log show --predicate 'process == "PDF Filler"' --last 30s 2>/dev/null | grep -i error | tail -5
echo ""

echo "=== Diagnostic complete ==="
echo ""
echo "To test PDF analysis manually, run:"
echo "curl -X POST http://localhost:3456/api/analyze-local \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"filePath\": \"/Users/silverbook/Sites/gemini-pdf-filler/uploads/1755291805044-1755280421774-f1065sk1_MarkCuban_filled_corrected.pdf\"}'"