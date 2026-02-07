#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check for ffmpeg
if ! command -v ffmpeg &> /dev/null; then
  echo "Error: ffmpeg is not installed."
  echo "  macOS:  brew install ffmpeg"
  echo "  Ubuntu: sudo apt-get install ffmpeg"
  exit 1
fi

# Create virtual environment
if [ ! -d "$SCRIPT_DIR/.venv" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv "$SCRIPT_DIR/.venv"
fi

# Install dependencies
echo "Installing Python dependencies..."
"$SCRIPT_DIR/.venv/bin/pip" install -q -r "$SCRIPT_DIR/requirements.txt"

echo "Setup complete. Virtual environment at $SCRIPT_DIR/.venv"
