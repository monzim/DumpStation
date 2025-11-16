# Build stage
FROM golang:1.21-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o backup-service ./cmd/server

# Runtime stage
FROM alpine:latest

# Install PostgreSQL client tools and CA certificates
RUN apk add --no-cache postgresql-client ca-certificates tzdata

WORKDIR /root/

# Copy the binary from builder
COPY --from=builder /app/backup-service .

# Copy migrations
COPY --from=builder /app/migrations ./migrations

# Expose port
EXPOSE 8080

# Run the service
CMD ["./backup-service"]
