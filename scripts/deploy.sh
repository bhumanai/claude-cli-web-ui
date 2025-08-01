#!/bin/bash

# Production Deployment Script for Claude CLI Web UI
# Handles blue-green deployments, health checks, and rollback capabilities

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="${PROJECT_ROOT}/logs"
CONFIG_FILE="${PROJECT_ROOT}/.env"

# Default configuration
DEFAULT_ENVIRONMENT="staging"
DEFAULT_NAMESPACE="claude-cli"
DEFAULT_TIMEOUT=600
DEFAULT_HEALTH_CHECK_RETRIES=30
DEFAULT_HEALTH_CHECK_DELAY=10

# Load environment variables
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
fi

# Deployment configuration
ENVIRONMENT="${DEPLOY_ENVIRONMENT:-$DEFAULT_ENVIRONMENT}"
NAMESPACE="${KUBERNETES_NAMESPACE:-$DEFAULT_NAMESPACE}"
TIMEOUT="${DEPLOY_TIMEOUT:-$DEFAULT_TIMEOUT}"
HEALTH_CHECK_RETRIES="${HEALTH_CHECK_RETRIES:-$DEFAULT_HEALTH_CHECK_RETRIES}"
HEALTH_CHECK_DELAY="${HEALTH_CHECK_DELAY:-$DEFAULT_HEALTH_CHECK_DELAY}"

# Timestamp for logs
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DEPLOYMENT_ID="deploy_${TIMESTAMP}"

# Logging
LOG_FILE="${LOG_DIR}/deploy_${TIMESTAMP}.log"
mkdir -p "$LOG_DIR"
exec 1> >(tee -a "$LOG_FILE")
exec 2> >(tee -a "$LOG_FILE" >&2)

# Function to print colored output
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check prerequisites
check_prerequisites() {
    log_info "Checking deployment prerequisites..."
    
    local missing_commands=()
    
    if ! command_exists kubectl; then
        missing_commands+=("kubectl")
    fi
    
    if ! command_exists docker; then
        missing_commands+=("docker")
    fi
    
    if ! command_exists jq; then
        missing_commands+=("jq")
    fi
    
    if ! command_exists curl; then
        missing_commands+=("curl")
    fi
    
    if [ ${#missing_commands[@]} -gt 0 ]; then
        log_error "Missing required commands: ${missing_commands[*]}"
        return 1
    fi
    
    # Check Kubernetes connectivity
    if ! kubectl cluster-info >/dev/null 2>&1; then
        log_error "Cannot connect to Kubernetes cluster"
        return 1
    fi
    
    # Check if namespace exists
    if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
        log_error "Namespace '$NAMESPACE' does not exist"
        return 1
    fi
    
    log_success "Prerequisites check passed"
    return 0
}

# Function to validate image tags
validate_image_tags() {
    local backend_image="$1"
    local frontend_image="$2"
    
    log_info "Validating Docker image tags..."
    
    # Check if images exist and are accessible
    if ! docker manifest inspect "$backend_image" >/dev/null 2>&1; then
        log_error "Backend image not found or not accessible: $backend_image"
        return 1
    fi
    
    if ! docker manifest inspect "$frontend_image" >/dev/null 2>&1; then
        log_error "Frontend image not found or not accessible: $frontend_image"
        return 1
    fi
    
    log_success "Image validation passed"
    log_info "Backend image: $backend_image"
    log_info "Frontend image: $frontend_image"
    
    return 0
}

# Function to create pre-deployment backup
create_pre_deployment_backup() {
    log_info "Creating pre-deployment backup..."
    
    # Create backup job from cronjob template
    local backup_job_name="backup-pre-deploy-${DEPLOYMENT_ID}"
    
    if kubectl get cronjob claude-backup -n "$NAMESPACE" >/dev/null 2>&1; then
        kubectl create job "$backup_job_name" \
            --from=cronjob/claude-backup \
            -n "$NAMESPACE"
        
        # Wait for backup to complete (with timeout)
        local backup_timeout=300
        local elapsed=0
        
        while [ $elapsed -lt $backup_timeout ]; do
            local job_status
            job_status=$(kubectl get job "$backup_job_name" -n "$NAMESPACE" -o jsonpath='{.status.conditions[0].type}' 2>/dev/null || echo "")
            
            if [ "$job_status" = "Complete" ]; then
                log_success "Pre-deployment backup completed"
                return 0
            elif [ "$job_status" = "Failed" ]; then
                log_error "Pre-deployment backup failed"
                return 1
            fi
            
            sleep 10
            elapsed=$((elapsed + 10))
            log_info "Waiting for backup to complete... (${elapsed}s/${backup_timeout}s)"
        done
        
        log_warning "Backup timeout reached, proceeding with deployment"
    else
        log_warning "Backup cronjob not found, skipping pre-deployment backup"
    fi
    
    return 0
}

# Function to run database migrations
run_database_migrations() {
    log_info "Running database migrations..."
    
    local migration_job_name="db-migration-${DEPLOYMENT_ID}"
    
    # Create migration job
    cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: $migration_job_name
  namespace: $NAMESPACE
  labels:
    app: claude-cli
    component: migration
    deployment-id: $DEPLOYMENT_ID
spec:
  template:
    metadata:
      labels:
        app: claude-cli
        component: migration
    spec:
      restartPolicy: Never
      containers:
      - name: migration
        image: $BACKEND_IMAGE
        command: ["/bin/sh"]
        args:
          - -c
          - |
            echo "Starting database migration..."
            python -c "
            import asyncio
            import sys
            from app.database import run_migrations
            
            async def main():
                try:
                    await run_migrations()
                    print('Database migrations completed successfully')
                    sys.exit(0)
                except Exception as e:
                    print(f'Database migration failed: {e}')
                    sys.exit(1)
            
            asyncio.run(main())
            "
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: claude-cli-secrets
              key: database-url
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
  backoffLimit: 3
  ttlSecondsAfterFinished: 300
EOF
    
    # Wait for migration to complete
    if kubectl wait --for=condition=complete job/"$migration_job_name" -n "$NAMESPACE" --timeout=300s; then
        log_success "Database migrations completed successfully"
        
        # Show migration logs
        kubectl logs job/"$migration_job_name" -n "$NAMESPACE" | tail -10
        
        return 0
    else
        log_error "Database migrations failed"
        
        # Show error logs
        kubectl logs job/"$migration_job_name" -n "$NAMESPACE" | tail -20
        
        return 1
    fi
}

# Function to update deployment images
update_deployment_images() {
    local backend_image="$1"
    local frontend_image="$2"
    
    log_info "Updating deployment images..."
    
    # Update backend deployment
    kubectl set image deployment/claude-backend \
        backend="$backend_image" \
        -n "$NAMESPACE"
    
    # Update frontend deployment
    kubectl set image deployment/claude-frontend \
        frontend="$frontend_image" \
        -n "$NAMESPACE"
    
    # Add deployment annotations
    kubectl annotate deployment/claude-backend \
        deployment.kubernetes.io/revision- \
        deployment-id="$DEPLOYMENT_ID" \
        deployed-at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        deployed-by="${USER:-unknown}" \
        backend-image="$backend_image" \
        -n "$NAMESPACE" --overwrite
    
    kubectl annotate deployment/claude-frontend \
        deployment.kubernetes.io/revision- \
        deployment-id="$DEPLOYMENT_ID" \
        deployed-at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        deployed-by="${USER:-unknown}" \
        frontend-image="$frontend_image" \
        -n "$NAMESPACE" --overwrite
    
    log_success "Deployment images updated"
}

# Function to wait for rollout completion
wait_for_rollout() {
    local deployment="$1"
    
    log_info "Waiting for rollout of $deployment..."
    
    if kubectl rollout status deployment/"$deployment" -n "$NAMESPACE" --timeout="${TIMEOUT}s"; then
        log_success "Rollout of $deployment completed successfully"
        
        # Show deployment status
        kubectl get deployment "$deployment" -n "$NAMESPACE" -o wide
        
        return 0
    else
        log_error "Rollout of $deployment failed or timed out"
        
        # Show pod status for debugging
        kubectl get pods -l app=claude-cli,component="$deployment" -n "$NAMESPACE"
        
        # Show recent events
        kubectl get events --sort-by='.lastTimestamp' -n "$NAMESPACE" | tail -10
        
        return 1
    fi
}

# Function to perform health checks
perform_health_checks() {
    log_info "Performing health checks..."
    
    # Get service endpoints
    local backend_service
    local frontend_service
    
    backend_service=$(kubectl get service claude-backend -n "$NAMESPACE" -o jsonpath='{.spec.clusterIP}:{.spec.ports[0].port}' 2>/dev/null || echo "")
    frontend_service=$(kubectl get service claude-frontend -n "$NAMESPACE" -o jsonpath='{.spec.clusterIP}:{.spec.ports[0].port}' 2>/dev/null || echo "")
    
    if [ -z "$backend_service" ] || [ -z "$frontend_service" ]; then
        log_error "Could not get service endpoints"
        return 1
    fi
    
    log_info "Backend service: $backend_service"
    log_info "Frontend service: $frontend_service"
    
    # Health check with retries
    local retries=0
    local backend_health=false
    local frontend_health=false
    
    while [ $retries -lt $HEALTH_CHECK_RETRIES ]; do
        log_info "Health check attempt $((retries + 1))/$HEALTH_CHECK_RETRIES"
        
        # Check backend health
        if [ "$backend_health" = false ]; then
            if kubectl run health-check-backend-$$-$retries \
                --image=curlimages/curl:latest \
                --rm -i --restart=Never \
                --timeout=30s \
                -n "$NAMESPACE" \
                -- curl -f "http://$backend_service/health" >/dev/null 2>&1; then
                backend_health=true
                log_success "Backend health check passed"
            else
                log_warning "Backend health check failed"
            fi
        fi
        
        # Check frontend health
        if [ "$frontend_health" = false ]; then
            if kubectl run health-check-frontend-$$-$retries \
                --image=curlimages/curl:latest \
                --rm -i --restart=Never \
                --timeout=30s \
                -n "$NAMESPACE" \
                -- curl -f "http://$frontend_service/health" >/dev/null 2>&1; then
                frontend_health=true
                log_success "Frontend health check passed"
            else
                log_warning "Frontend health check failed"
            fi
        fi
        
        # Check if both services are healthy
        if [ "$backend_health" = true ] && [ "$frontend_health" = true ]; then
            log_success "All health checks passed"
            return 0
        fi
        
        retries=$((retries + 1))
        if [ $retries -lt $HEALTH_CHECK_RETRIES ]; then
            log_info "Waiting ${HEALTH_CHECK_DELAY}s before next health check..."
            sleep $HEALTH_CHECK_DELAY
        fi
    done
    
    log_error "Health checks failed after $HEALTH_CHECK_RETRIES attempts"
    return 1
}

# Function to perform smoke tests
perform_smoke_tests() {
    log_info "Performing smoke tests..."
    
    # Get ingress URL
    local ingress_url
    ingress_url=$(kubectl get ingress claude-cli-ingress -n "$NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "")
    
    if [ -z "$ingress_url" ]; then
        # Fallback to service port-forward for testing
        log_info "Ingress URL not available, using port-forward for testing"
        
        # Port-forward backend service
        kubectl port-forward service/claude-backend 8080:8000 -n "$NAMESPACE" &
        local pf_backend_pid=$!
        
        # Port-forward frontend service
        kubectl port-forward service/claude-frontend 8081:3000 -n "$NAMESPACE" &
        local pf_frontend_pid=$!
        
        # Wait for port-forwards to be ready
        sleep 5
        
        # Test endpoints
        local smoke_test_passed=true
        
        if ! curl -f http://localhost:8080/health >/dev/null 2>&1; then
            log_error "Backend smoke test failed"
            smoke_test_passed=false
        else
            log_success "Backend smoke test passed"
        fi
        
        if ! curl -f http://localhost:8081/health >/dev/null 2>&1; then
            log_error "Frontend smoke test failed"
            smoke_test_passed=false
        else
            log_success "Frontend smoke test passed"
        fi
        
        # Clean up port-forwards
        kill $pf_backend_pid $pf_frontend_pid 2>/dev/null || true
        
        if [ "$smoke_test_passed" = true ]; then
            log_success "All smoke tests passed"
            return 0
        else
            log_error "Some smoke tests failed"
            return 1
        fi
    else
        log_info "Testing ingress URL: https://$ingress_url"
        
        # Test ingress endpoints
        if curl -f "https://$ingress_url/health" >/dev/null 2>&1 && \
           curl -f "https://$ingress_url/api/health" >/dev/null 2>&1; then
            log_success "Ingress smoke tests passed"
            return 0
        else
            log_error "Ingress smoke tests failed"
            return 1
        fi
    fi
}

# Function to rollback deployment
rollback_deployment() {
    log_error "Deployment failed, initiating rollback..."
    
    # Rollback backend
    if kubectl rollout undo deployment/claude-backend -n "$NAMESPACE"; then
        log_info "Backend rollback initiated"
        kubectl rollout status deployment/claude-backend -n "$NAMESPACE" --timeout=300s
    else
        log_error "Backend rollback failed"
    fi
    
    # Rollback frontend
    if kubectl rollout undo deployment/claude-frontend -n "$NAMESPACE"; then
        log_info "Frontend rollback initiated"
        kubectl rollout status deployment/claude-frontend -n "$NAMESPACE" --timeout=300s
    else
        log_error "Frontend rollback failed"
    fi
    
    # Wait for rollback to complete and verify
    sleep 30
    if perform_health_checks; then
        log_success "Rollback completed successfully"
        return 0
    else
        log_error "Rollback verification failed"
        return 1
    fi
}

# Function to send deployment notification
send_notification() {
    local status="$1"
    local message="$2"
    
    local webhook_url="${SLACK_WEBHOOK_URL:-}"
    local email_to="${NOTIFICATION_EMAIL:-}"
    
    # Slack notification
    if [ -n "$webhook_url" ]; then
        local color="good"
        local emoji="✅"
        
        if [ "$status" != "success" ]; then
            color="danger"
            emoji="❌"
        fi
        
        curl -X POST -H 'Content-type: application/json' \
            --data "{
                \"attachments\": [{
                    \"color\": \"$color\",
                    \"title\": \"$emoji Claude CLI Deployment $status\",
                    \"text\": \"$message\",
                    \"fields\": [
                        {\"title\": \"Environment\", \"value\": \"$ENVIRONMENT\", \"short\": true},
                        {\"title\": \"Deployment ID\", \"value\": \"$DEPLOYMENT_ID\", \"short\": true},
                        {\"title\": \"Namespace\", \"value\": \"$NAMESPACE\", \"short\": true},
                        {\"title\": \"Timestamp\", \"value\": \"$(date -u)\", \"short\": true}
                    ],
                    \"footer\": \"Claude CLI Deployment System\",
                    \"ts\": $(date +%s)
                }]
            }" \
            "$webhook_url" >/dev/null 2>&1
        
        log_info "Slack notification sent"
    fi
    
    # Email notification (for failures)
    if [ "$status" != "success" ] && [ -n "$email_to" ] && command_exists mail; then
        echo "$message" | mail -s "Claude CLI Deployment $status" "$email_to"
        log_info "Email notification sent"
    fi
}

# Function to perform full deployment
deploy() {
    local backend_image="$1"
    local frontend_image="$2"
    local skip_backup="${3:-false}"
    local skip_migration="${4:-false}"
    
    log_info "Starting deployment process"
    log_info "Deployment ID: $DEPLOYMENT_ID"
    log_info "Environment: $ENVIRONMENT"
    log_info "Namespace: $NAMESPACE"
    log_info "Backend image: $backend_image"
    log_info "Frontend image: $frontend_image"
    
    # Validate prerequisites
    if ! check_prerequisites; then
        send_notification "failed" "Deployment prerequisites check failed"
        return 1
    fi
    
    # Validate image tags
    if ! validate_image_tags "$backend_image" "$frontend_image"; then
        send_notification "failed" "Image validation failed"
        return 1
    fi
    
    # Create pre-deployment backup
    if [ "$skip_backup" != "true" ]; then
        if ! create_pre_deployment_backup; then
            log_warning "Pre-deployment backup failed, continuing with deployment"
        fi
    fi
    
    # Run database migrations
    if [ "$skip_migration" != "true" ]; then
        if ! run_database_migrations; then
            send_notification "failed" "Database migrations failed"
            return 1
        fi
    fi
    
    # Update deployment images
    if ! update_deployment_images "$backend_image" "$frontend_image"; then
        send_notification "failed" "Failed to update deployment images"
        return 1
    fi
    
    # Wait for rollout completion
    local rollout_success=true
    
    if ! wait_for_rollout "claude-backend"; then
        rollout_success=false
    fi
    
    if ! wait_for_rollout "claude-frontend"; then
        rollout_success=false
    fi
    
    if [ "$rollout_success" != true ]; then
        send_notification "failed" "Deployment rollout failed"
        rollback_deployment
        return 1
    fi
    
    # Perform health checks
    if ! perform_health_checks; then
        send_notification "failed" "Health checks failed after deployment"
        rollback_deployment
        return 1
    fi
    
    # Perform smoke tests
    if ! perform_smoke_tests; then
        send_notification "failed" "Smoke tests failed after deployment"
        rollback_deployment
        return 1
    fi
    
    log_success "Deployment completed successfully!"
    send_notification "success" "Deployment completed successfully. All services are healthy and smoke tests passed."
    
    return 0
}

# Function to display usage
usage() {
    echo "Usage: $0 [OPTIONS] COMMAND"
    echo ""
    echo "Production deployment script for Claude CLI Web UI"
    echo ""
    echo "Commands:"
    echo "  deploy BACKEND_IMAGE FRONTEND_IMAGE  Deploy specified images"
    echo "  rollback                             Rollback to previous version"
    echo "  status                               Show deployment status"
    echo "  health                               Run health checks only"
    echo ""
    echo "Options:"
    echo "  -e, --environment ENV    Target environment (default: $DEFAULT_ENVIRONMENT)"
    echo "  -n, --namespace NS       Kubernetes namespace (default: $DEFAULT_NAMESPACE)"
    echo "  -t, --timeout SECONDS    Deployment timeout (default: $DEFAULT_TIMEOUT)"
    echo "  --skip-backup           Skip pre-deployment backup"
    echo "  --skip-migration        Skip database migrations"
    echo "  --dry-run               Show what would be deployed without executing"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  DEPLOY_ENVIRONMENT, KUBERNETES_NAMESPACE, DEPLOY_TIMEOUT"
    echo "  SLACK_WEBHOOK_URL, NOTIFICATION_EMAIL"
    echo ""
    echo "Examples:"
    echo "  $0 deploy ghcr.io/org/claude-backend:v1.2.3 ghcr.io/org/claude-frontend:v1.2.3"
    echo "  $0 --environment production deploy backend:latest frontend:latest"
    echo "  $0 rollback"
    echo "  $0 health"
}

# Parse command line arguments
COMMAND=""
BACKEND_IMAGE=""
FRONTEND_IMAGE=""
SKIP_BACKUP=false
SKIP_MIGRATION=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -n|--namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        -t|--timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --skip-backup)
            SKIP_BACKUP=true
            shift
            ;;
        --skip-migration)
            SKIP_MIGRATION=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        deploy)
            COMMAND="deploy"
            if [ $# -ge 3 ]; then
                BACKEND_IMAGE="$2"
                FRONTEND_IMAGE="$3"
                shift 3
            else
                log_error "Deploy command requires backend and frontend image arguments"
                usage
                exit 1
            fi
            ;;
        rollback|status|health)
            COMMAND="$1"
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Execute command
case "$COMMAND" in
    deploy)
        if [ "$DRY_RUN" = true ]; then
            log_info "DRY RUN: Would deploy:"
            log_info "  Backend: $BACKEND_IMAGE"
            log_info "  Frontend: $FRONTEND_IMAGE"
            log_info "  Environment: $ENVIRONMENT"
            log_info "  Namespace: $NAMESPACE"
            exit 0
        fi
        
        deploy "$BACKEND_IMAGE" "$FRONTEND_IMAGE" "$SKIP_BACKUP" "$SKIP_MIGRATION"
        ;;
    rollback)
        check_prerequisites && rollback_deployment
        ;;
    status)
        check_prerequisites
        kubectl get deployments -n "$NAMESPACE" -l app=claude-cli -o wide
        kubectl get pods -n "$NAMESPACE" -l app=claude-cli
        ;;
    health)
        check_prerequisites && perform_health_checks
        ;;
    "")
        log_error "No command specified"
        usage
        exit 1
        ;;
    *)
        log_error "Unknown command: $COMMAND"
        usage
        exit 1
        ;;
esac