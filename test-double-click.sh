#!/bin/bash

echo "=== Simulating EXACT double-click environment ==="
echo ""

# Kill any existing instances
pkill -f "PDF Filler" 2>/dev/null
sleep 2

# Launch with minimal environment (simulating Finder launch)
echo "Launching app with minimal PATH (like Finder does)..."
env -i \
  HOME="$HOME" \
  USER="$USER" \
  LANG="en_US.UTF-8" \
  PATH="/usr/bin:/bin:/usr/sbin:/sbin" \
  open "/Users/silverbook/Sites/gemini-pdf-filler/dist/mac-arm64/PDF Filler.app"

echo "App launched. Waiting 10 seconds for startup..."
sleep 10

echo ""
echo "Checking if server started..."
if lsof -i :3456 | grep LISTEN > /dev/null; then
    echo "✅ Server is listening on port 3456"
    
    echo ""
    echo "Testing PDF analysis..."
    curl -X POST http://localhost:3456/api/analyze-local \
      -H "Content-Type: application/json" \
      -d '{"filePath": "/Users/silverbook/Sites/gemini-pdf-filler/uploads/1755291805044-1755280421774-f1065sk1_MarkCuban_filled_corrected.pdf"}' \
      2>/dev/null | python3 -c "import json, sys; d=json.load(sys.stdin); print('✅ PDF analysis WORKS!' if ('type' in d or 'document_type' in d) else f'❌ Analysis failed: {list(d.keys())}')" 2>/dev/null
else
    echo "❌ Server is NOT running!"
    echo ""
    echo "Checking for Node processes spawned by the app:"
    ps aux | grep -E "PDF Filler.*node|node.*gemini" | grep -v grep
fi

echo ""
echo "Checking app log for errors:"
tail -20 ~/Library/Application\ Support/pdf-filler-desktop/app.log | grep -E "(Error|spawn|ENOENT)" | tail -5

echo ""
echo "=== Test complete ==="