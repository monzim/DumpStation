#!/bin/bash

# ============================================
# DumpStation Management Script
# ============================================
# Common management tasks for DumpStation
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/compose.yml"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

show_help() {
    cat << EOF
🗄️  DumpStation Management Script

Usage: $0 <command> [options]

Commands:
    start           Start all services
    stop            Stop all services
    restart         Restart all services
    status          Show service status
    logs            View logs (use -f to follow)
    update          Pull latest images and restart
    backup          Backup DumpStation database
    restore         Restore DumpStation database from backup
    clean           Remove stopped containers and unused images
    reset           Reset everything (WARNING: destroys all data)
    shell           Open shell in a container
    health          Check service health
    help            Show this help message

Examples:
    $0 start                # Start all services
    $0 logs -f              # Follow logs
    $0 logs backend         # View backend logs
    $0 shell backend        # Open shell in backend container
    $0 backup               # Backup database
    $0 restore backup.sql   # Restore from backup

EOF
}

cmd_start() {
    print_info "Starting DumpStation services..."
    docker compose -f "$COMPOSE_FILE" up -d
    print_success "Services started"
    cmd_status
}

cmd_stop() {
    print_info "Stopping DumpStation services..."
    docker compose -f "$COMPOSE_FILE" down
    print_success "Services stopped"
}

cmd_restart() {
    print_info "Restarting DumpStation services..."
    docker compose -f "$COMPOSE_FILE" restart
    print_success "Services restarted"
    cmd_status
}

cmd_status() {
    print_info "Service status:"
    docker compose -f "$COMPOSE_FILE" ps
}

cmd_logs() {
    if [ "$1" = "-f" ]; then
        shift
        docker compose -f "$COMPOSE_FILE" logs -f "$@"
    else
        docker compose -f "$COMPOSE_FILE" logs "$@"
    fi
}

cmd_update() {
    print_info "Updating DumpStation..."
    
    print_info "Pulling latest images..."
    docker compose -f "$COMPOSE_FILE" pull
    
    print_info "Recreating containers..."
    docker compose -f "$COMPOSE_FILE" up -d
    
    print_info "Cleaning old images..."
    docker image prune -f
    
    print_success "Update complete!"
    cmd_status
}

cmd_backup() {
    BACKUP_DIR="$SCRIPT_DIR/backups"
    mkdir -p "$BACKUP_DIR"
    
    BACKUP_FILE="$BACKUP_DIR/dumpstation_$(date +%Y%m%d_%H%M%S).sql"
    
    print_info "Creating backup: $BACKUP_FILE"
    docker compose -f "$COMPOSE_FILE" exec -T postgres pg_dump -U postgres backup_service > "$BACKUP_FILE"
    
    # Compress backup
    gzip "$BACKUP_FILE"
    
    print_success "Backup created: ${BACKUP_FILE}.gz"
    
    # Show backup size
    BACKUP_SIZE=$(du -h "${BACKUP_FILE}.gz" | cut -f1)
    print_info "Backup size: $BACKUP_SIZE"
}

cmd_restore() {
    if [ -z "$1" ]; then
        print_error "Please provide backup file path"
        echo "Usage: $0 restore <backup-file>"
        exit 1
    fi
    
    BACKUP_FILE="$1"
    
    if [ ! -f "$BACKUP_FILE" ]; then
        print_error "Backup file not found: $BACKUP_FILE"
        exit 1
    fi
    
    print_warning "This will restore the database from: $BACKUP_FILE"
    read -p "Are you sure? (yes/no) " -r
    if [[ ! $REPLY = "yes" ]]; then
        print_info "Restore cancelled"
        exit 0
    fi
    
    print_info "Restoring database..."
    
    # Decompress if gzipped
    if [[ "$BACKUP_FILE" == *.gz ]]; then
        print_info "Decompressing backup..."
        gunzip -c "$BACKUP_FILE" | docker compose -f "$COMPOSE_FILE" exec -T postgres psql -U postgres backup_service
    else
        cat "$BACKUP_FILE" | docker compose -f "$COMPOSE_FILE" exec -T postgres psql -U postgres backup_service
    fi
    
    print_success "Database restored successfully"
}

cmd_clean() {
    print_info "Cleaning up Docker resources..."
    
    docker compose -f "$COMPOSE_FILE" down --remove-orphans
    docker image prune -f
    docker volume prune -f
    
    print_success "Cleanup complete"
}

cmd_reset() {
    print_warning "⚠️  WARNING: This will destroy all data!"
    print_warning "This includes:"
    echo "  - All containers"
    echo "  - All volumes (database data, backups)"
    echo "  - All networks"
    echo ""
    read -p "Type 'DELETE EVERYTHING' to confirm: " -r
    
    if [[ ! $REPLY = "DELETE EVERYTHING" ]]; then
        print_info "Reset cancelled"
        exit 0
    fi
    
    print_info "Stopping and removing all services..."
    docker compose -f "$COMPOSE_FILE" down -v --remove-orphans
    
    print_info "Removing volumes..."
    docker volume rm dumpstation_postgres_data 2>/dev/null || true
    docker volume rm dumpstation_minio_data 2>/dev/null || true
    
    print_success "Reset complete. Run '$0 start' to redeploy"
}

cmd_shell() {
    SERVICE="${1:-backend}"
    SHELL_CMD="${2:-sh}"
    
    print_info "Opening shell in $SERVICE container..."
    docker compose -f "$COMPOSE_FILE" exec "$SERVICE" "$SHELL_CMD"
}

cmd_health() {
    print_info "Checking service health..."
    echo ""
    
    # Check PostgreSQL
    if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
        print_success "PostgreSQL: Healthy"
    else
        print_error "PostgreSQL: Unhealthy"
    fi
    
    # Check Backend
    if curl -sf http://localhost:8080/api/v1/health > /dev/null 2>&1; then
        print_success "Backend API: Healthy"
    else
        print_error "Backend API: Unhealthy"
    fi
    
    # Check Web
    if curl -sf http://localhost:3000 > /dev/null 2>&1; then
        print_success "Web Frontend: Healthy"
    else
        print_error "Web Frontend: Unhealthy"
    fi
    
    echo ""
    print_info "Container status:"
    cmd_status
}

# Main command router
case "${1:-help}" in
    start)
        cmd_start
        ;;
    stop)
        cmd_stop
        ;;
    restart)
        cmd_restart
        ;;
    status)
        cmd_status
        ;;
    logs)
        shift
        cmd_logs "$@"
        ;;
    update)
        cmd_update
        ;;
    backup)
        cmd_backup
        ;;
    restore)
        shift
        cmd_restore "$@"
        ;;
    clean)
        cmd_clean
        ;;
    reset)
        cmd_reset
        ;;
    shell)
        shift
        cmd_shell "$@"
        ;;
    health)
        cmd_health
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
