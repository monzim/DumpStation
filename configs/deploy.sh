#!/bin/bash

# ============================================
# DumpStation Production Deployment Script
# ============================================
# This script helps you deploy DumpStation in production
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/compose.yml"
ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Print header
print_header() {
    echo ""
    echo "============================================"
    echo "   🗄️  DumpStation Production Deployment"
    echo "============================================"
    echo ""
}

# Check if Docker is installed
check_docker() {
    print_info "Checking Docker installation..."
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! command -v docker compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    print_success "Docker and Docker Compose are installed"
}

# Check if .env file exists
check_env_file() {
    print_info "Checking environment configuration..."
    
    if [ ! -f "$ENV_FILE" ]; then
        print_warning ".env file not found"
        
        if [ -f "$ENV_EXAMPLE" ]; then
            print_info "Copying .env.example to .env..."
            cp "$ENV_EXAMPLE" "$ENV_FILE"
            print_success "Created .env file from template"
            echo ""
            print_warning "⚠️  IMPORTANT: Edit .env file and set your configuration values!"
            print_warning "Required values:"
            echo "   - POSTGRES_PASSWORD"
            echo "   - JWT_SECRET"
            echo "   - DISCORD_WEBHOOK_URL"
            echo ""
            read -p "Press Enter when you've configured the .env file..."
        else
            print_error ".env.example file not found"
            exit 1
        fi
    else
        print_success ".env file found"
    fi
}

# Validate required environment variables
validate_env() {
    print_info "Validating environment variables..."
    
    source "$ENV_FILE"
    
    errors=0
    
    # Check POSTGRES_PASSWORD
    if [ -z "$POSTGRES_PASSWORD" ] || [ "$POSTGRES_PASSWORD" = "CHANGE_ME_STRONG_PASSWORD_HERE" ]; then
        print_error "POSTGRES_PASSWORD is not set or using default value"
        errors=$((errors + 1))
    fi
    
    # Check JWT_SECRET
    if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "CHANGE_ME_GENERATE_SECURE_SECRET_HERE" ]; then
        print_error "JWT_SECRET is not set or using default value"
        errors=$((errors + 1))
    fi
    
    # Check DISCORD_WEBHOOK_URL
    if [ -z "$DISCORD_WEBHOOK_URL" ] || [[ "$DISCORD_WEBHOOK_URL" =~ "YOUR_WEBHOOK" ]]; then
        print_error "DISCORD_WEBHOOK_URL is not set or using placeholder value"
        errors=$((errors + 1))
    fi
    
    if [ $errors -gt 0 ]; then
        print_error "Environment validation failed. Please fix the above errors in .env file."
        exit 1
    fi
    
    print_success "Environment variables validated"
}

# Pull latest images
pull_images() {
    print_info "Pulling latest Docker images..."
    docker compose -f "$COMPOSE_FILE" pull
    print_success "Images pulled successfully"
}

# Start services
start_services() {
    print_info "Starting DumpStation services..."
    docker compose -f "$COMPOSE_FILE" up -d
    print_success "Services started successfully"
}

# Check service health
check_health() {
    print_info "Waiting for services to be healthy..."
    
    max_attempts=30
    attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        attempt=$((attempt + 1))
        
        # Check if backend is healthy
        if docker compose -f "$COMPOSE_FILE" ps | grep -q "dumpstation_backend.*healthy"; then
            print_success "All services are healthy!"
            return 0
        fi
        
        echo -n "."
        sleep 2
    done
    
    print_warning "Timeout waiting for services. Check logs with: docker compose logs"
    return 1
}

# Show service status
show_status() {
    echo ""
    echo "============================================"
    echo "   📊 Service Status"
    echo "============================================"
    docker compose -f "$COMPOSE_FILE" ps
}

# Show access information
show_access_info() {
    source "$ENV_FILE"
    
    BACKEND_PORT=${BACKEND_PORT:-8080}
    WEB_PORT=${WEB_PORT:-3000}
    
    echo ""
    echo "============================================"
    echo "   🎉 Deployment Complete!"
    echo "============================================"
    echo ""
    print_success "DumpStation is now running!"
    echo ""
    echo "📍 Access URLs:"
    echo "   Web Interface:  http://localhost:$WEB_PORT"
    echo "   Backend API:    http://localhost:$BACKEND_PORT"
    echo "   API Docs:       http://localhost:$BACKEND_PORT/swagger/"
    echo ""
    echo "📋 Useful Commands:"
    echo "   View logs:      docker compose -f $COMPOSE_FILE logs -f"
    echo "   Stop services:  docker compose -f $COMPOSE_FILE down"
    echo "   Restart:        docker compose -f $COMPOSE_FILE restart"
    echo "   Update images:  docker compose -f $COMPOSE_FILE pull && docker compose -f $COMPOSE_FILE up -d"
    echo ""
    echo "🔐 Next Steps:"
    echo "   1. Open http://localhost:$WEB_PORT in your browser"
    echo "   2. Click 'Login with Discord'"
    echo "   3. Check your Discord channel for the OTP code"
    echo "   4. Start adding your databases!"
    echo ""
    echo "📚 Documentation:"
    echo "   Deployment:     docs/DEPLOYMENT.md"
    echo "   API Reference:  http://localhost:$BACKEND_PORT/swagger/"
    echo ""
    echo "⚠️  Production Recommendations:"
    echo "   - Set up a reverse proxy (Nginx/Caddy) with SSL"
    echo "   - Configure proper firewall rules"
    echo "   - Set up regular backups of postgres_data volume"
    echo "   - Monitor container logs and resource usage"
    echo "   - Update CORS_ALLOWED_ORIGINS to your actual domain"
    echo ""
}

# Main deployment flow
main() {
    print_header
    
    # Pre-flight checks
    check_docker
    check_env_file
    validate_env
    
    echo ""
    print_info "Ready to deploy DumpStation"
    read -p "Continue? (y/N) " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Deployment cancelled"
        exit 0
    fi
    
    # Deployment steps
    pull_images
    start_services
    
    # Post-deployment checks
    check_health
    show_status
    show_access_info
}

# Run main function
main
