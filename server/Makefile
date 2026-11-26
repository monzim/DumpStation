.PHONY: help deps build build-agent run dev test test-integration test-coverage clean \
         docker-build docker-build-agent compose-up compose-down format lint swagger

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

deps: ## Download dependencies
	go mod download
	go mod tidy

build: ## Build the server binary
	go build -o dumpstation ./cmd/server

build-agent: ## Build the agent binary
	CGO_ENABLED=0 go build -o dumpstation-agent ./cmd/agent

run: ## Run the server
	go run ./cmd/server

dev: ## Run the server with variables from .env (set WEB_DIR=../web/dist to serve the UI)
	@if [ ! -f .env ]; then \
		echo "Error: .env file not found. Copy .env.example to .env and configure it."; \
		exit 1; \
	fi
	@set -a && . ./.env && set +a && go run ./cmd/server

test: ## Run unit tests
	go test ./...

test-integration: ## Run tests including PostgreSQL integration tests (requires TEST_PG_URL)
	@if [ -z "$$TEST_PG_URL" ]; then echo "Set TEST_PG_URL=postgres://user:pass@host:5432/db?sslmode=disable"; exit 1; fi
	go test ./...

test-coverage: ## Run tests with coverage
	go test -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out

clean: ## Clean build artifacts
	rm -f backup-service dumpstation dumpstation-agent coverage.out

docker-build: ## Build the server + web UI image (repo root Dockerfile)
	docker build -t dumpstation:dev ..

docker-build-agent: ## Build the agent image
	docker build -f Dockerfile.agent -t dumpstation-agent:dev .

compose-up: ## Start the bundled stack (configs/compose.yml + configs/.env)
	docker compose -f ../configs/compose.yml --env-file ../configs/.env up -d

compose-down: ## Stop the bundled stack
	docker compose -f ../configs/compose.yml --env-file ../configs/.env down

format: ## Format code
	go fmt ./...

lint: ## Run linter
	golangci-lint run

swagger: ## Generate Swagger documentation (legacy spec)
	@if ! command -v swag > /dev/null; then \
		go install github.com/swaggo/swag/cmd/swag@v1.16.2; \
	fi
	swag init -g cmd/server/main.go -o docs --parseDependency --parseInternal

.DEFAULT_GOAL := help
