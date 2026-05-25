# GEMINI.md - DumpStation Project Context

## Project Overview
**DumpStation** is a production-ready, self-hosted solution for managing PostgreSQL database backups. It combines automated scheduling, cloud storage integration (S3/R2/MinIO), and real-time notifications (Discord) in a single application.

### Architecture
The project follows a modern full-stack architecture:
- **Backend (`/server`)**: Written in **Go 1.25+** using `net/http` with `gorilla/mux`. It uses **GORM** for database operations and **robfig/cron** for backup scheduling.
- **Frontend (`/web`)**: Built with **React 19.2** and **Vite 7**. It utilizes **TanStack Router** for type-safe routing, **TanStack Query** for state management, and **Tailwind CSS 4** with **Radix UI** / **shadcn/ui** for the interface.
- **Infrastructure**: Designed to run in **Docker**. Includes a management database (PostgreSQL) and supports various S3-compatible storage providers.

---

## Building and Running

### Backend (`/server`)
- **Dependencies**: `make deps`
- **Development**: `make dev` (uses `air` for hot reload if configured, or standard go run)
- **Build**: `make build`
- **Static Analysis**: `go vet ./...`
- **Tests**: `go test ./...`

### Frontend (`/web`)
- **Package Manager**: `pnpm`
- **Install**: `pnpm install`
- **Development**: `pnpm dev` (runs on port 7511)
- **Build**: `pnpm build`
- **Test**: `pnpm test` (using Vitest)
- **Deployment**: `pnpm deploy` (targets Cloudflare Workers via Wrangler)

### Full Stack (Docker)
- **Deployment**: `cd configs && ./deploy.sh`
- **Manual Compose**: `docker compose up -d` (from `configs/` or root if linked)

---

## Development Conventions

### Backend (Go)
- **Internal Pattern**: Core logic is strictly kept within the `internal/` directory to prevent external package leakage.
- **Repository Pattern**: Database interactions are abstracted through `internal/repository`.
- **Middleware**: Authentication, logging, and security headers are handled in `internal/middleware`.
- **API Documentation**: Uses Swagger/OpenAPI. Annotations are in `cmd/server/main.go` and handlers. Generate with `swag init`.

### Frontend (React/TS)
- **Routing**: Uses TanStack Router. Route definitions are in `web/src/routes/` and generated in `web/src/routeTree.gen.ts`.
- **State Management**: Prefer TanStack Query for all server-state interactions.
- **Styling**: Adheres to the custom design system documented in `DESIGN.md`. Uses Tailwind CSS 4.
- **Components**: UI components are located in `web/src/components/`, following atomic design or feature-based grouping.

### General
- **Configuration**: Managed via environment variables (see `.env.example`).
- **Security**: JWT for API auth, Discord OTP for login, and TOTP for 2FA.
- **Backups**: Backup names are human-readable (e.g., `swift-falcon-20251208`).

---

## Key Files & Directories
- `server/internal/`: Core backend logic.
- `web/src/routes/`: Frontend page definitions.
- `configs/compose.yml`: Main Docker orchestration.
- `DESIGN.md`: Detailed design tokens and UI/UX guidelines.
- `ROADMAP.md`: Planned features and versioning milestones.
- `docs/`: Supplemental documentation and screenshots.
