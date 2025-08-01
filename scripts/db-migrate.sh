#!/bin/bash

# Database Migration Script for Claude CLI Web UI
# Handles database schema migrations and data management

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
DB_DIR="$PROJECT_ROOT/db"
MIGRATIONS_DIR="$DB_DIR/migrations"
BACKUPS_DIR="$DB_DIR/backups"

# Default configuration
DEFAULT_DB_HOST="localhost"
DEFAULT_DB_PORT="5432"
DEFAULT_DB_NAME="claude_cli"
DEFAULT_DB_USER="claude_user"

# Load environment variables
if [ -f "$PROJECT_ROOT/.env" ]; then
    source "$PROJECT_ROOT/.env"
fi

# Database connection settings
DB_HOST="${DB_HOST:-$DEFAULT_DB_HOST}"
DB_PORT="${DB_PORT:-$DEFAULT_DB_PORT}"
DB_NAME="${DB_NAME:-$DEFAULT_DB_NAME}"
DB_USER="${DB_USER:-$DEFAULT_DB_USER}"
DB_PASSWORD="${DB_PASSWORD:-}"

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

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check database connection
check_db_connection() {
    log_info "Checking database connection..."
    
    if ! command_exists psql; then
        log_error "psql is not installed. Please install PostgreSQL client."
        return 1
    fi
    
    local connection_string="postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"
    
    if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
        log_success "Database connection successful"
        return 0
    else
        log_error "Cannot connect to database"
        log_error "Connection string: postgresql://$DB_USER:***@$DB_HOST:$DB_PORT/$DB_NAME"
        return 1
    fi
}

# Function to create migrations table
create_migrations_table() {
    log_info "Creating migrations table..."
    
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<EOF
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) UNIQUE NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    execution_time_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_filename ON schema_migrations(filename);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON schema_migrations(applied_at);
EOF
    
    log_success "Migrations table ready"
}

# Function to calculate file checksum
calculate_checksum() {
    local file="$1"
    if command_exists sha256sum; then
        sha256sum "$file" | cut -d' ' -f1
    elif command_exists shasum; then
        shasum -a 256 "$file" | cut -d' ' -f1
    else
        log_error "No checksum command available (sha256sum or shasum)"
        return 1
    fi
}

# Function to get applied migrations
get_applied_migrations() {
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
        "SELECT filename FROM schema_migrations ORDER BY filename;" | sed 's/^[[:space:]]*//' | grep -v '^$'
}

# Function to apply a single migration
apply_migration() {
    local migration_file="$1"
    local filename=$(basename "$migration_file")
    
    log_info "Applying migration: $filename"
    
    # Calculate checksum
    local checksum
    if ! checksum=$(calculate_checksum "$migration_file"); then
        return 1
    fi
    
    # Check if migration was already applied with different checksum
    local existing_checksum
    existing_checksum=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
        "SELECT checksum FROM schema_migrations WHERE filename = '$filename';" | sed 's/^[[:space:]]*//')
    
    if [ -n "$existing_checksum" ] && [ "$existing_checksum" != "$checksum" ]; then
        log_error "Migration $filename has been modified since it was applied"
        log_error "Expected checksum: $existing_checksum"
        log_error "Current checksum:  $checksum"
        return 1
    fi
    
    if [ -n "$existing_checksum" ]; then
        log_info "Migration $filename already applied, skipping"
        return 0
    fi
    
    # Apply migration and measure execution time
    local start_time=$(date +%s%3N)
    
    if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$migration_file"; then
        local end_time=$(date +%s%3N)
        local execution_time=$((end_time - start_time))
        
        # Record migration
        PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c \
            "INSERT INTO schema_migrations (filename, checksum, execution_time_ms) VALUES ('$filename', '$checksum', $execution_time);"
        
        log_success "Migration $filename applied successfully (${execution_time}ms)"
        return 0
    else
        log_error "Failed to apply migration: $filename"
        return 1
    fi
}

# Function to run migrations
run_migrations() {
    log_info "Running database migrations..."
    
    if [ ! -d "$MIGRATIONS_DIR" ]; then
        log_info "No migrations directory found, creating it"
        mkdir -p "$MIGRATIONS_DIR"
        return 0
    fi
    
    # Get list of migration files
    local migration_files=()
    while IFS= read -r -d '' file; do
        migration_files+=("$file")
    done < <(find "$MIGRATIONS_DIR" -name "*.sql" -type f -print0 | sort -z)
    
    if [ ${#migration_files[@]} -eq 0 ]; then
        log_info "No migration files found"
        return 0
    fi
    
    # Apply each migration
    local applied_count=0
    local skipped_count=0
    
    for migration_file in "${migration_files[@]}"; do
        if apply_migration "$migration_file"; then
            applied_count=$((applied_count + 1))
        else
            log_error "Migration failed, stopping"
            return 1
        fi
    done
    
    log_success "Migrations completed: $applied_count applied"
}

# Function to create a new migration
create_migration() {
    local migration_name="$1"
    
    if [ -z "$migration_name" ]; then
        log_error "Migration name is required"
        return 1
    fi
    
    # Create migrations directory if it doesn't exist
    mkdir -p "$MIGRATIONS_DIR"
    
    # Generate timestamp
    local timestamp=$(date +"%Y%m%d%H%M%S")
    local filename="${timestamp}_${migration_name}.sql"
    local filepath="$MIGRATIONS_DIR/$filename"
    
    # Create migration template
    cat > "$filepath" <<EOF
-- Migration: $migration_name
-- Created: $(date)
-- Description: Add your migration description here

BEGIN;

-- Add your migration SQL here
-- Example:
-- CREATE TABLE example_table (
--     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--     name VARCHAR(255) NOT NULL,
--     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
-- );

-- Don't forget to add indexes if needed
-- CREATE INDEX idx_example_table_name ON example_table(name);

COMMIT;
EOF
    
    log_success "Created migration: $filepath"
    log_info "Edit the file to add your migration SQL"
}

# Function to rollback migrations
rollback_migration() {
    local target_migration="$1"
    
    log_warning "Migration rollback is not automatically supported"
    log_warning "You need to create a new migration to revert changes"
    log_info "Target migration: $target_migration"
    
    # Show applied migrations for reference
    log_info "Currently applied migrations:"
    get_applied_migrations | while read -r migration; do
        echo "  - $migration"
    done
}

# Function to show migration status
show_status() {
    log_info "Migration status:"
    
    # Get applied migrations
    local applied_migrations
    applied_migrations=$(get_applied_migrations)
    
    # Get available migrations
    local available_migrations=()
    if [ -d "$MIGRATIONS_DIR" ]; then
        while IFS= read -r -d '' file; do
            available_migrations+=("$(basename "$file")")
        done < <(find "$MIGRATIONS_DIR" -name "*.sql" -type f -print0 | sort -z)
    fi
    
    echo
    echo "Applied migrations:"
    if [ -n "$applied_migrations" ]; then
        echo "$applied_migrations" | while read -r migration; do
            echo "  ✓ $migration"
        done
    else
        echo "  (none)"
    fi
    
    echo
    echo "Pending migrations:"
    local pending_found=false
    for migration in "${available_migrations[@]}"; do
        if ! echo "$applied_migrations" | grep -q "^$migration$"; then
            echo "  - $migration"
            pending_found=true
        fi
    done
    
    if [ "$pending_found" = false ]; then
        echo "  (none)"
    fi
}

# Function to backup database
backup_database() {
    local backup_name="$1"
    
    if [ -z "$backup_name" ]; then
        backup_name="backup_$(date +%Y%m%d_%H%M%S)"
    fi
    
    mkdir -p "$BACKUPS_DIR"
    local backup_file="$BACKUPS_DIR/${backup_name}.sql"
    
    log_info "Creating database backup: $backup_file"
    
    if PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        --clean --if-exists --create --verbose > "$backup_file" 2>/dev/null; then
        
        # Compress backup
        gzip "$backup_file"
        log_success "Database backup created: ${backup_file}.gz"
        
        # Show backup size
        local backup_size=$(du -h "${backup_file}.gz" | cut -f1)
        log_info "Backup size: $backup_size"
        
        return 0
    else
        log_error "Failed to create database backup"
        return 1
    fi
}

# Function to restore database from backup
restore_database() {
    local backup_file="$1"
    
    if [ -z "$backup_file" ]; then
        log_error "Backup file is required"
        return 1
    fi
    
    if [ ! -f "$backup_file" ]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi
    
    log_warning "This will replace the current database content!"
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Restore cancelled"
        return 0
    fi
    
    log_info "Restoring database from: $backup_file"
    
    # Handle compressed files
    if [[ "$backup_file" == *.gz ]]; then
        if gunzip -c "$backup_file" | PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"; then
            log_success "Database restored successfully"
        else
            log_error "Failed to restore database"
            return 1
        fi
    else
        if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" < "$backup_file"; then
            log_success "Database restored successfully"
        else
            log_error "Failed to restore database"
            return 1
        fi
    fi
}

# Function to initialize database
init_database() {
    log_info "Initializing database..."
    
    # Check if init script exists
    local init_script="$DB_DIR/init/001_create_database.sql"
    if [ ! -f "$init_script" ]; then
        log_error "Database init script not found: $init_script"
        return 1
    fi
    
    # Apply init script
    if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$init_script"; then
        log_success "Database initialized successfully"
    else
        log_error "Failed to initialize database"
        return 1
    fi
}

# Function to display usage
usage() {
    echo "Usage: $0 [OPTIONS] COMMAND"
    echo ""
    echo "Database migration and management tool for Claude CLI Web UI"
    echo ""
    echo "Commands:"
    echo "  init                 Initialize database with base schema"
    echo "  migrate              Run pending migrations"
    echo "  create <name>        Create a new migration file"
    echo "  status               Show migration status"
    echo "  rollback <migration> Show rollback instructions"
    echo "  backup [name]        Create database backup"
    echo "  restore <file>       Restore database from backup"
    echo ""
    echo "Options:"
    echo "  -h, --host HOST      Database host (default: $DEFAULT_DB_HOST)"
    echo "  -p, --port PORT      Database port (default: $DEFAULT_DB_PORT)"
    echo "  -d, --database NAME  Database name (default: $DEFAULT_DB_NAME)"
    echo "  -U, --user USER      Database user (default: $DEFAULT_DB_USER)"
    echo "  -W, --password PASS  Database password (or set DB_PASSWORD env var)"
    echo "  --help               Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD"
    echo ""
    echo "Examples:"
    echo "  $0 init"
    echo "  $0 migrate"
    echo "  $0 create add_user_preferences"
    echo "  $0 backup pre_migration_backup"
    echo "  $0 status"
}

# Parse command line arguments
COMMAND=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--host)
            DB_HOST="$2"
            shift 2
            ;;
        -p|--port)
            DB_PORT="$2"
            shift 2
            ;;
        -d|--database)
            DB_NAME="$2"
            shift 2
            ;;
        -U|--user)
            DB_USER="$2"
            shift 2
            ;;
        -W|--password)
            DB_PASSWORD="$2"
            shift 2
            ;;
        --help)
            usage
            exit 0
            ;;
        init|migrate|create|status|rollback|backup|restore)
            COMMAND="$1"
            shift
            break
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Check if password is set
if [ -z "$DB_PASSWORD" ]; then
    read -s -p "Database password: " DB_PASSWORD
    echo
fi

# Execute command
case "$COMMAND" in
    init)
        check_db_connection && init_database
        ;;
    migrate)
        check_db_connection && create_migrations_table && run_migrations
        ;;
    create)
        create_migration "$1"
        ;;
    status)
        check_db_connection && create_migrations_table && show_status
        ;;
    rollback)
        check_db_connection && rollback_migration "$1"
        ;;
    backup)
        check_db_connection && backup_database "$1"
        ;;
    restore)
        check_db_connection && restore_database "$1"
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