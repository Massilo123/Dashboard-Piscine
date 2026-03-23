#!/bin/bash
set -euo pipefail

# Only run in remote (web) environment
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo "Installing client dependencies..."
cd "$CLAUDE_PROJECT_DIR"
npm install

echo "Installing server dependencies..."
cd "$CLAUDE_PROJECT_DIR/server"
npm install

echo "Setup complete."
