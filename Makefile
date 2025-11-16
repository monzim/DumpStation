.PHONY: help build run test clean docker-build docker-up docker-down deps migrate

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

docker-build: ## Build Docker image
	docker build -t postgres-backup-service:latest .

docker-up: ## Start services with docker-compose
	docker-compose up -d

docker-down: ## Stop services with docker-compose
	docker-compose down

docker-logs: ## Show logs from docker-compose
	docker-compose logs -f

docker-restart: docker-down docker-up ## Restart docker services

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

.DEFAULT_GOAL := help
