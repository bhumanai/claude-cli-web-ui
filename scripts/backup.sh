#!/bin/bash

# Comprehensive Backup Script for Claude CLI Web UI
# Handles database, file system, and configuration backups with AWS S3 integration

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
DEFAULT_RETENTION_DAYS=30
DEFAULT_S3_BUCKET="claude-cli-backups"
DEFAULT_DB_HOST="localhost"
DEFAULT_DB_PORT="5432"
DEFAULT_DB_NAME="claude_cli"
DEFAULT_DB_USER="claude_user"

# Load environment variables
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
fi

# Backup configuration
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-$DEFAULT_RETENTION_DAYS}"
S3_BUCKET="${BACKUP_S3_BUCKET:-$DEFAULT_S3_BUCKET}"
DB_HOST="${DB_HOST:-$DEFAULT_DB_HOST}"
DB_PORT="${DB_PORT:-$DEFAULT_DB_PORT}"
DB_NAME="${DB_NAME:-$DEFAULT_DB_NAME}"
DB_USER="${DB_USER:-$DEFAULT_DB_USER}"
DB_PASSWORD="${DB_PASSWORD:-}"

# Redis configuration
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"

# Timestamp for backup files
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DATE=$(date +"%Y-%m-%d")

# Logging
LOG_FILE="${LOG_DIR}/backup_${TIMESTAMP}.log"
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
    if ! command_exists pg_dump; then
        missing_commands+=("pg_dump (PostgreSQL client)")
    fi
    
    if ! command_exists redis-cli; then
        log_warning "redis-cli not found, Redis backup will be skipped"
    fi
    
    if ! command_exists aws; then
        log_warning "AWS CLI not found, S3 upload will be skipped"
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

# Function to create backup directory structure
create_backup_structure() {
    local backup_path="$1"
    
    log_info "Creating backup directory structure: $backup_path"
    
    mkdir -p "$backup_path"/{database,redis,filesystem,config,logs}
    
    log_success "Backup directory structure created"
}

# Function to backup PostgreSQL database
backup_database() {
    local backup_path="$1"
    local db_backup_file="$backup_path/database/claude_cli_${TIMESTAMP}.sql"
    
    log_info "Starting database backup..."
    
    # Check database connection
    if ! PGPASSWORD="$DB_PASSWORD" pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
        log_error "Cannot connect to database"
        return 1
    fi
    
    # Create database backup
    log_info "Creating database dump..."
    if PGPASSWORD="$DB_PASSWORD" pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --clean \
        --if-exists \
        --create \
        --verbose \
        --no-password \
        -f "$db_backup_file" 2>/dev/null; then
        
        # Compress the backup
        gzip "$db_backup_file"
        local compressed_file="${db_backup_file}.gz"
        
        # Calculate backup size and checksum
        local backup_size=$(du -h "$compressed_file" | cut -f1)
        local backup_checksum=$(sha256sum "$compressed_file" | cut -d' ' -f1)
        
        log_success "Database backup completed: $compressed_file"
        log_info "Backup size: $backup_size"
        log_info "Backup checksum: $backup_checksum"
        
        # Save metadata
        cat > "$backup_path/database/metadata.json" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "database": "$DB_NAME",
  "host": "$DB_HOST",
  "port": $DB_PORT,
  "user": "$DB_USER",
  "backup_file": "$(basename "$compressed_file")",
  "size": "$backup_size",
  "checksum": "$backup_checksum",
  "created_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
        
        return 0
    else
        log_error "Database backup failed"
        return 1
    fi
}

# Function to backup Redis data
backup_redis() {
    local backup_path="$1"
    local redis_backup_file="$backup_path/redis/redis_dump_${TIMESTAMP}.rdb"
    
    if ! command_exists redis-cli; then
        log_warning "Redis CLI not available, skipping Redis backup"
        return 0
    fi
    
    log_info "Starting Redis backup..."
    
    # Test Redis connection
    local redis_cmd="redis-cli -h $REDIS_HOST -p $REDIS_PORT"
    if [ -n "$REDIS_PASSWORD" ]; then
        redis_cmd="$redis_cmd -a $REDIS_PASSWORD"
    fi
    
    if ! $redis_cmd ping >/dev/null 2>&1; then
        log_warning "Cannot connect to Redis, skipping Redis backup"
        return 0
    fi
    
    # Create Redis backup using BGSAVE
    log_info "Triggering Redis background save..."
    $redis_cmd BGSAVE >/dev/null
    
    # Wait for backup to complete
    local save_status
    while true; do
        save_status=$($redis_cmd LASTSAVE)
        sleep 2
        local current_save=$($redis_cmd LASTSAVE)
        if [ "$current_save" -gt "$save_status" ]; then
            break
        fi
        log_info "Waiting for Redis backup to complete..."
    done
    
    # Copy the RDB file
    local redis_data_dir="/var/lib/redis"  # Default Redis data directory
    if [ -f "$redis_data_dir/dump.rdb" ]; then
        cp "$redis_data_dir/dump.rdb" "$redis_backup_file"
        gzip "$redis_backup_file"
        
        local backup_size=$(du -h "${redis_backup_file}.gz" | cut -f1)
        log_success "Redis backup completed: ${redis_backup_file}.gz"
        log_info "Backup size: $backup_size"
    else
        log_warning "Redis dump file not found, creating memory snapshot instead"
        $redis_cmd --rdb "$redis_backup_file" >/dev/null 2>&1
        if [ -f "$redis_backup_file" ]; then
            gzip "$redis_backup_file"
            log_success "Redis memory snapshot created: ${redis_backup_file}.gz"
        else
            log_error "Failed to create Redis backup"
            return 1
        fi
    fi
    
    return 0
}

# Function to backup file system
backup_filesystem() {
    local backup_path="$1"
    local fs_backup_file="$backup_path/filesystem/filesystem_${TIMESTAMP}.tar.gz"
    
    log_info "Starting filesystem backup..."
    
    # Define directories to backup
    local backup_dirs=(
        "$PROJECT_ROOT/backend/app"
        "$PROJECT_ROOT/frontend/src"
        "$PROJECT_ROOT/nginx"
        "$PROJECT_ROOT/k8s"
        "$PROJECT_ROOT/terraform"
        "$PROJECT_ROOT/monitoring"
        "$PROJECT_ROOT/scripts"
    )
    
    # Create exclusion list
    local exclude_file="$backup_path/filesystem/exclude.txt"
    cat > "$exclude_file" <<EOF
*.log
*.tmp
node_modules/
__pycache__/
.git/
.env
*.pyc
.DS_Store
venv/
dist/
build/
coverage/
.pytest_cache/
EOF
    
    # Create tar archive
    log_info "Creating filesystem archive..."
    if tar -czf "$fs_backup_file" \
        --exclude-from="$exclude_file" \
        -C "$PROJECT_ROOT" \
        $(for dir in "${backup_dirs[@]}"; do basename "$dir"; done) 2>/dev/null; then
        
        local backup_size=$(du -h "$fs_backup_file" | cut -f1)
        local backup_checksum=$(sha256sum "$fs_backup_file" | cut -d' ' -f1)
        
        log_success "Filesystem backup completed: $fs_backup_file"
        log_info "Backup size: $backup_size"
        log_info "Backup checksum: $backup_checksum"
        
        # Save metadata
        cat > "$backup_path/filesystem/metadata.json" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "backup_file": "$(basename "$fs_backup_file")",
  "directories": $(printf '%s\n' "${backup_dirs[@]}" | jq -R . | jq -s .),
  "size": "$backup_size",
  "checksum": "$backup_checksum",
  "created_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
        
        return 0
    else
        log_error "Filesystem backup failed"
        return 1
    fi
}

# Function to backup configuration files
backup_configuration() {
    local backup_path="$1"
    local config_backup_file="$backup_path/config/config_${TIMESTAMP}.tar.gz"
    
    log_info "Starting configuration backup..."
    
    # Define config files to backup (excluding sensitive data)
    local config_files=(
        "docker-compose.yml"
        "docker-compose.override.yml"
        ".env.example"
        "Makefile"
        "README.md"
    )
    
    # Create config backup
    local existing_files=()
    for file in "${config_files[@]}"; do
        if [ -f "$PROJECT_ROOT/$file" ]; then
            existing_files+=("$file")
        fi
    done
    
    if [ ${#existing_files[@]} -gt 0 ]; then
        tar -czf "$config_backup_file" -C "$PROJECT_ROOT" "${existing_files[@]}"
        
        local backup_size=$(du -h "$config_backup_file" | cut -f1)
        log_success "Configuration backup completed: $config_backup_file"
        log_info "Backup size: $backup_size"
    else
        log_warning "No configuration files found to backup"
    fi
    
    return 0
}

# Function to backup logs
backup_logs() {
    local backup_path="$1"
    local logs_backup_file="$backup_path/logs/logs_${TIMESTAMP}.tar.gz"
    
    log_info "Starting logs backup..."
    
    if [ -d "$LOG_DIR" ] && [ "$(ls -A "$LOG_DIR" 2>/dev/null)" ]; then
        # Find log files older than 1 day to avoid backing up current logs
        find "$LOG_DIR" -name "*.log" -type f -mtime +1 -print0 | \
            tar -czf "$logs_backup_file" --null -T -
        
        if [ -f "$logs_backup_file" ]; then
            local backup_size=$(du -h "$logs_backup_file" | cut -f1)
            log_success "Logs backup completed: $logs_backup_file"
            log_info "Backup size: $backup_size"
        else
            log_info "No old log files found to backup"
        fi
    else
        log_info "No log directory or files found"
    fi
    
    return 0
}

# Function to upload backup to S3
upload_to_s3() {
    local backup_path="$1"
    local s3_prefix="backups/$BACKUP_DATE"
    
    if ! command_exists aws; then
        log_warning "AWS CLI not available, skipping S3 upload"
        return 0
    fi
    
    log_info "Starting S3 upload to s3://$S3_BUCKET/$s3_prefix/"
    
    # Check AWS credentials
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        log_error "AWS credentials not configured, skipping S3 upload"
        return 1
    fi
    
    # Upload backup directory to S3
    if aws s3 sync "$backup_path" "s3://$S3_BUCKET/$s3_prefix/" \
        --delete \
        --storage-class STANDARD_IA \
        --quiet; then
        
        log_success "Backup uploaded to S3: s3://$S3_BUCKET/$s3_prefix/"
        
        # Create lifecycle policy for old backups (if not exists)
        create_s3_lifecycle_policy
        
        return 0
    else
        log_error "S3 upload failed"
        return 1
    fi
}

# Function to create S3 lifecycle policy
create_s3_lifecycle_policy() {
    local policy_exists
    policy_exists=$(aws s3api get-bucket-lifecycle-configuration --bucket "$S3_BUCKET" 2>/dev/null || echo "null")
    
    if [ "$policy_exists" = "null" ]; then
        log_info "Creating S3 lifecycle policy for old backup cleanup..."
        
        local lifecycle_policy=$(cat <<EOF
{
    "Rules": [
        {
            "ID": "ClaudeCliBackupRetention",
            "Status": "Enabled",
            "Filter": {
                "Prefix": "backups/"
            },
            "Transitions": [
                {
                    "Days": 7,
                    "StorageClass": "GLACIER"
                },
                {
                    "Days": 90,
                    "StorageClass": "DEEP_ARCHIVE"
                }
            ],
            "Expiration": {
                "Days": $((RETENTION_DAYS * 2))
            }
        }
    ]
}
EOF
)
        
        if echo "$lifecycle_policy" | aws s3api put-bucket-lifecycle-configuration \
            --bucket "$S3_BUCKET" \
            --lifecycle-configuration file:///dev/stdin; then
            log_success "S3 lifecycle policy created"
        else
            log_warning "Failed to create S3 lifecycle policy"
        fi
    fi
}

# Function to cleanup old local backups
cleanup_old_backups() {
    log_info "Cleaning up local backups older than $RETENTION_DAYS days..."
    
    if [ -d "$BACKUP_DIR" ]; then
        local deleted_count=0
        while IFS= read -r -d '' backup_dir; do
            if [ -d "$backup_dir" ]; then
                rm -rf "$backup_dir"
                ((deleted_count++))
                log_info "Deleted old backup: $(basename "$backup_dir")"
            fi
        done < <(find "$BACKUP_DIR" -maxdepth 1 -type d -name "backup_*" -mtime "+$RETENTION_DAYS" -print0)
        
        if [ $deleted_count -gt 0 ]; then
            log_success "Cleaned up $deleted_count old backups"
        else
            log_info "No old backups to clean up"
        fi
    fi
}

# Function to verify backup integrity
verify_backup() {
    local backup_path="$1"
    
    log_info "Verifying backup integrity..."
    
    local verification_errors=0
    
    # Verify database backup
    if [ -f "$backup_path/database/claude_cli_${TIMESTAMP}.sql.gz" ]; then
        if gunzip -t "$backup_path/database/claude_cli_${TIMESTAMP}.sql.gz" 2>/dev/null; then
            log_success "Database backup integrity verified"
        else
            log_error "Database backup is corrupted"
            ((verification_errors++))
        fi
    fi
    
    # Verify filesystem backup
    if [ -f "$backup_path/filesystem/filesystem_${TIMESTAMP}.tar.gz" ]; then
        if tar -tzf "$backup_path/filesystem/filesystem_${TIMESTAMP}.tar.gz" >/dev/null 2>&1; then
            log_success "Filesystem backup integrity verified"
        else
            log_error "Filesystem backup is corrupted"
            ((verification_errors++))
        fi
    fi
    
    # Verify Redis backup
    if [ -f "$backup_path/redis/redis_dump_${TIMESTAMP}.rdb.gz" ]; then
        if gunzip -t "$backup_path/redis/redis_dump_${TIMESTAMP}.rdb.gz" 2>/dev/null; then
            log_success "Redis backup integrity verified"
        else
            log_error "Redis backup is corrupted"
            ((verification_errors++))
        fi
    fi
    
    if [ $verification_errors -eq 0 ]; then
        log_success "All backups passed integrity verification"
        return 0
    else
        log_error "$verification_errors backup(s) failed integrity verification"
        return 1
    fi
}

# Function to send backup notification
send_notification() {
    local status="$1"
    local backup_path="$2"
    
    # Calculate total backup size
    local total_size=$(du -sh "$backup_path" 2>/dev/null | cut -f1 || echo "unknown")
    
    # Create summary
    if [ "$status" = "success" ]; then
        local subject="✅ Claude CLI Backup Completed Successfully"
        local message="Backup completed successfully on $(date)
        
Backup Details:
- Backup ID: backup_${TIMESTAMP}
- Total Size: $total_size
- Location: $backup_path
- S3 Location: s3://$S3_BUCKET/backups/$BACKUP_DATE/

Components Backed Up:
- ✅ PostgreSQL Database
- ✅ Redis Data (if available)
- ✅ Application Files
- ✅ Configuration Files
- ✅ Log Files

All backups passed integrity verification."
    else
        local subject="❌ Claude CLI Backup Failed"
        local message="Backup failed on $(date)
        
Please check the backup logs for details: $LOG_FILE

This requires immediate attention."
    fi
    
    # Send email notification (if configured)
    if command_exists mail && [ -n "${BACKUP_EMAIL:-}" ]; then
        echo "$message" | mail -s "$subject" "$BACKUP_EMAIL"
        log_info "Email notification sent"
    fi
    
    # Send Slack notification (if configured)
    if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
        local color="good"
        [ "$status" != "success" ] && color="danger"
        
        curl -X POST -H 'Content-type: application/json' \
            --data "{
                \"attachments\": [{
                    \"color\": \"$color\",
                    \"title\": \"$subject\",
                    \"text\": \"$message\",
                    \"footer\": \"Claude CLI Backup System\",
                    \"ts\": $(date +%s)
                }]
            }" \
            "$SLACK_WEBHOOK_URL" >/dev/null 2>&1
        log_info "Slack notification sent"
    fi
}

# Main backup function
main_backup() {
    local backup_path="$BACKUP_DIR/backup_${TIMESTAMP}"
    
    log_info "Starting Claude CLI backup process"
    log_info "Backup ID: backup_${TIMESTAMP}"
    log_info "Backup path: $backup_path"
    
    # Check prerequisites
    if ! check_prerequisites; then
        return 1
    fi
    
    # Create backup directory structure
    create_backup_structure "$backup_path"
    
    # Perform backups
    local backup_success=true
    
    if ! backup_database "$backup_path"; then
        backup_success=false
    fi
    
    if ! backup_redis "$backup_path"; then
        backup_success=false
    fi
    
    if ! backup_filesystem "$backup_path"; then
        backup_success=false
    fi
    
    if ! backup_configuration "$backup_path"; then
        backup_success=false
    fi
    
    if ! backup_logs "$backup_path"; then
        backup_success=false
    fi
    
    # Verify backup integrity
    if ! verify_backup "$backup_path"; then
        backup_success=false
    fi
    
    # Upload to S3 (if configured)
    if [ "$backup_success" = true ]; then
        upload_to_s3 "$backup_path"
    fi
    
    # Cleanup old backups
    cleanup_old_backups
    
    # Send notification
    if [ "$backup_success" = true ]; then
        log_success "Backup process completed successfully"
        send_notification "success" "$backup_path"
        return 0
    else
        log_error "Backup process completed with errors"
        send_notification "failure" "$backup_path"
        return 1
    fi
}

# Function to display usage
usage() {
    echo "Usage: $0 [OPTIONS] [COMMAND]"
    echo ""
    echo "Comprehensive backup script for Claude CLI Web UI"
    echo ""
    echo "Commands:"
    echo "  full      Perform full backup (default)"
    echo "  db        Backup database only"
    echo "  files     Backup files only"
    echo "  config    Backup configuration only"
    echo "  verify    Verify existing backup"
    echo ""
    echo "Options:"
    echo "  --retention DAYS    Set retention period (default: $DEFAULT_RETENTION_DAYS)"
    echo "  --s3-bucket BUCKET  Set S3 bucket name"
    echo "  --no-s3            Skip S3 upload"
    echo "  --no-notification  Skip notifications"
    echo "  -h, --help         Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  BACKUP_RETENTION_DAYS, BACKUP_S3_BUCKET, DB_PASSWORD, REDIS_PASSWORD"
    echo "  BACKUP_EMAIL, SLACK_WEBHOOK_URL"
    echo ""
    echo "Examples:"
    echo "  $0                              # Full backup"
    echo "  $0 --retention 7 full          # Full backup with 7-day retention"
    echo "  $0 --no-s3 db                  # Database backup without S3 upload"
    echo "  $0 verify backup_20231201_120000 # Verify specific backup"
}

# Parse command line arguments
COMMAND="full"
NO_S3=false
NO_NOTIFICATION=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --retention)
            RETENTION_DAYS="$2"
            shift 2
            ;;
        --s3-bucket)
            S3_BUCKET="$2"
            shift 2
            ;;
        --no-s3)
            NO_S3=true
            shift
            ;;
        --no-notification)
            NO_NOTIFICATION=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        full|db|files|config|verify)
            COMMAND="$1"
            shift
            ;;
        *)
            if [[ "$1" =~ ^backup_[0-9]{8}_[0-9]{6}$ ]] && [ "$COMMAND" = "verify" ]; then
                BACKUP_ID="$1"
                shift
            else
                log_error "Unknown option: $1"
                usage
                exit 1
            fi
            ;;
    esac
done

# Execute command
case "$COMMAND" in
    full)
        main_backup
        ;;
    db)
        backup_path="$BACKUP_DIR/backup_${TIMESTAMP}"
        create_backup_structure "$backup_path"
        backup_database "$backup_path"
        verify_backup "$backup_path"
        ;;
    files)
        backup_path="$BACKUP_DIR/backup_${TIMESTAMP}"
        create_backup_structure "$backup_path"
        backup_filesystem "$backup_path"
        verify_backup "$backup_path"
        ;;
    config)
        backup_path="$BACKUP_DIR/backup_${TIMESTAMP}"
        create_backup_structure "$backup_path"
        backup_configuration "$backup_path"
        ;;
    verify)
        if [ -n "${BACKUP_ID:-}" ]; then
            verify_backup "$BACKUP_DIR/$BACKUP_ID"
        else
            log_error "Backup ID required for verify command"
            exit 1
        fi
        ;;
    *)
        log_error "Unknown command: $COMMAND"
        usage
        exit 1
        ;;
esac