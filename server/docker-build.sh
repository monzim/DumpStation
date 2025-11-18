#!/bin/bash
# Docker build and deployment script for DumpStation

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="${IMAGE_NAME:-postgres-backup-service}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
DOCKERFILE="${DOCKERFILE:-Dockerfile}"
BUILD_CONTEXT="${BUILD_CONTEXT:-.}"

# Functions
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

show_usage() {
    cat << EOF
Usage: $0 [COMMAND] [OPTIONS]

Commands:
  build           Build Docker image (default)
  build-prod      Build production-optimized image
  up              Start all services with docker-compose
  down            Stop all services
  logs            Show logs from docker-compose
  verify          Verify PostgreSQL versions in container
  test-multivers  Test multi-version backup support
  shell           Open shell in running container
  clean           Remove containers, volumes, and images
  push            Push image to registry

Options:
  --tag TAG       Docker image tag (default: latest)
  --registry REG  Docker registry URL for push
  --help, -h      Show this help message

Examples:
  ./docker-build.sh build
  ./docker-build.sh build-prod --tag v1.0.0
  ./docker-build.sh push --registry myregistry.azurecr.io
  ./docker-build.sh up
  ./docker-build.sh test-multivers

EOF
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        exit 1
    fi
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed"
        exit 1
    fi
    print_success "Docker and Docker Compose found"
}

build_image() {
    local tag=$1
    local context=$2
    
    print_info "Building Docker image: ${IMAGE_NAME}:${tag}"
    print_info "Using Dockerfile: ${DOCKERFILE}"
    print_info "Build context: ${context}"
    
    docker build \
        -t "${IMAGE_NAME}:${tag}" \
        -f "${DOCKERFILE}" \
        "${context}"
    
    print_success "Docker image built: ${IMAGE_NAME}:${tag}"
    
    # Show image info
    print_info "Image details:"
    docker images "${IMAGE_NAME}:${tag}"
}

build_prod_image() {
    local tag=$1
    
    print_info "Building production-optimized Docker image"
    
    # Build with optimizations
    DOCKER_BUILDKIT=1 docker build \
        --target runtime \
        -t "${IMAGE_NAME}:${tag}" \
        -t "${IMAGE_NAME}:prod" \
        --build-arg BUILDKIT_INLINE_CACHE=1 \
        -f "${DOCKERFILE}" \
        "${BUILD_CONTEXT}"
    
    print_success "Production image built: ${IMAGE_NAME}:${tag}"
}

start_services() {
    print_info "Starting services..."
    
    # Pre-pull images for faster startup
    print_info "Pre-pulling PostgreSQL images..."
    docker pull postgres:12-alpine &
    docker pull postgres:14-alpine &
    docker pull postgres:15-alpine &
    docker pull postgres:16-alpine &
    wait
    
    # Start services
    docker-compose up -d
    
    print_success "Services started"
    
    # Wait for services to be healthy
    print_info "Waiting for services to be healthy..."
    sleep 5
    
    # Display service info
    print_info "Service endpoints:"
    echo "  Backup Service API: http://localhost:8080"
    echo "  Swagger Docs: http://localhost:8080/swagger/index.html"
    echo "  MinIO Console: http://localhost:9001 (user: minioadmin)"
    echo ""
    
    # Verify versions
    verify_versions
}

stop_services() {
    print_info "Stopping services..."
    docker-compose down
    print_success "Services stopped"
}

show_logs() {
    print_info "Displaying logs (Ctrl+C to exit)..."
    docker-compose logs -f
}

verify_versions() {
    print_info "Verifying PostgreSQL versions in container..."
    
    if ! docker ps | grep -q backup_service_api; then
        print_warning "Backup service container not running"
        return
    fi
    
    echo ""
    for v in 12 13 14 15 16; do
        if docker exec backup_service_api test -f /usr/lib/postgresql/$v/bin/pg_dump 2>/dev/null; then
            version_str=$(docker exec backup_service_api /usr/lib/postgresql/$v/bin/pg_dump --version 2>/dev/null || echo "Unknown")
            print_success "PostgreSQL $v: $version_str"
        else
            print_warning "PostgreSQL $v: NOT FOUND"
        fi
    done
    echo ""
}

test_multiversion() {
    print_info "Testing multi-version backup support..."
    
    if ! docker ps | grep -q backup_service_api; then
        print_error "Backup service container not running"
        print_info "Start services with: $0 up"
        return 1
    fi
    
    echo ""
    print_info "Testing pg_dump for different versions:"
    
    for v in 12 14 16; do
        print_info "Testing PostgreSQL $v..."
        if docker exec backup_service_api /usr/lib/postgresql/$v/bin/pg_dump --version 2>/dev/null; then
            print_success "PostgreSQL $v tools available"
        else
            print_error "PostgreSQL $v tools NOT available"
        fi
    done
    echo ""
}

open_shell() {
    if ! docker ps | grep -q backup_service_api; then
        print_error "Backup service container not running"
        return 1
    fi
    
    print_info "Opening shell in backup service container..."
    docker exec -it backup_service_api /bin/bash
}

clean_resources() {
    print_warning "This will remove all containers, volumes, and images"
    read -p "Are you sure? (yes/no): " -r
    echo
    if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        print_info "Removing containers and volumes..."
        docker-compose down -v
        
        print_info "Removing Docker image..."
        docker rmi "${IMAGE_NAME}:${IMAGE_TAG}" || true
        
        print_success "Cleanup complete"
    else
        print_info "Cleanup cancelled"
    fi
}

push_to_registry() {
    local registry=$1
    
    if [ -z "$registry" ]; then
        print_error "Registry URL required"
        echo "Usage: $0 push --registry <registry-url>"
        exit 1
    fi
    
    print_info "Pushing image to registry: ${registry}"
    
    # Tag image
    docker tag "${IMAGE_NAME}:${IMAGE_TAG}" "${registry}/${IMAGE_NAME}:${IMAGE_TAG}"
    
    # Push
    docker push "${registry}/${IMAGE_NAME}:${IMAGE_TAG}"
    
    print_success "Image pushed to ${registry}/${IMAGE_NAME}:${IMAGE_TAG}"
}

# Main script logic
main() {
    # Default command
    COMMAND="${1:-build}"
    
    # Parse arguments
    shift || true
    while [[ $# -gt 0 ]]; do
        case $1 in
            --tag)
                IMAGE_TAG="$2"
                shift 2
                ;;
            --registry)
                REGISTRY="$2"
                shift 2
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    # Check Docker availability
    check_docker
    
    # Execute command
    case $COMMAND in
        build)
            build_image "$IMAGE_TAG" "$BUILD_CONTEXT"
            ;;
        build-prod)
            build_prod_image "$IMAGE_TAG"
            ;;
        up)
            start_services
            ;;
        down)
            stop_services
            ;;
        logs)
            show_logs
            ;;
        verify)
            verify_versions
            ;;
        test-multivers)
            test_multiversion
            ;;
        shell)
            open_shell
            ;;
        clean)
            clean_resources
            ;;
        push)
            push_to_registry "$REGISTRY"
            ;;
        *)
            print_error "Unknown command: $COMMAND"
            show_usage
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
