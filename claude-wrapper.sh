#!/bin/bash
# Wrapper script for Claude CLI to ensure proper environment
export HOME=/Users/silverbook
# Include Node.js in PATH - Claude CLI needs it
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/silverbook/.local/bin:/opt/homebrew/bin
cd "$HOME"
exec /Users/silverbook/.local/bin/claude "$@"