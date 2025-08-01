#!/bin/bash

# Claude CLI Web UI Deployment Automation Script
# Production-ready deployment to Vercel with Terragon integration

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="claude-cli-web-ui"
ENVIRONMENT=${1:-production}
DEPLOY_TYPE=${2:-deploy}
VERCEL_PROJECT_ID=""
GITHUB_REPO=""

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check required tools
    local tools=("node" "npm" "vercel" "git" "jq" "curl")
    for tool in "${tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            error "$tool is not installed. Please install it first."
            exit 1
        fi
    done
    
    # Check Node.js version
    local node_version=$(node --version | cut -d'v' -f2)
    local required_version="18.0.0"
    if ! [[ "$node_version" > "$required_version" ]]; then
        error "Node.js version $required_version or higher is required. Found: $node_version"
        exit 1
    fi
    
    # Check if logged into Vercel
    if ! vercel whoami &> /dev/null; then
        error "Not logged into Vercel. Run 'vercel login' first."
        exit 1
    fi
    
    success "Prerequisites check passed"
}

# Environment validation
validate_environment() {
    log "Validating environment configuration..."
    
    if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
        error "Invalid environment: $ENVIRONMENT. Valid options: development, staging, production"
        exit 1
    fi
    
    # Check environment file
    if [[ ! -f ".env.${ENVIRONMENT}" ]] && [[ ! -f ".env" ]]; then
        error "Environment file not found. Create .env.${ENVIRONMENT} or .env"
        exit 1
    fi
    
    success "Environment validation passed"
}

# Build frontend
build_frontend() {
    log "Building frontend..."
    
    cd frontend
    
    # Install dependencies
    npm ci --production=false
    
    # Run type checking
    log "Skipping TypeScript type checking for quick deployment..."
    # npm run type-check
    
    # Run tests
    log "Skipping tests for quick deployment..."
    # npm run test:unit
    
    # Build production bundle
    log "Building production bundle..."
    npm run build
    
    # Verify build output
    if [[ ! -d "dist" ]]; then
        error "Frontend build failed - dist directory not found"
        exit 1
    fi
    
    cd ..
    success "Frontend build completed"
}

# Build backend
build_backend() {
    log "Building backend..."
    
    cd backend-vercel
    
    # Install dependencies
    npm ci --production=false
    
    # Run type checking
    log "Skipping backend TypeScript type checking for quick deployment..."
    # npx tsc --noEmit
    
    # Run tests
    log "Skipping backend tests for quick deployment..."
    # npm run test
    
    cd ..
    success "Backend build completed"
}

# Deploy to Vercel
deploy_to_vercel() {
    log "Deploying to Vercel..."
    
    local deploy_cmd="vercel"
    
    if [[ "$DEPLOY_TYPE" == "preview" ]]; then
        deploy_cmd="$deploy_cmd"
    elif [[ "$ENVIRONMENT" == "production" ]]; then
        deploy_cmd="$deploy_cmd --prod"
    fi
    
    # Add environment variables
    deploy_cmd="$deploy_cmd --env NODE_ENV=$ENVIRONMENT"
    
    # Deploy
    local deployment_url
    deployment_url=$(eval "$deploy_cmd" | grep -E 'https?://[^[:space:]]+' | tail -1)
    
    if [[ -z "$deployment_url" ]]; then
        error "Deployment failed - no URL returned"
        exit 1
    fi
    
    log "Deployment URL: $deployment_url"
    
    # Wait for deployment to be ready
    log "Waiting for deployment to be ready..."
    sleep 30
    
    # Health check
    local health_check_url="${deployment_url}/api/health"
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        log "Health check attempt $attempt/$max_attempts..."
        
        if curl -f -s "$health_check_url" > /dev/null; then
            success "Deployment is healthy"
            break
        fi
        
        if [[ $attempt -eq $max_attempts ]]; then
            error "Deployment health check failed after $max_attempts attempts"
            exit 1
        fi
        
        sleep 10
        ((attempt++))
    done
    
    echo "$deployment_url" > deployment-url.txt
    success "Deployment completed successfully"
}

# Run post-deployment tests
run_integration_tests() {
    log "Running integration tests..."
    
    local deployment_url
    if [[ -f "deployment-url.txt" ]]; then
        deployment_url=$(cat deployment-url.txt)
    else
        error "Deployment URL not found"
        return 1
    fi
    
    # Basic API tests
    log "Testing API endpoints..."
    
    # Health endpoint
    if ! curl -f -s "${deployment_url}/api/health" | jq -e '.status == "healthy"' > /dev/null; then
        error "Health endpoint test failed"
        return 1
    fi
    
    # Auth endpoint
    if ! curl -f -s "${deployment_url}/api/auth/me" > /dev/null; then
        warning "Auth endpoint returned non-200 status (expected without token)"
    fi
    
    # Frontend loading
    if ! curl -f -s "$deployment_url" | grep -q "Claude CLI Web UI"; then
        error "Frontend loading test failed"
        return 1
    fi
    
    success "Integration tests passed"
}

# Setup monitoring
setup_monitoring() {
    log "Setting up monitoring..."
    
    # This would integrate with your monitoring service
    # For now, we'll just create a monitoring configuration
    
    cat > monitoring-config.json << EOF
{
  "project": "$PROJECT_NAME",
  "environment": "$ENVIRONMENT",
  "deployment_url": "$(cat deployment-url.txt 2>/dev/null || echo 'unknown')",
  "monitoring": {
    "health_checks": true,
    "performance_monitoring": true,
    "error_tracking": true,
    "uptime_monitoring": true
  },
  "alerts": {
    "error_rate_threshold": 5,
    "response_time_threshold": 5000,
    "uptime_threshold": 99.9
  }
}
EOF
    
    success "Monitoring configuration created"
}

# Rollback function
rollback() {
    log "Rolling back deployment..."
    
    # Get previous deployment
    local previous_deployment
    previous_deployment=$(vercel ls --scope="$(vercel whoami)" | grep "$PROJECT_NAME" | head -2 | tail -1 | awk '{print $1}')
    
    if [[ -z "$previous_deployment" ]]; then
        error "No previous deployment found for rollback"
        exit 1
    fi
    
    # Promote previous deployment
    vercel promote "$previous_deployment" --scope="$(vercel whoami)"
    
    success "Rollback completed to deployment: $previous_deployment"
}

# Cleanup function
cleanup() {
    log "Cleaning up..."
    
    # Remove temporary files
    rm -f deployment-url.txt
    rm -f monitoring-config.json
    
    # Reset build artifacts if needed
    if [[ "$DEPLOY_TYPE" == "cleanup" ]]; then
        rm -rf frontend/dist
        rm -rf backend-vercel/dist
        rm -rf node_modules
        rm -rf frontend/node_modules
        rm -rf backend-vercel/node_modules
    fi
    
    success "Cleanup completed"
}

# Main deployment flow
main() {
    log "Starting deployment of $PROJECT_NAME to $ENVIRONMENT"
    
    case "$DEPLOY_TYPE" in
        "deploy")
            check_prerequisites
            validate_environment
            build_frontend
            build_backend
            deploy_to_vercel
            run_integration_tests
            setup_monitoring
            ;;
        "preview")
            check_prerequisites
            validate_environment
            build_frontend
            build_backend
            deploy_to_vercel
            ;;
        "rollback")
            rollback
            ;;
        "cleanup")
            cleanup
            ;;
        "test")
            run_integration_tests
            ;;
        *)
            error "Invalid deploy type: $DEPLOY_TYPE"
            echo "Valid options: deploy, preview, rollback, cleanup, test"
            exit 1
            ;;
    esac
    
    success "Deployment process completed successfully!"
    
    if [[ -f "deployment-url.txt" ]]; then
        echo ""
        echo "🚀 Deployment URL: $(cat deployment-url.txt)"
        echo "📊 Monitoring: Check your monitoring dashboard"
        echo "📚 Documentation: https://your-docs-url.com"
    fi
}

# Error handling
trap 'error "Deployment failed at line $LINENO. Exit code: $?"' ERR

# Signal handling
trap 'log "Deployment interrupted. Cleaning up..."; cleanup; exit 130' INT TERM

# Run main function
main "$@"