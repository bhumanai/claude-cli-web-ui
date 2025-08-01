#!/bin/bash

# Upstash Redis Setup and Configuration Script
# Creates and configures Upstash Redis instances for Claude CLI Web UI

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-production}
REDIS_NAME="claude-cli-${ENVIRONMENT}"
REGION=${2:-us-east-1}

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
    if [[ -z "$UPSTASH_EMAIL" ]]; then
        error "UPSTASH_EMAIL environment variable is required"
        exit 1
    fi
    
    if [[ -z "$UPSTASH_API_KEY" ]]; then
        error "UPSTASH_API_KEY environment variable is required"
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

# Create Upstash Redis database
create_redis_database() {
    log "Creating Upstash Redis database: $REDIS_NAME"
    
    local create_payload=$(cat <<EOF
{
    "name": "$REDIS_NAME",
    "region": "$REGION",
    "tls": true,
    "multizone": $([ "$ENVIRONMENT" == "production" ] && echo "true" || echo "false"),
    "eviction": "allkeys-lru"
}
EOF
)
    
    local response
    response=$(curl -s -X POST "https://api.upstash.com/v2/redis/database" \
        -H "Authorization: Bearer $UPSTASH_API_KEY" \
        -H "Content-Type: application/json" \
        -d "$create_payload")
    
    if echo "$response" | jq -e '.error' > /dev/null; then
        local error_msg=$(echo "$response" | jq -r '.error')
        error "Failed to create Redis database: $error_msg"
        
        # Check if database already exists
        if [[ "$error_msg" == *"already exists"* ]]; then
            warning "Database already exists, continuing..."
        else
            exit 1
        fi
    else
        success "Redis database created successfully"
    fi
    
    # Extract database information
    local database_id=$(echo "$response" | jq -r '.database_id // empty')
    local endpoint=$(echo "$response" | jq -r '.endpoint // empty')
    local port=$(echo "$response" | jq -r '.port // empty')
    local password=$(echo "$response" | jq -r '.password // empty')
    local rest_token=$(echo "$response" | jq -r '.rest_token // empty')
    
    # If creation failed but DB exists, get existing DB info
    if [[ -z "$database_id" ]]; then
        log "Fetching existing database information..."
        local list_response
        list_response=$(curl -s -X GET "https://api.upstash.com/v2/redis/database" \
            -H "Authorization: Bearer $UPSTASH_API_KEY")
        
        local db_info
        db_info=$(echo "$list_response" | jq ".[] | select(.database_name == \"$REDIS_NAME\")")
        
        if [[ -n "$db_info" ]]; then
            database_id=$(echo "$db_info" | jq -r '.database_id')
            endpoint=$(echo "$db_info" | jq -r '.endpoint')
            port=$(echo "$db_info" | jq -r '.port')
            password=$(echo "$db_info" | jq -r '.password')
            rest_token=$(echo "$db_info" | jq -r '.rest_token')
        else
            error "Could not find or create database: $REDIS_NAME"
            exit 1
        fi
    fi
    
    # Save configuration
    cat > "redis-config-${ENVIRONMENT}.json" << EOF
{
    "database_id": "$database_id",
    "database_name": "$REDIS_NAME",
    "endpoint": "$endpoint",
    "port": $port,
    "password": "$password",
    "rest_token": "$rest_token",
    "rest_url": "https://$endpoint",
    "connection_string": "redis://:$password@$endpoint:$port",
    "environment": "$ENVIRONMENT",
    "region": "$REGION",
    "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
    
    log "Configuration saved to redis-config-${ENVIRONMENT}.json"
    
    # Output environment variables for Vercel
    echo ""
    echo "📋 Environment Variables for Vercel:"
    echo "=================================="
    echo "UPSTASH_REDIS_REST_URL=https://$endpoint"
    echo "UPSTASH_REDIS_REST_TOKEN=$rest_token"
    echo "REDIS_CONNECTION_STRING=redis://:$password@$endpoint:$port"
    echo "REDIS_DATABASE_ID=$database_id"
    echo ""
}

# Test Redis connection
test_redis_connection() {
    log "Testing Redis connection..."
    
    local config_file="redis-config-${ENVIRONMENT}.json"
    
    if [[ ! -f "$config_file" ]]; then
        error "Configuration file not found: $config_file"
        exit 1
    fi
    
    local rest_url=$(jq -r '.rest_url' "$config_file")
    local rest_token=$(jq -r '.rest_token' "$config_file")
    
    # Test basic connectivity
    local ping_response
    ping_response=$(curl -s -X POST "$rest_url/ping" \
        -H "Authorization: Bearer $rest_token" \
        -H "Content-Type: application/json")
    
    if echo "$ping_response" | jq -e '.result == "PONG"' > /dev/null; then
        success "Redis connection test passed"
    else
        error "Redis connection test failed: $ping_response"
        exit 1
    fi
    
    # Test set/get operations
    log "Testing Redis operations..."
    
    # Set a test key
    local set_response
    set_response=$(curl -s -X POST "$rest_url/set/test-key" \
        -H "Authorization: Bearer $rest_token" \
        -H "Content-Type: application/json" \
        -d '{"value": "test-value", "ex": 60}')
    
    if echo "$set_response" | jq -e '.result == "OK"' > /dev/null; then
        log "Redis SET operation successful"
    else
        error "Redis SET operation failed: $set_response"
        exit 1
    fi
    
    # Get the test key
    local get_response
    get_response=$(curl -s -X GET "$rest_url/get/test-key" \
        -H "Authorization: Bearer $rest_token")
    
    if echo "$get_response" | jq -e '.result == "test-value"' > /dev/null; then
        log "Redis GET operation successful"
    else
        error "Redis GET operation failed: $get_response"
        exit 1
    fi
    
    # Clean up test key
    curl -s -X POST "$rest_url/del/test-key" \
        -H "Authorization: Bearer $rest_token" \
        -H "Content-Type: application/json" > /dev/null
    
    success "All Redis operations tests passed"
}

# Configure Redis for queues
configure_queues() {
    log "Configuring Redis for queue operations..."
    
    local config_file="redis-config-${ENVIRONMENT}.json"
    local rest_url=$(jq -r '.rest_url' "$config_file")
    local rest_token=$(jq -r '.rest_token' "$config_file")
    
    # Set up queue namespaces
    local queues=("tasks:pending" "tasks:processing" "tasks:completed" "tasks:failed")
    
    for queue in "${queues[@]}"; do
        log "Initializing queue: $queue"
        
        # Initialize empty list for each queue
        curl -s -X POST "$rest_url/del/$queue" \
            -H "Authorization: Bearer $rest_token" \
            -H "Content-Type: application/json" > /dev/null
        
        curl -s -X POST "$rest_url/lpush/$queue" \
            -H "Authorization: Bearer $rest_token" \
            -H "Content-Type: application/json" \
            -d '{"elements": ["__queue_initialized__"]}' > /dev/null
        
        curl -s -X POST "$rest_url/lpop/$queue" \
            -H "Authorization: Bearer $rest_token" \
            -H "Content-Type: application/json" > /dev/null
    done
    
    # Set up configuration keys
    local config_keys=(
        "queue:config:max_retries:3"
        "queue:config:default_timeout:300"
        "queue:config:batch_size:10"
        "queue:config:max_queue_size:1000"
    )
    
    for config in "${config_keys[@]}"; do
        local key=$(echo "$config" | cut -d':' -f1-3)
        local value=$(echo "$config" | cut -d':' -f4)
        
        curl -s -X POST "$rest_url/set/$key" \
            -H "Authorization: Bearer $rest_token" \
            -H "Content-Type: application/json" \
            -d "{\"value\": \"$value\"}" > /dev/null
    done
    
    # Set up monitoring counters
    local counters=("stats:tasks:total" "stats:tasks:success" "stats:tasks:failed" "stats:queue:length")
    
    for counter in "${counters[@]}"; do
        curl -s -X POST "$rest_url/set/$counter" \
            -H "Authorization: Bearer $rest_token" \
            -H "Content-Type: application/json" \
            -d '{"value": "0"}' > /dev/null
    done
    
    success "Queue configuration completed"
}

# Create backup configuration
setup_backup() {
    if [[ "$ENVIRONMENT" == "production" ]]; then
        log "Setting up backup configuration for production..."
        
        local backup_name="claude-cli-${ENVIRONMENT}-backup"
        
        local backup_payload=$(cat <<EOF
{
    "name": "$backup_name",
    "region": "us-west-1",
    "tls": true,
    "multizone": false,
    "eviction": "noeviction"
}
EOF
)
        
        local backup_response
        backup_response=$(curl -s -X POST "https://api.upstash.com/v2/redis/database" \
            -H "Authorization: Bearer $UPSTASH_API_KEY" \
            -H "Content-Type: application/json" \
            -d "$backup_payload")
        
        if echo "$backup_response" | jq -e '.error' > /dev/null; then
            local error_msg=$(echo "$backup_response" | jq -r '.error')
            if [[ "$error_msg" != *"already exists"* ]]; then
                warning "Could not create backup database: $error_msg"
            else
                log "Backup database already exists"
            fi
        else
            success "Backup database created successfully"
        fi
    fi
}

# Generate monitoring dashboard
generate_monitoring_config() {
    log "Generating monitoring configuration..."
    
    local config_file="redis-config-${ENVIRONMENT}.json"
    local database_id=$(jq -r '.database_id' "$config_file")
    local endpoint=$(jq -r '.endpoint' "$config_file")
    
    cat > "redis-monitoring-${ENVIRONMENT}.json" << EOF
{
    "monitoring": {
        "database_id": "$database_id",
        "endpoint": "$endpoint",
        "metrics": {
            "memory_usage": "memory",
            "cpu_usage": "cpu",
            "connection_count": "connections",
            "commands_per_second": "commands/sec",
            "hit_rate": "keyspace_hits/(keyspace_hits+keyspace_misses)*100"
        },
        "alerts": {
            "memory_usage_threshold": 80,
            "cpu_usage_threshold": 80,
            "connection_threshold": 100,
            "error_rate_threshold": 5
        },
        "health_checks": [
            {
                "name": "ping_check",
                "command": "PING",
                "expected": "PONG",
                "interval": 60
            },
            {
                "name": "queue_check",
                "command": "LLEN tasks:pending",
                "expected": "numeric",
                "interval": 300
            }
        ]
    },
    "backup": {
        "enabled": $([ "$ENVIRONMENT" == "production" ] && echo "true" || echo "false"),
        "schedule": "0 2 * * *",
        "retention_days": 30
    }
}
EOF
    
    success "Monitoring configuration saved to redis-monitoring-${ENVIRONMENT}.json"
}

# Main execution
main() {
    log "Starting Redis setup for environment: $ENVIRONMENT"
    
    check_prerequisites
    create_redis_database
    test_redis_connection
    configure_queues
    setup_backup
    generate_monitoring_config
    
    success "Redis setup completed successfully!"
    
    echo ""
    echo "🎉 Setup Summary"
    echo "================"
    echo "Environment: $ENVIRONMENT"
    echo "Database: $REDIS_NAME"
    echo "Region: $REGION"
    echo "Configuration: redis-config-${ENVIRONMENT}.json"
    echo "Monitoring: redis-monitoring-${ENVIRONMENT}.json"
    echo ""
    echo "Next steps:"
    echo "1. Add the environment variables to your Vercel project"
    echo "2. Test the integration with your application"
    echo "3. Set up monitoring alerts"
    echo "4. Configure backup schedule (if production)"
}

# Error handling
trap 'error "Script failed at line $LINENO. Exit code: $?"' ERR

# Signal handling
trap 'log "Script interrupted. Cleaning up..."; exit 130' INT TERM

# Execute main function
main "$@"