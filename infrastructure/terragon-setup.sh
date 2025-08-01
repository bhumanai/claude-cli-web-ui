#!/bin/bash

# Terragon API Integration Setup Script
# Configures Terragon worker deployment platform integration for Claude CLI Web UI

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-production}
TERRAGON_BASE_URL=${TERRAGON_BASE_URL:-"https://api.terragon.ai"}
CALLBACK_BASE_URL=${2:-"https://claude-cli.vercel.app"}

# Logging functions
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
    
    # Check required environment variables
    if [[ -z "$TERRAGON_API_KEY" ]]; then
        error "TERRAGON_API_KEY environment variable is required"
        echo "Get your API key from: https://console.terragon.ai/api-keys"
        exit 1
    fi
    
    # Check required tools
    local tools=("curl" "jq")
    for tool in "${tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            error "$tool is not installed. Please install it first."
            exit 1
        fi
    done
    
    success "Prerequisites check passed"
}

# Test Terragon API connection
test_api_connection() {
    log "Testing Terragon API connection..."
    
    local response
    response=$(curl -s -X GET "$TERRAGON_BASE_URL/v1/health" \
        -H "Authorization: Bearer $TERRAGON_API_KEY" \
        -H "Content-Type: application/json" \
        -w "%{http_code}")
    
    local http_code="${response: -3}"
    local body="${response%???}"
    
    if [[ "$http_code" == "200" ]]; then
        success "Terragon API connection successful"
        log "API Status: $(echo "$body" | jq -r '.status // "healthy"')"
    else
        error "Terragon API connection failed (HTTP $http_code)"
        error "Response: $body"
        exit 1
    fi
}

# Get account information
get_account_info() {
    log "Fetching Terragon account information..."
    
    local response
    response=$(curl -s -X GET "$TERRAGON_BASE_URL/v1/account" \
        -H "Authorization: Bearer $TERRAGON_API_KEY" \
        -H "Content-Type: application/json")
    
    if echo "$response" | jq -e '.error' > /dev/null; then
        local error_msg=$(echo "$response" | jq -r '.error')
        error "Failed to fetch account info: $error_msg"
        exit 1
    fi
    
    local account_id=$(echo "$response" | jq -r '.account_id')
    local plan=$(echo "$response" | jq -r '.plan')
    local worker_limit=$(echo "$response" | jq -r '.limits.max_workers')
    local current_workers=$(echo "$response" | jq -r '.usage.active_workers')
    
    log "Account ID: $account_id"
    log "Plan: $plan"
    log "Worker Limit: $worker_limit"
    log "Active Workers: $current_workers"
    
    # Save account info
    cat > "terragon-account-${ENVIRONMENT}.json" << EOF
{
    "account_id": "$account_id",
    "plan": "$plan",
    "limits": {
        "max_workers": $worker_limit,
        "active_workers": $current_workers
    },
    "environment": "$ENVIRONMENT",
    "base_url": "$TERRAGON_BASE_URL",
    "callback_url": "$CALLBACK_BASE_URL/api/workers/callback",
    "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
    
    success "Account information saved to terragon-account-${ENVIRONMENT}.json"
}

# Create worker template
create_worker_template() {
    log "Creating Terragon worker template..."
    
    local template_payload=$(cat <<EOF
{
    "name": "claude-cli-worker-${ENVIRONMENT}",
    "description": "Claude CLI command execution worker for ${ENVIRONMENT} environment",
    "runtime": "nodejs18",
    "memory": 1024,
    "timeout": 300,
    "environment_variables": {
        "NODE_ENV": "$ENVIRONMENT",
        "CLAUDE_CLI_ENVIRONMENT": "$ENVIRONMENT",
        "CALLBACK_URL": "$CALLBACK_BASE_URL/api/workers/callback",
        "MAX_EXECUTION_TIME": "300",
        "ENABLE_LOGGING": "true"
    },
    "scaling": {
        "min_instances": $([ "$ENVIRONMENT" == "production" ] && echo "1" || echo "0"),
        "max_instances": $([ "$ENVIRONMENT" == "production" ] && echo "5" || echo "2"),
        "auto_scale": true,
        "scale_threshold": 80
    },
    "networking": {
        "allow_outbound": true,
        "allow_inbound": false,
        "vpc_access": false
    },
    "monitoring": {
        "enable_metrics": true,
        "enable_logs": true,
        "log_level": "info",
        "health_check_path": "/health"
    },
    "retry_policy": {
        "max_retries": 3,
        "retry_delay": 5000,
        "backoff_multiplier": 2
    }
}
EOF
)
    
    local response
    response=$(curl -s -X POST "$TERRAGON_BASE_URL/v1/workers/templates" \
        -H "Authorization: Bearer $TERRAGON_API_KEY" \
        -H "Content-Type: application/json" \
        -d "$template_payload")
    
    if echo "$response" | jq -e '.error' > /dev/null; then
        local error_msg=$(echo "$response" | jq -r '.error')
        if [[ "$error_msg" == *"already exists"* ]]; then
            warning "Worker template already exists, updating..."
            update_worker_template
        else
            error "Failed to create worker template: $error_msg"
            exit 1
        fi
    else
        local template_id=$(echo "$response" | jq -r '.template_id')
        success "Worker template created: $template_id"
        
        # Save template info
        echo "$response" > "terragon-template-${ENVIRONMENT}.json"
    fi
}

# Update existing worker template
update_worker_template() {
    log "Updating existing worker template..."
    
    # Get existing template ID
    local templates_response
    templates_response=$(curl -s -X GET "$TERRAGON_BASE_URL/v1/workers/templates" \
        -H "Authorization: Bearer $TERRAGON_API_KEY")
    
    local template_id
    template_id=$(echo "$templates_response" | jq -r ".templates[] | select(.name == \"claude-cli-worker-${ENVIRONMENT}\") | .template_id")
    
    if [[ -z "$template_id" ]]; then
        error "Could not find existing template to update"
        exit 1
    fi
    
    local update_payload=$(cat <<EOF
{
    "description": "Claude CLI command execution worker for ${ENVIRONMENT} environment (updated)",
    "memory": 1024,
    "timeout": 300,
    "environment_variables": {
        "NODE_ENV": "$ENVIRONMENT",
        "CLAUDE_CLI_ENVIRONMENT": "$ENVIRONMENT",
        "CALLBACK_URL": "$CALLBACK_BASE_URL/api/workers/callback",
        "MAX_EXECUTION_TIME": "300",
        "ENABLE_LOGGING": "true",
        "UPDATED_AT": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    }
}
EOF
)
    
    local response
    response=$(curl -s -X PUT "$TERRAGON_BASE_URL/v1/workers/templates/$template_id" \
        -H "Authorization: Bearer $TERRAGON_API_KEY" \
        -H "Content-Type: application/json" \
        -d "$update_payload")
    
    if echo "$response" | jq -e '.error' > /dev/null; then
        local error_msg=$(echo "$response" | jq -r '.error')
        error "Failed to update worker template: $error_msg"
        exit 1
    else
        success "Worker template updated: $template_id"
        echo "$response" > "terragon-template-${ENVIRONMENT}.json"
    fi
}

# Setup webhooks
setup_webhooks() {
    log "Setting up Terragon webhooks..."
    
    local webhook_payload=$(cat <<EOF
{
    "name": "claude-cli-webhook-${ENVIRONMENT}",
    "url": "$CALLBACK_BASE_URL/api/workers/callback",
    "events": [
        "worker.started",
        "worker.completed",
        "worker.failed",
        "worker.timeout",
        "worker.crashed"
    ],
    "secret": "$(openssl rand -hex 32)",
    "retry_policy": {
        "max_retries": 3,
        "retry_delay": 1000
    },
    "timeout": 30000
}
EOF
)
    
    local response
    response=$(curl -s -X POST "$TERRAGON_BASE_URL/v1/webhooks" \
        -H "Authorization: Bearer $TERRAGON_API_KEY" \
        -H "Content-Type: application/json" \
        -d "$webhook_payload")
    
    if echo "$response" | jq -e '.error' > /dev/null; then
        local error_msg=$(echo "$response" | jq -r '.error')
        if [[ "$error_msg" == *"already exists"* ]]; then
            warning "Webhook already exists"
        else
            error "Failed to create webhook: $error_msg"
            exit 1
        fi
    else
        local webhook_id=$(echo "$response" | jq -r '.webhook_id')
        local webhook_secret=$(echo "$response" | jq -r '.secret')
        success "Webhook created: $webhook_id"
        
        # Save webhook info
        cat > "terragon-webhook-${ENVIRONMENT}.json" << EOF
{
    "webhook_id": "$webhook_id",
    "webhook_secret": "$webhook_secret",
    "callback_url": "$CALLBACK_BASE_URL/api/workers/callback",
    "events": ["worker.started", "worker.completed", "worker.failed", "worker.timeout", "worker.crashed"],
    "environment": "$ENVIRONMENT",
    "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
        
        log "Webhook configuration saved to terragon-webhook-${ENVIRONMENT}.json"
    fi
}

# Create sample worker deployment
create_sample_deployment() {
    log "Creating sample worker deployment for testing..."
    
    # Read template ID from saved file
    local template_file="terragon-template-${ENVIRONMENT}.json"
    if [[ ! -f "$template_file" ]]; then
        error "Template file not found: $template_file"
        exit 1
    fi
    
    local template_id=$(jq -r '.template_id' "$template_file")
    
    local deployment_payload=$(cat <<EOF
{
    "template_id": "$template_id",
    "name": "claude-cli-test-worker",
    "description": "Test deployment for Claude CLI integration",
    "code_source": {
        "type": "inline",
        "content": "$(base64 -w 0 << 'WORKER_CODE'
// Claude CLI Test Worker
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        environment: process.env.CLAUDE_CLI_ENVIRONMENT,
        timestamp: new Date().toISOString()
    });
});

app.post('/execute', async (req, res) => {
    const { command, args, callback_url } = req.body;
    
    try {
        // Simulate command execution
        const result = {
            command,
            args,
            output: `Executed: ${command} with args: ${JSON.stringify(args)}`,
            status: 'success',
            execution_time: Math.floor(Math.random() * 1000) + 100,
            timestamp: new Date().toISOString()
        };
        
        // Send callback if provided
        if (callback_url) {
            const callbackResponse = await fetch(callback_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(result)
            });
            
            if (!callbackResponse.ok) {
                console.error('Callback failed:', callbackResponse.status);
            }
        }
        
        res.json(result);
    } catch (error) {
        res.status(500).json({ 
            error: error.message,
            status: 'failed',
            timestamp: new Date().toISOString()
        });
    }
});

app.listen(port, () => {
    console.log(`Claude CLI worker listening on port ${port}`);
});
WORKER_CODE
)"
    },
    "auto_start": false
}
EOF
)
    
    local response
    response=$(curl -s -X POST "$TERRAGON_BASE_URL/v1/workers/deployments" \
        -H "Authorization: Bearer $TERRAGON_API_KEY" \
        -H "Content-Type: application/json" \
        -d "$deployment_payload")
    
    if echo "$response" | jq -e '.error' > /dev/null; then
        local error_msg=$(echo "$response" | jq -r '.error')
        warning "Could not create sample deployment: $error_msg"
    else
        local deployment_id=$(echo "$response" | jq -r '.deployment_id')
        success "Sample deployment created: $deployment_id"
        
        # Save deployment info
        echo "$response" > "terragon-deployment-${ENVIRONMENT}.json"
    fi
}

# Test worker deployment
test_worker_deployment() {
    log "Testing worker deployment..."
    
    local deployment_file="terragon-deployment-${ENVIRONMENT}.json"
    if [[ ! -f "$deployment_file" ]]; then
        warning "No deployment file found, skipping test"
        return
    fi
    
    local deployment_id=$(jq -r '.deployment_id' "$deployment_file")
    
    # Start the worker
    log "Starting test worker..."
    local start_response
    start_response=$(curl -s -X POST "$TERRAGON_BASE_URL/v1/workers/deployments/$deployment_id/start" \
        -H "Authorization: Bearer $TERRAGON_API_KEY")
    
    if echo "$start_response" | jq -e '.error' > /dev/null; then
        local error_msg=$(echo "$start_response" | jq -r '.error')
        error "Failed to start worker: $error_msg"
        return
    fi
    
    log "Worker started, waiting for it to be ready..."
    sleep 30
    
    # Get worker status
    local status_response
    status_response=$(curl -s -X GET "$TERRAGON_BASE_URL/v1/workers/deployments/$deployment_id/status" \
        -H "Authorization: Bearer $TERRAGON_API_KEY")
    
    local worker_status=$(echo "$status_response" | jq -r '.status')
    local worker_url=$(echo "$status_response" | jq -r '.url')
    
    if [[ "$worker_status" == "running" ]] && [[ "$worker_url" != "null" ]]; then
        log "Testing worker health endpoint..."
        
        local health_response
        health_response=$(curl -s -X GET "$worker_url/health" || echo '{"error": "connection_failed"}')
        
        if echo "$health_response" | jq -e '.status == "healthy"' > /dev/null; then
            success "Worker health check passed"
            
            # Test execution endpoint
            log "Testing worker execution endpoint..."
            local exec_response
            exec_response=$(curl -s -X POST "$worker_url/execute" \
                -H "Content-Type: application/json" \
                -d "{\"command\": \"test\", \"args\": [\"hello\", \"world\"], \"callback_url\": \"$CALLBACK_BASE_URL/api/workers/callback\"}")
            
            if echo "$exec_response" | jq -e '.status == "success"' > /dev/null; then
                success "Worker execution test passed"
            else
                warning "Worker execution test failed: $exec_response"
            fi
        else
            warning "Worker health check failed: $health_response"
        fi
        
        # Stop the test worker
        log "Stopping test worker..."
        curl -s -X POST "$TERRAGON_BASE_URL/v1/workers/deployments/$deployment_id/stop" \
            -H "Authorization: Bearer $TERRAGON_API_KEY" > /dev/null
    else
        warning "Worker not ready for testing (status: $worker_status)"
    fi
}

# Generate integration configuration
generate_integration_config() {
    log "Generating Terragon integration configuration..."
    
    local account_file="terragon-account-${ENVIRONMENT}.json"
    local template_file="terragon-template-${ENVIRONMENT}.json"
    local webhook_file="terragon-webhook-${ENVIRONMENT}.json"
    
    local config=$(cat <<EOF
{
    "terragon": {
        "base_url": "$TERRAGON_BASE_URL",
        "environment": "$ENVIRONMENT",
        "callback_base_url": "$CALLBACK_BASE_URL",
        "account": $(cat "$account_file" 2>/dev/null || echo '{}'),
        "template": $(cat "$template_file" 2>/dev/null || echo '{}'),
        "webhook": $(cat "$webhook_file" 2>/dev/null || echo '{}'),
        "endpoints": {
            "health": "$TERRAGON_BASE_URL/v1/health",
            "workers": "$TERRAGON_BASE_URL/v1/workers",
            "deployments": "$TERRAGON_BASE_URL/v1/workers/deployments",
            "templates": "$TERRAGON_BASE_URL/v1/workers/templates",
            "webhooks": "$TERRAGON_BASE_URL/v1/webhooks"
        },
        "configuration": {
            "max_workers": $([ "$ENVIRONMENT" == "production" ] && echo "5" || echo "2"),
            "default_timeout": 300,
            "retry_attempts": 3,
            "callback_timeout": 30000,
            "auto_scale": true,
            "enable_monitoring": true
        }
    },
    "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)
    
    echo "$config" | jq '.' > "terragon-integration-${ENVIRONMENT}.json"
    
    success "Integration configuration saved to terragon-integration-${ENVIRONMENT}.json"
    
    # Output environment variables
    echo ""
    echo "📋 Environment Variables for Vercel:"
    echo "===================================="
    echo "TERRAGON_API_KEY=$TERRAGON_API_KEY"
    echo "TERRAGON_BASE_URL=$TERRAGON_BASE_URL"
    echo "TERRAGON_CALLBACK_URL=$CALLBACK_BASE_URL/api/workers/callback"
    
    if [[ -f "$webhook_file" ]]; then
        local webhook_secret=$(jq -r '.webhook_secret' "$webhook_file")
        echo "TERRAGON_WEBHOOK_SECRET=$webhook_secret"
    fi
    
    if [[ -f "$template_file" ]]; then
        local template_id=$(jq -r '.template_id' "$template_file")
        echo "TERRAGON_TEMPLATE_ID=$template_id"
    fi
    
    echo "TERRAGON_MAX_WORKERS=$([ "$ENVIRONMENT" == "production" ] && echo "5" || echo "2")"
    echo "TERRAGON_DEFAULT_TIMEOUT=300"
    echo ""
}

# Main execution
main() {
    log "Starting Terragon integration setup for environment: $ENVIRONMENT"
    
    # Create infrastructure directory if it doesn't exist
    mkdir -p "infrastructure"
    cd "infrastructure"
    
    check_prerequisites
    test_api_connection
    get_account_info
    create_worker_template
    setup_webhooks
    create_sample_deployment
    test_worker_deployment
    generate_integration_config
    
    success "Terragon integration setup completed successfully!"
    
    echo ""
    echo "🎉 Setup Summary"
    echo "=================="
    echo "Environment: $ENVIRONMENT"
    echo "Base URL: $TERRAGON_BASE_URL"
    echo "Callback URL: $CALLBACK_BASE_URL/api/workers/callback"
    echo "Configuration: terragon-integration-${ENVIRONMENT}.json"
    echo ""
    echo "Files created:"
    ls -la terragon-*-${ENVIRONMENT}.json 2>/dev/null || echo "No configuration files created"
    echo ""
    echo "Next steps:"
    echo "1. Add the environment variables to your Vercel project"
    echo "2. Deploy your application with Terragon integration"
    echo "3. Test worker execution through the API"
    echo "4. Set up monitoring and alerting"
}

# Error handling
trap 'error "Script failed at line $LINENO. Exit code: $?"' ERR

# Signal handling
trap 'log "Script interrupted. Cleaning up..."; exit 130' INT TERM

# Execute main function
main "$@"