#!/bin/bash

# SSL/TLS Certificate Setup Script for Claude CLI Web UI
# Supports Let's Encrypt, self-signed certificates, and custom certificates

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
SSL_DIR="$PROJECT_ROOT/nginx/ssl"
NGINX_CONF_DIR="$PROJECT_ROOT/nginx"

# Default configuration
DEFAULT_DOMAIN="claude.yourdomain.com"
DEFAULT_EMAIL="admin@yourdomain.com"

# Load environment variables
if [ -f "$PROJECT_ROOT/.env" ]; then
    source "$PROJECT_ROOT/.env"
fi

DOMAIN="${DOMAIN_NAME:-$DEFAULT_DOMAIN}"
EMAIL="${CERTBOT_EMAIL:-$DEFAULT_EMAIL}"

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

# Function to create SSL directory
create_ssl_directory() {
    log_info "Creating SSL directory..."
    mkdir -p "$SSL_DIR"
    chmod 755 "$SSL_DIR"
    log_success "SSL directory created: $SSL_DIR"
}

# Function to generate DH parameters
generate_dhparam() {
    local dhparam_file="$SSL_DIR/dhparam.pem"
    
    if [ -f "$dhparam_file" ]; then
        log_info "DH parameters already exist: $dhparam_file"
        return 0
    fi
    
    log_info "Generating DH parameters (this may take a while)..."
    openssl dhparam -out "$dhparam_file" 2048
    chmod 644 "$dhparam_file"
    log_success "DH parameters generated: $dhparam_file"
}

# Function to generate self-signed certificate
generate_self_signed() {
    local cert_file="$SSL_DIR/${DOMAIN}.crt"
    local key_file="$SSL_DIR/${DOMAIN}.key"
    
    log_info "Generating self-signed certificate for $DOMAIN..."
    
    # Create OpenSSL configuration for the certificate
    local config_file="$SSL_DIR/openssl.conf"
    cat > "$config_file" <<EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
CN = $DOMAIN
O = Claude CLI
OU = Development
L = San Francisco
ST = CA
C = US

[v3_req]
subjectAltName = @alt_names
basicConstraints = CA:FALSE
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth

[alt_names]
DNS.1 = $DOMAIN
DNS.2 = www.$DOMAIN
DNS.3 = localhost
IP.1 = 127.0.0.1
EOF
    
    # Generate private key
    openssl genrsa -out "$key_file" 2048
    chmod 600 "$key_file"
    
    # Generate certificate
    openssl req -new -x509 -key "$key_file" -out "$cert_file" -days 365 -config "$config_file" -extensions v3_req
    chmod 644 "$cert_file"
    
    # Clean up config file
    rm "$config_file"
    
    log_success "Self-signed certificate generated:"
    log_info "Certificate: $cert_file"
    log_info "Private key: $key_file"
    log_warning "This is a self-signed certificate - browsers will show warnings"
}

# Function to setup Let's Encrypt certificate
setup_letsencrypt() {
    if ! command_exists certbot; then
        log_error "Certbot is not installed. Please install certbot first."
        log_info "On Ubuntu/Debian: sudo apt install certbot"
        log_info "On CentOS/RHEL: sudo yum install certbot"
        return 1
    fi
    
    log_info "Setting up Let's Encrypt certificate for $DOMAIN..."
    
    # Create webroot directory for challenges
    local webroot_dir="$PROJECT_ROOT/nginx/webroot"
    mkdir -p "$webroot_dir"
    
    # Generate certificate using webroot method
    log_info "Requesting certificate from Let's Encrypt..."
    if certbot certonly \
        --webroot \
        --webroot-path="$webroot_dir" \
        --email "$EMAIL" \
        --agree-tos \
        --no-eff-email \
        --force-renewal \
        -d "$DOMAIN" \
        -d "www.$DOMAIN"; then
        
        # Copy certificates to our SSL directory
        local le_cert_dir="/etc/letsencrypt/live/$DOMAIN"
        if [ -d "$le_cert_dir" ]; then
            cp "$le_cert_dir/fullchain.pem" "$SSL_DIR/${DOMAIN}.crt"
            cp "$le_cert_dir/privkey.pem" "$SSL_DIR/${DOMAIN}.key"
            chmod 644 "$SSL_DIR/${DOMAIN}.crt"
            chmod 600 "$SSL_DIR/${DOMAIN}.key"
            
            log_success "Let's Encrypt certificate installed successfully"
            
            # Setup auto-renewal
            setup_certbot_renewal
        else
            log_error "Let's Encrypt certificate directory not found"
            return 1
        fi
    else
        log_error "Failed to obtain Let's Encrypt certificate"
        log_info "Make sure:"
        log_info "1. Domain $DOMAIN points to this server"
        log_info "2. Port 80 is accessible from the internet"
        log_info "3. No other web server is running on port 80"
        return 1
    fi
}

# Function to setup certbot auto-renewal
setup_certbot_renewal() {
    log_info "Setting up automatic certificate renewal..."
    
    # Create renewal script
    local renewal_script="$PROJECT_ROOT/scripts/renew-ssl.sh"
    cat > "$renewal_script" <<'EOF'
#!/bin/bash

# Certificate renewal script
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SSL_DIR="$PROJECT_ROOT/nginx/ssl"

# Load environment variables
if [ -f "$PROJECT_ROOT/.env" ]; then
    source "$PROJECT_ROOT/.env"
fi

DOMAIN="${DOMAIN_NAME:-claude.yourdomain.com}"

# Renew certificate
certbot renew --quiet --deploy-hook "
    # Copy renewed certificates
    cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem $SSL_DIR/${DOMAIN}.crt
    cp /etc/letsencrypt/live/$DOMAIN/privkey.pem $SSL_DIR/${DOMAIN}.key
    chmod 644 $SSL_DIR/${DOMAIN}.crt
    chmod 600 $SSL_DIR/${DOMAIN}.key
    
    # Reload nginx if running in container
    if docker ps | grep -q nginx; then
        docker exec nginx-proxy nginx -s reload
    elif command -v nginx >/dev/null 2>&1; then
        nginx -s reload
    fi
"
EOF
    
    chmod +x "$renewal_script"
    
    # Add to crontab (runs twice daily)
    local cron_job="0 2,14 * * * $renewal_script"
    
    if crontab -l 2>/dev/null | grep -q "$renewal_script"; then
        log_info "Renewal cron job already exists"
    else
        (crontab -l 2>/dev/null; echo "$cron_job") | crontab -
        log_success "Added automatic renewal cron job"
    fi
    
    log_info "Certificate will be automatically renewed"
    log_info "Renewal script: $renewal_script"
}

# Function to install custom certificate
install_custom_certificate() {
    local cert_path="$1"
    local key_path="$2"
    
    if [ -z "$cert_path" ] || [ -z "$key_path" ]; then
        log_error "Certificate and key paths are required"
        return 1
    fi
    
    if [ ! -f "$cert_path" ]; then
        log_error "Certificate file not found: $cert_path"
        return 1
    fi
    
    if [ ! -f "$key_path" ]; then
        log_error "Private key file not found: $key_path"
        return 1
    fi
    
    log_info "Installing custom certificate..."
    
    # Validate certificate and key
    if ! openssl x509 -in "$cert_path" -noout; then
        log_error "Invalid certificate file"
        return 1
    fi
    
    if ! openssl rsa -in "$key_path" -noout; then
        log_error "Invalid private key file"
        return 1
    fi
    
    # Check if certificate and key match
    local cert_hash
    local key_hash
    cert_hash=$(openssl x509 -in "$cert_path" -noout -modulus | openssl md5)
    key_hash=$(openssl rsa -in "$key_path" -noout -modulus | openssl md5)
    
    if [ "$cert_hash" != "$key_hash" ]; then
        log_error "Certificate and private key do not match"
        return 1
    fi
    
    # Copy files
    cp "$cert_path" "$SSL_DIR/${DOMAIN}.crt"
    cp "$key_path" "$SSL_DIR/${DOMAIN}.key"
    chmod 644 "$SSL_DIR/${DOMAIN}.crt"
    chmod 600 "$SSL_DIR/${DOMAIN}.key"
    
    log_success "Custom certificate installed successfully"
    
    # Show certificate information
    show_certificate_info
}

# Function to show certificate information
show_certificate_info() {
    local cert_file="$SSL_DIR/${DOMAIN}.crt"
    
    if [ ! -f "$cert_file" ]; then
        log_error "Certificate file not found: $cert_file"
        return 1
    fi
    
    log_info "Certificate information:"
    echo
    openssl x509 -in "$cert_file" -noout -text | grep -A 2 "Subject:"
    openssl x509 -in "$cert_file" -noout -text | grep -A 1 "Not Before"
    openssl x509 -in "$cert_file" -noout -text | grep -A 1 "Not After"
    openssl x509 -in "$cert_file" -noout -text | grep -A 5 "Subject Alternative Name" || true
    echo
}

# Function to test SSL configuration
test_ssl_config() {
    local cert_file="$SSL_DIR/${DOMAIN}.crt"
    local key_file="$SSL_DIR/${DOMAIN}.key"
    
    log_info "Testing SSL configuration..."
    
    if [ ! -f "$cert_file" ]; then
        log_error "Certificate file not found: $cert_file"
        return 1
    fi
    
    if [ ! -f "$key_file" ]; then
        log_error "Private key file not found: $key_file"
        return 1
    fi
    
    # Test certificate validity
    if openssl x509 -in "$cert_file" -noout -checkend 86400; then
        log_success "Certificate is valid and not expiring within 24 hours"
    else
        log_warning "Certificate is expiring within 24 hours or is invalid"
    fi
    
    # Test nginx configuration if available
    if command_exists nginx; then
        if nginx -t; then
            log_success "Nginx configuration is valid"
        else
            log_error "Nginx configuration has errors"
            return 1
        fi
    fi
    
    # Test SSL/TLS connection (if running)
    if command_exists openssl && netstat -tln | grep -q ":443 "; then
        log_info "Testing SSL/TLS connection..."
        if echo | timeout 5 openssl s_client -connect "localhost:443" -servername "$DOMAIN" 2>/dev/null | grep -q "Verify return code: 0"; then
            log_success "SSL/TLS connection test passed"
        else
            log_warning "SSL/TLS connection test failed (this is normal if server is not running)"
        fi
    fi
}

# Function to create nginx SSL snippet
create_nginx_ssl_snippet() {
    local snippet_file="$NGINX_CONF_DIR/ssl-params.conf"
    
    log_info "Creating nginx SSL configuration snippet..."
    
    cat > "$snippet_file" <<EOF
# SSL/TLS configuration for Claude CLI Web UI
# Include this file in your server blocks

# SSL certificates
ssl_certificate /etc/nginx/ssl/${DOMAIN}.crt;
ssl_certificate_key /etc/nginx/ssl/${DOMAIN}.key;

# SSL protocols and ciphers
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;

# SSL session settings
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 1d;
ssl_session_tickets off;

# OCSP stapling
ssl_stapling on;
ssl_stapling_verify on;
resolver 8.8.8.8 8.8.4.4 valid=300s;
resolver_timeout 5s;

# DH parameters
ssl_dhparam /etc/nginx/ssl/dhparam.pem;

# Security headers
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
EOF
    
    chmod 644 "$snippet_file"
    log_success "Nginx SSL snippet created: $snippet_file"
    log_info "Include this in your server blocks with: include ssl-params.conf;"
}

# Function to backup existing certificates
backup_certificates() {
    local backup_dir="$SSL_DIR/backup-$(date +%Y%m%d_%H%M%S)"
    
    if [ -f "$SSL_DIR/${DOMAIN}.crt" ] || [ -f "$SSL_DIR/${DOMAIN}.key" ]; then
        log_info "Backing up existing certificates..."
        mkdir -p "$backup_dir"
        
        [ -f "$SSL_DIR/${DOMAIN}.crt" ] && cp "$SSL_DIR/${DOMAIN}.crt" "$backup_dir/"
        [ -f "$SSL_DIR/${DOMAIN}.key" ] && cp "$SSL_DIR/${DOMAIN}.key" "$backup_dir/"
        [ -f "$SSL_DIR/dhparam.pem" ] && cp "$SSL_DIR/dhparam.pem" "$backup_dir/"
        
        log_success "Certificates backed up to: $backup_dir"
    fi
}

# Function to display usage
usage() {
    echo "Usage: $0 [OPTIONS] COMMAND"
    echo ""
    echo "SSL/TLS certificate management for Claude CLI Web UI"
    echo ""
    echo "Commands:"
    echo "  self-signed          Generate self-signed certificate"
    echo "  letsencrypt          Setup Let's Encrypt certificate"
    echo "  custom <cert> <key>  Install custom certificate"
    echo "  info                 Show certificate information"
    echo "  test                 Test SSL configuration"
    echo "  renew                Renew Let's Encrypt certificate"
    echo ""
    echo "Options:"
    echo "  -d, --domain DOMAIN  Domain name (default: $DEFAULT_DOMAIN)"
    echo "  -e, --email EMAIL    Email for Let's Encrypt (default: $DEFAULT_EMAIL)"
    echo "  --backup             Backup existing certificates before operation"
    echo "  -h, --help           Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  DOMAIN_NAME, CERTBOT_EMAIL"
    echo ""
    echo "Examples:"
    echo "  $0 self-signed"
    echo "  $0 --domain claude.example.com letsencrypt"
    echo "  $0 custom /path/to/cert.pem /path/to/key.pem"
    echo "  $0 test"
}

# Parse command line arguments
COMMAND=""
BACKUP_CERTS=false
CERT_PATH=""
KEY_PATH=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--domain)
            DOMAIN="$2"
            shift 2
            ;;
        -e|--email)
            EMAIL="$2"
            shift 2
            ;;
        --backup)
            BACKUP_CERTS=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        self-signed|letsencrypt|info|test|renew)
            COMMAND="$1"
            shift
            break
            ;;
        custom)
            COMMAND="$1"
            CERT_PATH="$2"
            KEY_PATH="$3"
            shift 3
            break
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Validate domain
if [[ ! "$DOMAIN" =~ ^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$ ]] && [ "$DOMAIN" != "localhost" ]; then
    log_error "Invalid domain name: $DOMAIN"
    exit 1
fi

# Create SSL directory
create_ssl_directory

# Backup existing certificates if requested
if [ "$BACKUP_CERTS" = true ]; then
    backup_certificates
fi

# Execute command
case "$COMMAND" in
    self-signed)
        generate_dhparam
        generate_self_signed
        create_nginx_ssl_snippet
        show_certificate_info
        ;;
    letsencrypt)
        generate_dhparam
        setup_letsencrypt
        create_nginx_ssl_snippet
        show_certificate_info
        ;;
    custom)
        generate_dhparam
        install_custom_certificate "$CERT_PATH" "$KEY_PATH"
        create_nginx_ssl_snippet
        ;;
    info)
        show_certificate_info
        ;;
    test)
        test_ssl_config
        ;;
    renew)
        if [ -x "$PROJECT_ROOT/scripts/renew-ssl.sh" ]; then
            "$PROJECT_ROOT/scripts/renew-ssl.sh"
        else
            log_error "Renewal script not found. Run 'letsencrypt' command first."
            exit 1
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

log_success "SSL setup completed!"
log_info "Next steps:"
log_info "1. Update your nginx configuration to use SSL"
log_info "2. Restart your web server"
log_info "3. Test HTTPS access to https://$DOMAIN"