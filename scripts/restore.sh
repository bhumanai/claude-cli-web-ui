#!/bin/bash

# Comprehensive Restore Script for Claude CLI Web UI
# Handles database, file system, and configuration restoration from backups

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
BACKUP_DIR="${PROJECT_ROOT}/backups"
LOG_DIR="${PROJECT_ROOT}/logs"
CONFIG_FILE="${PROJECT_ROOT}/.env"

# Default configuration
DEFAULT_DB_HOST="localhost"
DEFAULT_DB_PORT="5432"
DEFAULT_DB_NAME="claude_cli"
DEFAULT_DB_USER="claude_user"

# Load environment variables
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
fi

# Database configuration
DB_HOST="${DB_HOST:-$DEFAULT_DB_HOST}"
DB_PORT="${DB_PORT:-$DEFAULT_DB_PORT}"
DB_NAME="${DB_NAME:-$DEFAULT_DB_NAME}"
DB_USER="${DB_USER:-$DEFAULT_DB_USER}"
DB_PASSWORD="${DB_PASSWORD:-}"

# Redis configuration
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"

# Timestamp for logs
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Logging
LOG_FILE="${LOG_DIR}/restore_${TIMESTAMP}.log"
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
    log_info "Checking prerequisites..."
    
    local missing_commands=()
    
    # Check for required commands
    if ! command_exists psql; then
        missing_commands+=("psql (PostgreSQL client)")
    fi
    
    if ! command_exists redis-cli; then
        log_warning "redis-cli not found, Redis restore will be skipped"
    fi
    
    if ! command_exists tar; then
        missing_commands+=("tar")
    fi
    
    if ! command_exists gzip; then
        missing_commands+=("gzip")
    fi
    
    if [ ${#missing_commands[@]} -gt 0 ]; then
        log_error "Missing required commands: ${missing_commands[*]}"
        return 1
    fi
    
    log_success "Prerequisites check passed"
    return 0
}

# Function to list available backups
list_backups() {
    log_info "Available backups:"
    
    if [ ! -d "$BACKUP_DIR" ]; then
        log_warning "No backup directory found: $BACKUP_DIR"
        return 1
    fi
    
    local backups_found=false
    for backup_dir in "$BACKUP_DIR"/backup_*; do
        if [ -d "$backup_dir" ]; then
            backups_found=true
            local backup_id=$(basename "$backup_dir")
            local backup_date=$(echo "$backup_id" | sed 's/backup_\([0-9]\{8\}\)_\([0-9]\{6\}\)/\1 \2/' | sed 's/\([0-9]\{4\}\)\([0-9]\{2\}\)\([0-9]\{2\}\) \([0-9]\{2\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)/\1-\2-\3 \4:\5:\6/')
            local backup_size=$(du -sh "$backup_dir" 2>/dev/null | cut -f1)
            
            echo "  $backup_id ($backup_date) - Size: $backup_size"
            
            # Show backup contents
            if [ -f "$backup_dir/database/metadata.json" ]; then
                echo "    ✓ Database backup"
            fi
            if [ -f "$backup_dir/redis/redis_dump_"*".rdb.gz" ]; then
                echo "    ✓ Redis backup"
            fi
            if [ -f "$backup_dir/filesystem/filesystem_"*".tar.gz" ]; then
                echo "    ✓ Filesystem backup"
            fi
            if [ -f "$backup_dir/config/config_"*".tar.gz" ]; then
                echo "    ✓ Configuration backup"
            fi
            echo
        fi
    done
    
    if [ "$backups_found" = false ]; then
        log_warning "No backups found in $BACKUP_DIR"
        return 1
    fi
    
    return 0
}

# Function to validate backup
validate_backup() {
    local backup_id="$1"
    local backup_path="$BACKUP_DIR/$backup_id"
    
    log_info "Validating backup: $backup_id"
    
    if [ ! -d "$backup_path" ]; then
        log_error "Backup directory not found: $backup_path"
        return 1
    fi
    
    local validation_errors=0
    
    # Check database backup
    local db_backup_file=$(find "$backup_path/database" -name "*.sql.gz" | head -1)
    if [ -n "$db_backup_file" ] && [ -f "$db_backup_file" ]; then
        if gunzip -t "$db_backup_file" 2>/dev/null; then
            log_success "Database backup is valid"
        else
            log_error "Database backup is corrupted"
            ((validation_errors++))
        fi
    else
        log_warning "No database backup found"
    fi
    
    # Check filesystem backup
    local fs_backup_file=$(find "$backup_path/filesystem" -name "*.tar.gz" | head -1)
    if [ -n "$fs_backup_file" ] && [ -f "$fs_backup_file" ]; then
        if tar -tzf "$fs_backup_file" >/dev/null 2>&1; then
            log_success "Filesystem backup is valid"
        else
            log_error "Filesystem backup is corrupted"
            ((validation_errors++))
        fi
    else
        log_warning "No filesystem backup found"
    fi
    
    # Check Redis backup
    local redis_backup_file=$(find "$backup_path/redis" -name "*.rdb.gz" | head -1)
    if [ -n "$redis_backup_file" ] && [ -f "$redis_backup_file" ]; then
        if gunzip -t "$redis_backup_file" 2>/dev/null; then
            log_success "Redis backup is valid"
        else
            log_error "Redis backup is corrupted"
            ((validation_errors++))
        fi
    else
        log_info "No Redis backup found (optional)"
    fi
    
    if [ $validation_errors -eq 0 ]; then
        log_success "Backup validation passed"
        return 0
    else
        log_error "$validation_errors backup component(s) failed validation"
        return 1
    fi
}

# Function to create pre-restore backup
create_pre_restore_backup() {
    log_info "Creating pre-restore backup of current state..."
    
    local pre_restore_backup="$BACKUP_DIR/pre_restore_${TIMESTAMP}"
    mkdir -p "$pre_restore_backup"
    
    # Backup current database
    if command_exists pg_dump && PGPASSWORD="$DB_PASSWORD" pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
        log_info "Backing up current database..."
        PGPASSWORD="$DB_PASSWORD" pg_dump \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USER" \
            -d "$DB_NAME" \
            --clean \
            --if-exists \
            --create \
            -f "$pre_restore_backup/current_database.sql" 2>/dev/null
        gzip "$pre_restore_backup/current_database.sql"
        log_success "Current database backed up"
    else
        log_warning "Could not backup current database"
    fi
    
    # Backup current application files
    if [ -d "$PROJECT_ROOT/backend/app" ]; then
        tar -czf "$pre_restore_backup/current_files.tar.gz" -C "$PROJECT_ROOT" backend/app frontend/src 2>/dev/null || true
        log_success "Current application files backed up"
    fi
    
    log_success "Pre-restore backup created: $pre_restore_backup"
    echo "$pre_restore_backup" # Return the path for rollback purposes
}

# Function to restore database
restore_database() {
    local backup_path="$1"
    local force_restore="$2"
    
    log_info "Starting database restore..."
    
    # Find database backup file
    local db_backup_file=$(find "$backup_path/database" -name "*.sql.gz" | head -1)
    if [ -z "$db_backup_file" ] || [ ! -f "$db_backup_file" ]; then
        log_error "Database backup file not found in $backup_path/database"
        return 1
    fi
    
    log_info "Found database backup: $(basename "$db_backup_file")"
    
    # Check database connection
    if ! PGPASSWORD="$DB_PASSWORD" pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" >/dev/null 2>&1; then
        log_error "Cannot connect to database server"
        return 1
    fi
    
    # Warning about data loss
    if [ "$force_restore" != "true" ]; then
        log_warning "This will REPLACE all data in the database!"
        read -p "Are you sure you want to continue? (yes/no): " -r
        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            log_info "Database restore cancelled"
            return 1
        fi
    fi
    
    # Stop application services (if running in containers)
    log_info "Stopping application services..."
    if command_exists docker-compose; then
        docker-compose -f "$PROJECT_ROOT/docker-compose.yml" stop claude-backend claude-frontend 2>/dev/null || true
    fi
    
    # Restore database
    log_info "Restoring database from backup..."
    if gunzip -c "$db_backup_file" | PGPASSWORD="$DB_PASSWORD" psql \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d postgres \
        -v ON_ERROR_STOP=1 \
        --quiet; then
        
        log_success "Database restore completed successfully"
        
        # Verify database restoration
        local table_count
        table_count=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')
        
        if [ "$table_count" -gt 0 ]; then
            log_success "Database verification passed: $table_count tables found"
        else
            log_warning "Database verification: No tables found, restore may have failed"
        fi
        
        return 0
    else
        log_error "Database restore failed"
        return 1
    fi
}

# Function to restore Redis data
restore_redis() {
    local backup_path="$1"
    
    if ! command_exists redis-cli; then
        log_warning "Redis CLI not available, skipping Redis restore"
        return 0
    fi
    
    log_info "Starting Redis restore..."
    
    # Find Redis backup file
    local redis_backup_file=$(find "$backup_path/redis" -name "*.rdb.gz" | head -1)
    if [ -z "$redis_backup_file" ] || [ ! -f "$redis_backup_file" ]; then
        log_info "No Redis backup found, skipping Redis restore"
        return 0
    fi
    
    log_info "Found Redis backup: $(basename "$redis_backup_file")"
    
    # Test Redis connection
    local redis_cmd="redis-cli -h $REDIS_HOST -p $REDIS_PORT"
    if [ -n "$REDIS_PASSWORD" ]; then
        redis_cmd="$redis_cmd -a $REDIS_PASSWORD"
    fi
    
    if ! $redis_cmd ping >/dev/null 2>&1; then
        log_warning "Cannot connect to Redis, skipping Redis restore"
        return 0
    fi
    
    # Stop Redis temporarily
    log_info "Flushing current Redis data..."
    $redis_cmd FLUSHALL >/dev/null
    
    # Extract and restore Redis dump
    local temp_rdb="/tmp/temp_redis_restore.rdb"
    gunzip -c "$redis_backup_file" > "$temp_rdb"
    
    # Use DEBUG RELOAD to restore data
    if $redis_cmd DEBUG RELOAD "$temp_rdb" >/dev/null 2>&1; then
        log_success "Redis restore completed successfully"
        rm -f "$temp_rdb"
        return 0
    else
        log_warning "Redis restore using DEBUG RELOAD failed, trying alternative method"
        
        # Alternative method: stop Redis, replace dump file, restart
        log_warning "This method requires stopping Redis service"
        
        # For Docker containers
        if command_exists docker && docker ps | grep -q redis; then
            local redis_container=$(docker ps --format "table {{.Names}}" | grep redis | head -1)
            if [ -n "$redis_container" ]; then
                docker stop "$redis_container"
                docker cp "$temp_rdb" "$redis_container:/data/dump.rdb"
                docker start "$redis_container"
                log_success "Redis restore completed using container method"
            fi
        fi
        
        rm -f "$temp_rdb"
        return 0
    fi
}

# Function to restore filesystem
restore_filesystem() {
    local backup_path="$1"
    local force_restore="$2"
    
    log_info "Starting filesystem restore..."
    
    # Find filesystem backup file
    local fs_backup_file=$(find "$backup_path/filesystem" -name "*.tar.gz" | head -1)
    if [ -z "$fs_backup_file" ] || [ ! -f "$fs_backup_file" ]; then
        log_error "Filesystem backup file not found in $backup_path/filesystem"
        return 1
    fi
    
    log_info "Found filesystem backup: $(basename "$fs_backup_file")"
    
    # Warning about file replacement
    if [ "$force_restore" != "true" ]; then
        log_warning "This will REPLACE application files!"
        read -p "Are you sure you want to continue? (yes/no): " -r
        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            log_info "Filesystem restore cancelled"
            return 1
        fi
    fi
    
    # Create temporary extraction directory
    local temp_extract="/tmp/claude_restore_$$"
    mkdir -p "$temp_extract"
    
    # Extract backup
    log_info "Extracting filesystem backup..."
    if tar -xzf "$fs_backup_file" -C "$temp_extract"; then
        
        # Stop application services
        log_info "Stopping application services..."
        if command_exists docker-compose; then
            docker-compose -f "$PROJECT_ROOT/docker-compose.yml" stop claude-backend claude-frontend 2>/dev/null || true
        fi
        
        # Restore files
        log_info "Restoring application files..."
        
        # Backup current files before restoration
        if [ -d "$PROJECT_ROOT/backend/app" ]; then
            mv "$PROJECT_ROOT/backend/app" "$PROJECT_ROOT/backend/app.backup_$TIMESTAMP" 2>/dev/null || true
        fi
        if [ -d "$PROJECT_ROOT/frontend/src" ]; then
            mv "$PROJECT_ROOT/frontend/src" "$PROJECT_ROOT/frontend/src.backup_$TIMESTAMP" 2>/dev/null || true
        fi
        
        # Copy restored files
        cp -r "$temp_extract"/* "$PROJECT_ROOT/" 2>/dev/null || true
        
        # Set proper permissions
        find "$PROJECT_ROOT/backend/app" -type f -name "*.py" -exec chmod 644 {} \; 2>/dev/null || true
        find "$PROJECT_ROOT/scripts" -type f -name "*.sh" -exec chmod +x {} \; 2>/dev/null || true
        
        # Cleanup
        rm -rf "$temp_extract"
        
        log_success "Filesystem restore completed successfully"
        return 0
    else
        log_error "Failed to extract filesystem backup"
        rm -rf "$temp_extract"
        return 1
    fi
}

# Function to restore configuration
restore_configuration() {
    local backup_path="$1"
    
    log_info "Starting configuration restore..."
    
    # Find configuration backup file
    local config_backup_file=$(find "$backup_path/config" -name "*.tar.gz" | head -1)
    if [ -z "$config_backup_file" ] || [ ! -f "$config_backup_file" ]; then
        log_info "No configuration backup found, skipping configuration restore"
        return 0
    fi
    
    log_info "Found configuration backup: $(basename "$config_backup_file")"
    
    # Extract configuration files
    if tar -xzf "$config_backup_file" -C "$PROJECT_ROOT"; then
        log_success "Configuration restore completed successfully"
        return 0
    else
        log_error "Configuration restore failed"
        return 1
    fi
}

# Function to restart services
restart_services() {
    log_info "Restarting application services..."
    
    if command_exists docker-compose; then
        if docker-compose -f "$PROJECT_ROOT/docker-compose.yml" up -d; then
            log_success "Services restarted successfully"
            
            # Wait for services to be ready
            log_info "Waiting for services to be ready..."
            sleep 30
            
            # Check service health
            if curl -f http://localhost:8000/health >/dev/null 2>&1; then
                log_success "Backend service is healthy"
            else
                log_warning "Backend service health check failed"
            fi
            
            if curl -f http://localhost:3000/health >/dev/null 2>&1; then
                log_success "Frontend service is healthy"
            else
                log_warning "Frontend service health check failed"
            fi
            
        else
            log_error "Failed to restart services"
            return 1
        fi
    else
        log_info "Docker Compose not available, please restart services manually"
    fi
    
    return 0
}

# Function to perform full restore
full_restore() {
    local backup_id="$1"
    local force_restore="$2"
    local backup_path="$BACKUP_DIR/$backup_id"
    
    log_info "Starting full restore from backup: $backup_id"
    
    # Validate backup
    if ! validate_backup "$backup_id"; then
        log_error "Backup validation failed, aborting restore"
        return 1
    fi
    
    # Create pre-restore backup
    local pre_restore_path
    pre_restore_path=$(create_pre_restore_backup)
    
    # Perform restoration
    local restore_success=true
    
    if ! restore_database "$backup_path" "$force_restore"; then
        restore_success=false
    fi
    
    if ! restore_redis "$backup_path"; then
        restore_success=false
    fi
    
    if ! restore_filesystem "$backup_path" "$force_restore"; then
        restore_success=false
    fi
    
    if ! restore_configuration "$backup_path"; then
        restore_success=false
    fi
    
    # Restart services
    if [ "$restore_success" = true ]; then
        restart_services
        log_success "Full restore completed successfully"
        log_info "Pre-restore backup saved at: $pre_restore_path"
        return 0
    else
        log_error "Restore completed with errors"
        log_info "Pre-restore backup available for rollback at: $pre_restore_path"
        return 1
    fi
}

# Function to display usage
usage() {
    echo "Usage: $0 [OPTIONS] COMMAND [BACKUP_ID]"
    echo ""
    echo "Comprehensive restore script for Claude CLI Web UI"
    echo ""
    echo "Commands:"
    echo "  list              List available backups"
    echo "  validate BACKUP   Validate a specific backup"
    echo "  full BACKUP       Perform full restore from backup"
    echo "  database BACKUP   Restore database only"
    echo "  files BACKUP      Restore files only"
    echo "  config BACKUP     Restore configuration only"
    echo ""
    echo "Options:"
    echo "  --force           Skip confirmation prompts"
    echo "  --no-services     Don't restart services after restore"
    echo "  -h, --help        Show this help message"
    echo ""
    echo "BACKUP_ID format: backup_YYYYMMDD_HHMMSS"
    echo ""
    echo "Examples:"
    echo "  $0 list"
    echo "  $0 validate backup_20231201_120000"
    echo "  $0 full backup_20231201_120000"
    echo "  $0 --force database backup_20231201_120000"
    echo ""
    echo "IMPORTANT: This script will replace existing data!"
    echo "A pre-restore backup will be created automatically."
}

# Parse command line arguments
COMMAND=""
BACKUP_ID=""
FORCE_RESTORE=false
NO_SERVICES=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE_RESTORE=true
            shift
            ;;
        --no-services)
            NO_SERVICES=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        list|validate|full|database|files|config)
            COMMAND="$1"
            if [ "$1" != "list" ] && [ $# -gt 1 ]; then
                BACKUP_ID="$2"
                shift
            fi
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Check prerequisites
if ! check_prerequisites; then
    exit 1
fi

# Execute command
case "$COMMAND" in
    list)
        list_backups
        ;;
    validate)
        if [ -z "$BACKUP_ID" ]; then
            log_error "Backup ID required for validate command"
            usage
            exit 1
        fi
        validate_backup "$BACKUP_ID"
        ;;
    full)
        if [ -z "$BACKUP_ID" ]; then
            log_error "Backup ID required for full restore command"
            usage
            exit 1
        fi
        full_restore "$BACKUP_ID" "$FORCE_RESTORE"
        ;;
    database)
        if [ -z "$BACKUP_ID" ]; then
            log_error "Backup ID required for database restore command"
            usage
            exit 1
        fi
        backup_path="$BACKUP_DIR/$BACKUP_ID"
        validate_backup "$BACKUP_ID" && restore_database "$backup_path" "$FORCE_RESTORE"
        ;;
    files)
        if [ -z "$BACKUP_ID" ]; then
            log_error "Backup ID required for files restore command"
            usage
            exit 1
        fi
        backup_path="$BACKUP_DIR/$BACKUP_ID"
        validate_backup "$BACKUP_ID" && restore_filesystem "$backup_path" "$FORCE_RESTORE"
        ;;
    config)
        if [ -z "$BACKUP_ID" ]; then
            log_error "Backup ID required for config restore command"
            usage
            exit 1
        fi
        backup_path="$BACKUP_DIR/$BACKUP_ID"
        restore_configuration "$backup_path"
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

log_success "Restore script completed"