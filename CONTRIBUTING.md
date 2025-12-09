# Contributing to DumpStation

First off, thank you for considering contributing to DumpStation! It's people like you that make DumpStation such a great tool.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Documentation](#documentation)
- [Community](#community)

---

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to [me@monzim.com](mailto:me@monzim.com).

### Our Pledge

We pledge to make participation in our project and our community a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity and expression, level of experience, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Our Standards

**Positive behavior includes:**

- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

**Unacceptable behavior includes:**

- The use of sexualized language or imagery
- Trolling, insulting/derogatory comments, and personal or political attacks
- Public or private harassment
- Publishing others' private information without explicit permission
- Other conduct which could reasonably be considered inappropriate

---

## Getting Started

### Ways to Contribute

There are many ways to contribute to DumpStation:

- 🐛 **Report bugs** - Found a bug? [Open an issue](https://github.com/monzim/dumpstation/issues/new?template=bug_report.md)
- 💡 **Suggest features** - Have an idea? [Open a feature request](https://github.com/monzim/dumpstation/issues/new?template=feature_request.md)
- 📝 **Improve documentation** - Help others understand the project better
- 🔧 **Fix issues** - Look for [good first issues](https://github.com/monzim/dumpstation/labels/good%20first%20issue)
- ✨ **Add features** - Implement new functionality
- 🎨 **Improve UI/UX** - Make the interface more intuitive
- 🧪 **Write tests** - Increase code coverage
- 🌍 **Translate** - Help make DumpStation available in more languages

### Before You Start

1. **Check existing issues** - Someone might already be working on it
2. **Discuss major changes** - Open an issue first to discuss your approach
3. **Read the docs** - Familiarize yourself with the codebase
4. **Set up your environment** - Follow the development setup guide below

---

## Development Setup

### Prerequisites

- **Go** 1.24 or higher ([installation guide](https://go.dev/doc/install))
- **Node.js** 20+ and **pnpm** ([installation guide](https://pnpm.io/installation))
- **Docker** and **Docker Compose** ([installation guide](https://docs.docker.com/get-docker/))
- **PostgreSQL** 15+ ([installation guide](https://www.postgresql.org/download/))
- **Git** ([installation guide](https://git-scm.com/downloads))
- **Make** (usually pre-installed on Unix systems)

### 1. Fork and Clone

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/dumpstation.git
cd dumpstation

# Add upstream remote
git remote add upstream https://github.com/monzim/DumpStation.git
```

### 2. Backend Setup (Go)

```bash
cd server

# Install Go dependencies
go mod download

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
# You'll need a Discord webhook URL for development
nano .env

# Start development database
docker-compose up -d postgres

# Run database migrations (automatic on startup)
make dev

# In another terminal, verify the server is running
curl http://localhost:8080/health
```

**Development Commands:**

```bash
make help          # Show all available commands
make dev           # Run with auto-reload (air)
make build         # Build production binary
make test          # Run tests with coverage
make swagger       # Generate API documentation
make lint          # Run golangci-lint
make format        # Format code with gofmt
make docker-build  # Build Docker image
make docker-up     # Start all Docker services
```

### 3. Frontend Setup (React)

```bash
cd web

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

The web interface will be available at `http://localhost:7511`

**Development Commands:**

```bash
pnpm dev           # Start dev server with HMR
pnpm build         # Build for production
pnpm preview       # Preview production build
pnpm lint          # Run ESLint
pnpm type-check    # Run TypeScript checks
pnpm deploy        # Deploy to Cloudflare Workers
```

### 4. Verify Setup

1. **Backend**: Visit http://localhost:8080/swagger/ for API documentation
2. **Frontend**: Visit http://localhost:7511 for the web interface
3. **MinIO**: Visit http://localhost:9001 for local S3 storage (minioadmin/minioadmin)

---

## Project Structure

### Backend (Go)

```
server/
├── cmd/server/              # Application entry point
│   └── main.go             # Server initialization
│
├── internal/               # Private application code
│   ├── auth/               # Authentication logic
│   │   ├── jwt.go          # JWT token management
│   │   ├── otp.go          # OTP generation/verification
│   │   └── two_factor.go   # TOTP 2FA implementation
│   │
│   ├── backup/             # Backup execution
│   │   ├── backup.go       # Core backup logic
│   │   ├── restore.go      # Restore operations
│   │   └── version.go      # Multi-version pg_dump support
│   │
│   ├── config/             # Configuration management
│   │   └── config.go       # Environment variable loading
│   │
│   ├── database/           # Database connections
│   │   └── database.go     # GORM setup and migrations
│   │
│   ├── handlers/           # HTTP request handlers
│   │   ├── handlers.go     # CRUD endpoints
│   │   ├── routes.go       # Route registration
│   │   ├── user_handler.go # User profile management
│   │   └── two_factor.go   # 2FA endpoints
│   │
│   ├── middleware/         # HTTP middleware
│   │   ├── auth.go         # JWT authentication
│   │   ├── cors.go         # CORS configuration
│   │   └── logging.go      # Request logging
│   │
│   ├── models/             # Data models
│   │   └── models.go       # GORM models and relationships
│   │
│   ├── notification/       # Notification service
│   │   └── discord.go      # Discord webhook integration
│   │
│   ├── repository/         # Data access layer
│   │   └── repository.go   # GORM repository pattern
│   │
│   ├── scheduler/          # Cron job scheduling
│   │   └── scheduler.go    # Backup scheduling logic
│   │
│   ├── stats/              # Statistics calculation
│   │   └── stats.go        # Dashboard metrics
│   │
│   ├── storage/            # Cloud storage
│   │   └── storage.go      # S3/R2 client
│   │
│   ├── utils/              # Utility functions
│   │   └── name_generator.go # Human-readable names
│   │
│   └── validator/          # Request validation
│       └── validator.go    # Input validation
│
├── docs/                   # API documentation
│   ├── docs.go            # Swagger generated docs
│   ├── swagger.json       # OpenAPI spec (JSON)
│   └── swagger.yaml       # OpenAPI spec (YAML)
│
├── scripts/               # SQL migration scripts
│   └── *.sql              # Database migrations
│
├── Dockerfile             # Multi-stage Docker build
├── docker-compose.yml     # Development environment
├── docker-compose.prod.yml # Production configuration
├── Makefile               # Build automation
├── go.mod                 # Go dependencies
└── go.sum                 # Dependency checksums
```

### Frontend (React)

```
web/
├── src/
│   ├── components/         # React components
│   │   ├── backup-list.tsx
│   │   ├── backup-details-dialog.tsx
│   │   ├── database-list.tsx
│   │   ├── database-dialog.tsx
│   │   ├── storage-list.tsx
│   │   ├── notification-list.tsx
│   │   ├── stats-card.tsx
│   │   ├── theme-provider.tsx
│   │   └── ui/            # shadcn/ui components
│   │       ├── button.tsx
│   │       ├── dialog.tsx
│   │       ├── card.tsx
│   │       └── ... (50+ components)
│   │
│   ├── lib/               # Utilities and API
│   │   ├── api/           # API client functions
│   │   │   ├── auth.ts
│   │   │   ├── databases.ts
│   │   │   ├── backups.ts
│   │   │   └── storage.ts
│   │   ├── types/         # TypeScript interfaces
│   │   │   └── api.ts
│   │   └── utils/         # Helper functions
│   │       └── utils.ts
│   │
│   ├── routes/            # TanStack Router pages
│   │   ├── __root.tsx     # Root layout
│   │   ├── index.tsx      # Dashboard page
│   │   ├── login.tsx      # Login page
│   │   └── dashboard/     # Dashboard routes
│   │       └── databases.tsx
│   │
│   ├── providers/         # Context providers
│   │   ├── auth-provider.tsx    # Authentication state
│   │   └── query-provider.tsx   # React Query setup
│   │
│   ├── hooks/             # Custom React hooks
│   │   ├── use-mobile.ts
│   │   └── use-toast.ts
│   │
│   ├── router.tsx         # Router configuration
│   ├── routeTree.gen.ts   # Generated route tree
│   └── styles.css         # Global styles
│
├── public/                # Static assets
│   ├── images/           # Image files
│   │   └── og.webp       # Social media preview
│   ├── manifest.json     # PWA manifest
│   └── robots.txt        # SEO configuration
│
├── package.json          # Dependencies
├── vite.config.ts        # Vite configuration
├── tsconfig.json         # TypeScript configuration
└── wrangler.jsonc        # Cloudflare Workers config
```

---

## Development Workflow

### 1. Create a Branch

```bash
# Update your fork
git checkout main
git pull upstream main

# Create a feature branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/issue-description
```

### 2. Make Your Changes

- Write clean, readable code
- Follow the coding standards (see below)
- Add tests for new functionality
- Update documentation as needed
- Test your changes thoroughly

### 3. Test Your Changes

```bash
# Backend tests
cd server
make test

# Frontend tests
cd web
pnpm test

# Integration tests
make docker-up
# Test the full stack locally
```

### 4. Commit Your Changes

Follow the [commit guidelines](#commit-guidelines) below.

```bash
git add .
git commit -m "feat: add amazing new feature"
```

### 5. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then open a Pull Request on GitHub.

---

## Coding Standards

### Go (Backend)

**Style Guide:**

- Follow [Effective Go](https://go.dev/doc/effective_go)
- Use `gofmt` for formatting (run `make format`)
- Use `golangci-lint` for linting (run `make lint`)
- Write idiomatic Go code

**Best Practices:**

```go
// ✅ Good: Descriptive variable names
func ProcessBackup(dbConfig *models.DatabaseConfig) error {
    backupName := utils.GenerateBackupName()
    // ...
}

// ❌ Bad: Unclear abbreviations
func PrcsBkp(cfg *models.DBC) error {
    bn := utils.GenName()
    // ...
}

// ✅ Good: Error handling
result, err := storage.Upload(ctx, file)
if err != nil {
    return fmt.Errorf("failed to upload backup: %w", err)
}

// ❌ Bad: Ignored errors
result, _ := storage.Upload(ctx, file)

// ✅ Good: Comments for exported functions
// GenerateBackupName creates a human-readable backup name
// using a combination of adjective, noun, and date.
func GenerateBackupName() string {
    // ...
}
```

**File Organization:**

- One concept per file
- Keep files under 500 lines
- Group related functions together
- Use meaningful package names

**Testing:**

- Write table-driven tests
- Use descriptive test names
- Test edge cases
- Aim for >80% coverage

```go
func TestGenerateBackupName(t *testing.T) {
    tests := []struct {
        name    string
        want    string
        wantErr bool
    }{
        {
            name: "generates valid name",
            want: "^[a-z]+-[a-z]+-\\d{8}$",
            wantErr: false,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got := GenerateBackupName()
            // assertions...
        })
    }
}
```

### TypeScript/React (Frontend)

**Style Guide:**

- Use TypeScript strict mode
- Follow [React best practices](https://react.dev/learn)
- Use functional components with hooks
- Prefer composition over inheritance

**Best Practices:**

```typescript
// ✅ Good: Type-safe props
interface BackupListProps {
  databaseId: string;
  onBackupComplete?: () => void;
}

export function BackupList({ databaseId, onBackupComplete }: BackupListProps) {
  // ...
}

// ❌ Bad: Untyped props
export function BackupList({ databaseId, onBackupComplete }) {
  // ...
}

// ✅ Good: Custom hooks for logic
function useBackups(databaseId: string) {
  return useQuery({
    queryKey: ["backups", databaseId],
    queryFn: () => fetchBackups(databaseId),
  });
}

// ✅ Good: Separate concerns
function BackupList({ databaseId }: BackupListProps) {
  const { data, isLoading, error } = useBackups(databaseId);

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorMessage error={error} />;

  return <BackupTable data={data} />;
}
```

**Component Structure:**

1. Imports (React, libraries, local)
2. Types/interfaces
3. Component definition
4. Hooks (custom hooks first)
5. Event handlers
6. Render logic

**File Naming:**

- Components: `PascalCase.tsx` (e.g., `BackupList.tsx`)
- Utilities: `kebab-case.ts` (e.g., `format-date.ts`)
- Hooks: `use-hook-name.ts` (e.g., `use-backups.ts`)

---

## Commit Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, missing semi-colons, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `build`: Build system changes
- `ci`: CI/CD changes
- `chore`: Other changes (dependencies, etc.)

### Examples

```bash
# Feature
git commit -m "feat(backup): add support for PostgreSQL 17"

# Bug fix
git commit -m "fix(auth): resolve JWT expiration issue"

# Documentation
git commit -m "docs: update deployment guide"

# Refactoring
git commit -m "refactor(storage): simplify S3 client initialization"

# With body
git commit -m "feat(scheduler): add pause/resume functionality

Allow users to temporarily pause scheduled backups without
deleting the configuration. Adds new API endpoints and
updates the UI accordingly.

Closes #123"
```

### Commit Message Rules

- Use the imperative mood ("add" not "added" or "adds")
- Don't capitalize the first letter
- No period (.) at the end
- Keep the subject line under 50 characters
- Separate subject from body with a blank line
- Wrap body at 72 characters
- Reference issues and PRs in the footer

---

## Pull Request Process

### Before Submitting

- [ ] Code follows the style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests added/updated
- [ ] All tests pass
- [ ] No merge conflicts

### PR Title Format

Use the same format as commit messages:

```
feat(backup): add PostgreSQL 17 support
```

### PR Description Template

```markdown
## Description

Brief description of changes

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Related Issues

Closes #123

## How Has This Been Tested?

Describe testing done

## Screenshots (if applicable)

Add screenshots here

## Checklist

- [ ] My code follows the style guidelines
- [ ] I have performed a self-review
- [ ] I have commented my code where needed
- [ ] I have updated the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests
- [ ] All tests pass
```

### Review Process

1. **Automated Checks**: CI/CD pipeline runs tests and linters
2. **Code Review**: At least one maintainer reviews the code
3. **Feedback**: Address review comments
4. **Approval**: Maintainer approves the PR
5. **Merge**: Maintainer merges the PR

### After Merge

- Delete your feature branch
- Update your local repository
- Close related issues (if not automatically closed)

---

## Testing

### Backend Testing (Go)

```bash
# Run all tests
make test

# Run specific package
go test ./internal/backup/...

# Run with coverage
go test -cover ./...

# Generate coverage report
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

**Test Structure:**

```go
func TestBackupService_CreateBackup(t *testing.T) {
    // Setup
    mockDB := setupTestDB(t)
    service := NewBackupService(mockDB)

    // Execute
    backup, err := service.CreateBackup(testConfig)

    // Assert
    assert.NoError(t, err)
    assert.NotNil(t, backup)
    assert.Equal(t, "pending", backup.Status)
}
```

### Frontend Testing (React)

```bash
# Run tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage
pnpm test:coverage
```

**Test Example:**

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import { BackupList } from "./BackupList";

describe("BackupList", () => {
  it("displays backups when loaded", async () => {
    render(<BackupList databaseId="123" />);

    await waitFor(() => {
      expect(screen.getByText("Backup 1")).toBeInTheDocument();
    });
  });
});
```

### Integration Testing

```bash
# Start test environment
docker-compose up -d

# Run integration tests
make test-integration

# Cleanup
docker-compose down
```

---

## Documentation

### Code Documentation

**Go:**

- Add godoc comments for all exported functions, types, and packages
- Use complete sentences
- Start with the name of the element

```go
// BackupService handles database backup operations.
// It coordinates between the database, storage, and notification systems.
type BackupService struct {
    db *gorm.DB
    storage StorageClient
}

// CreateBackup initiates a new backup for the specified database.
// It returns the created backup record and any error encountered.
func (s *BackupService) CreateBackup(config *DatabaseConfig) (*Backup, error) {
    // ...
}
```

**TypeScript:**

```typescript
/**
 * Fetches backup history for a specific database.
 *
 * @param databaseId - The unique identifier of the database
 * @returns Promise resolving to an array of backup records
 * @throws {APIError} When the request fails
 */
export async function fetchBackups(databaseId: string): Promise<Backup[]> {
  // ...
}
```

### Updating Documentation

When making changes, update relevant documentation:

- **README.md**: Project overview and quick start
- **docs/DEPLOYMENT.md**: Deployment instructions
- **CONTRIBUTING.md**: This file
- **server/README.md**: Backend-specific docs
- **web/README.md**: Frontend-specific docs
- **Swagger comments**: API endpoint documentation

### Generating API Documentation

```bash
cd server
make swagger
```

This generates updated Swagger documentation from code comments.

---

## Community

### Getting Help

- 💬 **GitHub Discussions**: [Ask questions](https://github.com/monzim/dumpstation/discussions)
- 🐛 **GitHub Issues**: [Report bugs](https://github.com/monzim/dumpstation/issues)
- 📧 **Email**: [me@monzim.com](mailto:me@monzim.com)

### Staying Updated

- ⭐ Star the repository
- 👀 Watch for releases
- 📰 Check the [roadmap](ROADMAP.md)

### Recognition

Contributors will be:

- Listed in the [README.md](README.md)
- Mentioned in release notes
- Credited in commit history

---

## Questions?

Don't hesitate to ask! We're here to help:

- Open a [discussion](https://github.com/monzim/dumpstation/discussions)
- Join our community
- Reach out to maintainers

---

**Thank you for contributing to DumpStation! 🎉**

Your contributions make this project better for everyone.
