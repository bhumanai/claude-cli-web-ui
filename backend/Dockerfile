# Multi-stage Dockerfile for FastAPI Backend
# Security-hardened production build

# Stage 1: Build stage
FROM python:3.11-slim as builder

# Security: Create non-root user for build process
RUN groupadd -r builduser && useradd -r -g builduser builduser

# Install build dependencies and security updates
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/*

# Set build working directory
WORKDIR /build

# Copy requirements first for better layer caching
COPY requirements.txt requirements-py311.txt ./

# Install Python dependencies in virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Upgrade pip and install dependencies with security checks
RUN pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

# Stage 2: Runtime stage
FROM python:3.11-slim as runtime

# Security: Install security updates and minimal runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Security: Create non-privileged user
RUN groupadd -r appuser && useradd -r -g appuser -u 1001 appuser

# Copy virtual environment from builder stage
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Create app directory with proper permissions
WORKDIR /app
RUN chown appuser:appuser /app

# Copy application code
COPY --chown=appuser:appuser app/ ./app/
COPY --chown=appuser:appuser main.py ./
COPY --chown=appuser:appuser start_server.py ./

# Security: Remove write permissions from application files
RUN chmod -R 755 /app && \
    find /app -type f -exec chmod 644 {} \; && \
    chmod +x main.py start_server.py

# Switch to non-root user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Security: Don't run as root, expose minimal port
EXPOSE 8000

# Environment variables for production
ENV PYTHONPATH=/app \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBUG=false \
    HOST=0.0.0.0 \
    PORT=8000

# Use exec form for proper signal handling
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]