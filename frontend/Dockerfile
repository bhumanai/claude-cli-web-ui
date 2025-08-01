# Multi-stage Dockerfile for React Frontend
# Security-hardened production build with nginx

# Stage 1: Build stage
FROM node:18-alpine as builder

# Security: Install security updates
RUN apk update && apk upgrade && apk add --no-cache \
    python3 \
    make \
    g++

# Security: Create non-root user for build
RUN addgroup -g 1001 -S builduser && \
    adduser -S builduser -u 1001 -G builduser

# Set build working directory
WORKDIR /build

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies with security audit
RUN npm ci --only=production --audit && \
    npm cache clean --force

# Copy source code and build
COPY . .
RUN npm run build

# Stage 2: Production stage with nginx
FROM nginx:1.25-alpine as runtime

# Security: Install security updates and remove unnecessary packages
RUN apk update && apk upgrade && \
    apk add --no-cache ca-certificates && \
    rm -rf /var/cache/apk/*

# Security: Create non-root nginx user
RUN addgroup -g 101 -S nginx || true && \
    adduser -S nginx -u 101 -G nginx || true

# Remove default nginx configuration
RUN rm -rf /etc/nginx/nginx.conf /etc/nginx/conf.d/default.conf

# Copy custom nginx configuration
COPY --chown=nginx:nginx nginx.conf /etc/nginx/nginx.conf
COPY --chown=nginx:nginx nginx-site.conf /etc/nginx/conf.d/default.conf

# Copy built application from builder stage
COPY --from=builder --chown=nginx:nginx /build/dist /usr/share/nginx/html

# Security: Set proper permissions
RUN chmod -R 755 /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx /var/log/nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown nginx:nginx /var/run/nginx.pid

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Switch to non-root user
USER nginx

# Expose port
EXPOSE 3000

# Start nginx
CMD ["nginx", "-g", "daemon off;"]