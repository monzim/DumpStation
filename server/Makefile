.PHONY: help build run test clean docker-build docker-up docker-down deps migrate swagger \
         docker-build-prod docker-push docker-shell docker-logs-postgres docker-verify-versions \
         docker-pull-versions docker-test-multiversion

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

deps: ## Download dependencies
	go mod download
	go mod tidy

build: ## Build the application
	go build -o backup-service ./cmd/server

run: ## Run the application
	go run ./cmd/server/main.go

test: ## Run tests
	go test -v ./...

test-coverage: ## Run tests with coverage
	go test -v -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out

clean: ## Clean build artifacts
	rm -f backup-service
	rm -f coverage.out

docker-build: ## Build Docker image with multi-version PostgreSQL support
	docker build -t postgres-backup-service:latest .
	@echo "✓ Docker image built successfully"
	@echo "  Image: postgres-backup-service:latest"
	@echo "  PostgreSQL versions supported: 12, 13, 14, 15, 16"

docker-build-prod: ## Build production Docker image with optimizations
	docker build \
		--target runtime \
		-t postgres-backup-service:latest \
		-t postgres-backup-service:$(shell git describe --tags --always) \
		.
	@echo "✓ Production image built"

docker-up: docker-pull-versions ## Start services with docker-compose (includes multi-version PostgreSQL)
	docker-compose up -d
	@echo "✓ Services started"
	@echo "  Backup Service API: http://localhost:8080"
	@echo "  MinIO Console: http://localhost:9001"
	@echo "  PostgreSQL 12: localhost:5433"
	@echo "  PostgreSQL 14: localhost:5434"
	@echo "  PostgreSQL 16: localhost:5435"
	@sleep 5
	@make docker-verify-versions

docker-down: ## Stop services with docker-compose
	docker-compose down

docker-pull-versions: ## Pre-pull PostgreSQL Docker images
	@echo "Pre-pulling PostgreSQL images..."
	docker pull postgres:12-alpine &
	docker pull postgres:14-alpine &
	docker pull postgres:15-alpine &
	docker pull postgres:16-alpine &
	wait
	@echo "✓ All PostgreSQL images ready"

docker-logs: ## Show logs from docker-compose
	docker-compose logs -f

docker-logs-service: ## Show only backup service logs
	docker-compose logs -f backup-service

docker-logs-postgres: ## Show only PostgreSQL logs
	docker-compose logs -f postgres postgres-12 postgres-14 postgres-16

docker-restart: docker-down docker-up ## Restart docker services

docker-shell: ## Open shell in running backup service container
	docker exec -it backup_service_api /bin/bash

docker-verify-versions: ## Verify PostgreSQL versions in container
	@echo "Verifying PostgreSQL versions in backup service container..."
	@docker exec backup_service_api sh -c 'for v in 12 13 14 15 16; do echo -n "pg_dump v$$v: "; ls /usr/lib/postgresql/$$v/bin/pg_dump 2>/dev/null || echo "NOT FOUND"; done'
	@echo "✓ Verification complete"

docker-test-multiversion: ## Test backups across multiple PostgreSQL versions
	@echo "Testing multi-version backup support..."
	@docker exec backup_service_api sh -c '\
		echo "Testing pg_dump availability:"; \
		for v in 12 14 16; do \
			echo -n "  PostgreSQL $$v: "; \
			/usr/lib/postgresql/$$v/bin/pg_dump --version 2>/dev/null || echo "NOT AVAILABLE"; \
		done' || echo "Container not running"

docker-inspect: ## Inspect backup service container details
	docker inspect backup_service_api | grep -E '(Image|Hostname|IPAddress|Mounts|Env)'

docker-push: ## Push Docker image to registry (requires IMAGE_REGISTRY env var)
	@if [ -z "$$IMAGE_REGISTRY" ]; then \
		echo "Error: IMAGE_REGISTRY environment variable not set"; \
		exit 1; \
	fi
	docker tag postgres-backup-service:latest $$IMAGE_REGISTRY/postgres-backup-service:latest
	docker push $$IMAGE_REGISTRY/postgres-backup-service:latest

dev: ## Run in development mode
	@if [ ! -f .env ]; then \
		echo "Error: .env file not found. Copy .env.example to .env and configure it."; \
		exit 1; \
	fi
	@echo "Starting development server..."
	@set -a && source .env && set +a && go run ./cmd/server/main.go

format: ## Format code
	go fmt ./...
	goimports -w .

lint: ## Run linter
	golangci-lint run

swagger: ## Generate Swagger documentation
	@if ! command -v swag > /dev/null; then \
		echo "Installing swag..."; \
		go install github.com/swaggo/swag/cmd/swag@v1.16.2; \
	fi
	@echo "Generating Swagger documentation..."
	@swag init -g cmd/server/main.go -o docs --parseDependency --parseInternal
	@echo "✓ Swagger documentation generated in docs/"
	@echo "  Access at: http://localhost:8080/swagger/index.html"

.DEFAULT_GOAL := help
