#!/bin/bash
# Validate and clean Claude tool output
set -euo pipefail

INPUT="${1:-}"

# Strip ANSI escape codes from output
clean_output=$(echo "$INPUT" | sed 's/\x1b\[[0-9;]*m//g')

# Validate JSON if output looks like JSON
if echo "$clean_output" | head -c1 | grep -q '{'; then
  echo "$clean_output" | jq . > /dev/null 2>&1 || echo "Warning: Invalid JSON in tool output"
fi

echo "$clean_output"
