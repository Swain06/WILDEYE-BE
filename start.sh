#!/bin/bash
set -e

# WildEye startup script for Hugging Face Spaces
# FastAPI serves the React frontend as static files on port 7860

echo "=========================================="
echo "  WildEye AI Wildlife Conservation Platform"
echo "  Starting on port 7860..."
echo "=========================================="

# Start uvicorn from backend directory
cd /app/backend
exec uvicorn main:app --host 0.0.0.0 --port 7860 --workers 1
