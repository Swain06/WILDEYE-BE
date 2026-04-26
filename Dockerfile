# ─────────────────────────────────────────────────────────────
# Stage 1: Build React frontend
# ─────────────────────────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend

# Copy package files first for better layer caching
COPY frontend/package*.json ./
RUN npm ci --legacy-peer-deps

# Copy the rest of the frontend source
COPY frontend/ .

# Build with empty VITE_API_URL so all API calls go to the same origin
RUN VITE_API_URL="" npm run build


# ─────────────────────────────────────────────────────────────
# Stage 2: Python backend + serve built frontend
# ─────────────────────────────────────────────────────────────
FROM python:3.10-slim

# Install system dependencies needed by OpenCV / torch / ultralytics
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install Python dependencies
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the full backend source
COPY backend/ ./backend/

# Copy the compiled frontend assets from stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy startup script
COPY start.sh ./start.sh
RUN chmod +x ./start.sh

# HF Spaces requires port 7860
EXPOSE 7860

# Set working directory to backend for Python imports
WORKDIR /app/backend

CMD ["/app/start.sh"]
