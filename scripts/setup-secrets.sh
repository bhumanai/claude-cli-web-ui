#!/bin/bash

# Secret Management Setup Script for Claude CLI Web UI
# This script helps set up secrets in various environments

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
ENV_DIR="$PROJECT_ROOT/env"

# Function to print colored output
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to generate secure random passwords
generate_password() {
    local length=${1:-32}
    openssl rand -base64 $((length * 3 / 4)) | tr -d "=+/" | cut -c1-${length}
}

# Function to generate JWT secret
generate_jwt_secret() {
    openssl rand -base64 64 | tr -d "\n"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to create environment file from template
create_env_file() {
    local template_file="$1"
    local output_file="$2"
    local environment="$3"
    
    log_info "Creating $environment environment file: $output_file"
    
    # Copy template
    cp "$template_file" "$output_file"
    
    # Generate secure passwords
    local jwt_secret
    local postgres_password
    local redis_password
    local grafana_password
    
    jwt_secret=$(generate_jwt_secret)
    postgres_password=$(generate_password 32)
    redis_password=$(generate_password 24)
    grafana_password=$(generate_password 16)
    
    # Replace placeholders in the file
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/CHANGE_THIS_IN_PRODUCTION_USE_STRONG_RANDOM_KEY/$jwt_secret/g" "$output_file"
        sed -i '' "s/SECURE_DATABASE_PASSWORD/$postgres_password/g" "$output_file"
        sed -i '' "s/SECURE_REDIS_PASSWORD/$redis_password/g" "$output_file"
        sed -i '' "s/SECURE_GRAFANA_PASSWORD/$grafana_password/g" "$output_file"
    else
        # Linux
        sed -i "s/CHANGE_THIS_IN_PRODUCTION_USE_STRONG_RANDOM_KEY/$jwt_secret/g" "$output_file"
        sed -i "s/SECURE_DATABASE_PASSWORD/$postgres_password/g" "$output_file"
        sed -i "s/SECURE_REDIS_PASSWORD/$redis_password/g" "$output_file"
        sed -i "s/SECURE_GRAFANA_PASSWORD/$grafana_password/g" "$output_file"
    fi
    
    # Set secure file permissions
    chmod 600 "$output_file"
    
    log_success "Created $environment environment file with secure passwords"
    log_warning "Make sure to review and customize the configuration in: $output_file"
}

# Function to create Kubernetes secrets
create_kubernetes_secrets() {
    log_info "Creating Kubernetes secrets..."
    
    if ! command_exists kubectl; then
        log_error "kubectl is not installed. Please install kubectl first."
        return 1
    fi
    
    # Check if namespace exists
    if ! kubectl get namespace claude-cli >/dev/null 2>&1; then
        log_info "Creating namespace: claude-cli"
        kubectl create namespace claude-cli
    fi
    
    # Generate passwords
    local jwt_secret
    local postgres_password
    local redis_password
    local grafana_password
    
    jwt_secret=$(generate_jwt_secret)
    postgres_password=$(generate_password 32)
    redis_password=$(generate_password 24)
    grafana_password=$(generate_password 16)
    
    # Create secret
    kubectl create secret generic claude-cli-secrets \
        --namespace=claude-cli \
        --from-literal=secret-key="$jwt_secret" \
        --from-literal=postgres-password="$postgres_password" \
        --from-literal=postgres-user="claude_user" \
        --from-literal=postgres-db="claude_cli" \
        --from-literal=redis-password="$redis_password" \
        --from-literal=grafana-admin-password="$grafana_password" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    log_success "Kubernetes secrets created successfully"
    log_warning "Secrets are stored in the claude-cli namespace"
}

# Function to setup AWS Secrets Manager
setup_aws_secrets() {
    log_info "Setting up AWS Secrets Manager..."
    
    if ! command_exists aws; then
        log_error "AWS CLI is not installed. Please install AWS CLI first."
        return 1
    fi
    
    local secret_name="claude-cli/production"
    local region="${AWS_DEFAULT_REGION:-us-east-1}"
    
    # Generate secrets
    local jwt_secret
    local postgres_password
    local redis_password
    local grafana_password
    
    jwt_secret=$(generate_jwt_secret)
    postgres_password=$(generate_password 32)
    redis_password=$(generate_password 24)
    grafana_password=$(generate_password 16)
    
    # Create secret JSON
    local secret_json
    secret_json=$(cat <<EOF
{
  "jwt_secret": "$jwt_secret",
  "postgres_password": "$postgres_password",
  "postgres_user": "claude_user",
  "postgres_db": "claude_cli",
  "redis_password": "$redis_password",
  "grafana_admin_password": "$grafana_password"
}
EOF
)
    
    # Create or update secret
    if aws secretsmanager describe-secret --secret-id "$secret_name" --region "$region" >/dev/null 2>&1; then
        log_info "Updating existing secret: $secret_name"
        aws secretsmanager update-secret \
            --secret-id "$secret_name" \
            --secret-string "$secret_json" \
            --region "$region"
    else
        log_info "Creating new secret: $secret_name" 
        aws secretsmanager create-secret \
            --name "$secret_name" \
            --secret-string "$secret_json" \
            --description "Claude CLI Web UI production secrets" \
            --region "$region"
    fi
    
    log_success "AWS Secrets Manager setup completed"
    log_info "Secret ARN: $(aws secretsmanager describe-secret --secret-id "$secret_name" --region "$region" --query 'ARN' --output text)"
}

# Function to setup HashiCorp Vault
setup_vault_secrets() {
    log_info "Setting up HashiCorp Vault secrets..."
    
    if ! command_exists vault; then
        log_error "Vault CLI is not installed. Please install Vault CLI first."
        return 1
    fi
    
    # Check if Vault is accessible
    if ! vault status >/dev/null 2>&1; then
        log_error "Cannot connect to Vault. Please ensure Vault is running and accessible."
        return 1
    fi
    
    local secret_path="secret/claude-cli/production"
    
    # Generate secrets
    local jwt_secret
    local postgres_password
    local redis_password
    local grafana_password
    
    jwt_secret=$(generate_jwt_secret)
    postgres_password=$(generate_password 32)
    redis_password=$(generate_password 24)
    grafana_password=$(generate_password 16)
    
    # Store secrets in Vault
    vault kv put "$secret_path" \
        jwt_secret="$jwt_secret" \
        postgres_password="$postgres_password" \
        postgres_user="claude_user" \
        postgres_db="claude_cli" \
        redis_password="$redis_password" \
        grafana_admin_password="$grafana_password"
    
    log_success "HashiCorp Vault secrets created successfully"
    log_info "Secret path: $secret_path"
}

# Function to display usage
usage() {
    echo "Usage: $0 [OPTIONS] COMMAND"
    echo ""
    echo "Commands:"
    echo "  env-file    Create environment file from template"
    echo "  k8s         Create Kubernetes secrets"
    echo "  aws         Setup AWS Secrets Manager"
    echo "  vault       Setup HashiCorp Vault secrets"
    echo "  all         Setup all secret management options"
    echo ""
    echo "Options:"
    echo "  -h, --help     Show this help message"
    echo "  -e, --env      Environment (production, staging, development)"
    echo ""
    echo "Examples:"
    echo "  $0 env-file -e production"
    echo "  $0 k8s"
    echo "  $0 aws"
    echo "  $0 vault"
    echo "  $0 all -e production"
}

# Parse command line arguments
ENVIRONMENT="production"
COMMAND=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            usage
            exit 0
            ;;
        -e|--env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        env-file|k8s|aws|vault|all)
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

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(production|staging|development)$ ]]; then
    log_error "Invalid environment: $ENVIRONMENT. Must be production, staging, or development."
    exit 1
fi

# Execute command
case "$COMMAND" in
    env-file)
        create_env_file "$ENV_DIR/production.env" "$ENV_DIR/$ENVIRONMENT.env" "$ENVIRONMENT"
        ;;
    k8s)
        create_kubernetes_secrets
        ;;
    aws)
        setup_aws_secrets
        ;;
    vault)
        setup_vault_secrets
        ;;
    all)
        create_env_file "$ENV_DIR/production.env" "$ENV_DIR/$ENVIRONMENT.env" "$ENVIRONMENT"
        log_info "Environment file created. Setting up external secret management..."
        
        if command_exists kubectl; then
            create_kubernetes_secrets
        else
            log_warning "kubectl not found, skipping Kubernetes secrets setup"
        fi
        
        if command_exists aws; then
            setup_aws_secrets
        else
            log_warning "AWS CLI not found, skipping AWS Secrets Manager setup"
        fi
        
        if command_exists vault; then
            setup_vault_secrets
        else
            log_warning "Vault CLI not found, skipping HashiCorp Vault setup"
        fi
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

log_success "Secret setup completed!"
log_warning "Remember to:"
log_warning "1. Review and customize the generated configuration"
log_warning "2. Never commit secret files to version control"
log_warning "3. Use proper secret rotation policies"
log_warning "4. Monitor access to secrets"