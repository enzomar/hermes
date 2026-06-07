#!/bin/bash

# Test script for GitHub Models via Hermes backend
# This mimics what the UI sends to /api/config/test/llm

# Read the GitHub PAT from PAT.txt
if [ ! -f "PAT.txt" ]; then
  echo "ERROR: PAT.txt not found. Create it with your GitHub PAT token."
  exit 1
fi

PAT=$(cat PAT.txt)

echo "Testing GitHub Models via Hermes backend..."
echo "Model: gpt-4o-mini"
echo "Endpoint: http://127.0.0.1:8765/api/config/test/llm"
echo ""

curl -s -X POST http://127.0.0.1:8765/api/config/test/llm \
  -H "Content-Type: application/json" \
  -d '{
    "llm": {
      "provider": "github-copilot",
      "model": "gpt-4o-mini",
      "api_base": "https://models.github.ai/inference",
      "api_key_env": "'"$PAT"'",
      "custom_llm_provider": "openai",
      "temperature": 0.2,
      "max_tokens": 12,
      "timeout_seconds": 20
    }
  }' | jq '.'

echo ""
echo "Check backend logs for debug output showing the request details."
