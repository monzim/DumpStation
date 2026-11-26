package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/monzim/db_proxy/v1/internal/agentapi"
	"github.com/monzim/db_proxy/v1/internal/auth"
	"github.com/monzim/db_proxy/v1/internal/cleanup"
	"github.com/monzim/db_proxy/v1/internal/config"
	"github.com/monzim/db_proxy/v1/internal/crypto"
	"github.com/monzim/db_proxy/v1/internal/database"
	"github.com/monzim/db_proxy/v1/internal/dbadmin"
	"github.com/monzim/db_proxy/v1/internal/handlers"
	"github.com/monzim/db_proxy/v1/internal/jobs"
	"github.com/monzim/db_proxy/v1/internal/models"
	"github.com/monzim/db_proxy/v1/internal/notification"
	"github.com/monzim/db_proxy/v1/internal/pgexec"
	"github.com/monzim/db_proxy/v1/internal/repository"
	"github.com/monzim/db_proxy/v1/internal/scheduler"
	"github.com/monzim/db_proxy/v1/internal/secret"
)

// @title DumpStation API
// @version 1.0
// @description A RESTful API service for managing PostgreSQL database backups with automated scheduling, multiple storage backends (S3/R2), and Discord notifications.
// @termsOfService http://swagger.io/terms/

// @contact.name API Support
// @contact.email support@example.com

// @license.name MIT
// @license.url https://opensource.org/licenses/MIT

// @host localhost:8080
// @BasePath /api/v1

// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
// @description Type "Bearer" followed by a space and the JWT token.

func main() {
	log.Println("Starting DumpStation...")

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// At-rest encryption for configuration secrets (must precede any DB read
	// of encrypted columns).
	cipher, err := crypto.NewCipher(cfg.Secret.Key)
	if err != nil {
		log.Fatalf("Failed to initialize secret cipher: %v", err)
	}
	secret.Configure(cipher)

	// Initialize database
	db, err := database.New(cfg.Database.GetDSN())
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	log.Println("Database connection established")

	// Run GORM auto-migration
	if err := db.AutoMigrate(); err != nil {
		log.Fatalf("Failed to run auto-migration: %v", err)
	}

	// Initialize GORM repository
	repo := repository.NewGORM(db.DB)

	// Ensure system user exists (single-user system)
	if err := ensureSystemUser(repo); err != nil {
		log.Fatalf("Failed to ensure system user exists: %v", err)
	}

	// Seed demo data (creates demo user and sample data)
	if err := database.SeedDemoData(repo); err != nil {
		log.Printf("[DEMO] ⚠️  Failed to seed demo data: %v", err)
		// Don't fatal - demo data is optional
	}

	// Initialize JWT manager
	jwtMgr := auth.NewJWTManager(cfg.JWT.Secret, cfg.JWT.Expiration)

	// Job orchestrator (direct + agent execution)
	runner := pgexec.NewRunner(cfg.Jobs.TempDir)
	if policy, err := pgexec.CIDRPolicy(cfg.Jobs.AllowedCIDRs); err != nil {
		log.Fatalf("DIRECT_ALLOWED_CIDRS: %v", err)
	} else if policy != nil {
		runner.HostPolicy = policy
		dbadmin.HostPolicy = policy
		log.Printf("Direct database connections restricted to: %s", cfg.Jobs.AllowedCIDRs)
	}
	log.Printf("PostgreSQL client tools available: %v", runner.Tools.Majors())
	orch := jobs.New(repo, runner, jobs.Config{
		DirectConcurrency: cfg.Jobs.DirectConcurrency,
		JobTimeout:        time.Duration(cfg.Jobs.JobTimeoutMinutes) * time.Minute,
		QueueTTL:          time.Duration(cfg.Jobs.QueueTTLMinutes) * time.Minute,
		LeaseTTL:          time.Duration(cfg.Jobs.LeaseTTLSeconds) * time.Second,
		MaxAttempts:       cfg.Jobs.MaxAttempts,
		TempDir:           cfg.Jobs.TempDir,
		MinFreeBytes:      uint64(cfg.Jobs.MinFreeMB) << 20,
	})
	orch.Start()

	// Initialize scheduler
	sched := scheduler.NewScheduler(repo, orch)
	if err := sched.Start(); err != nil {
		log.Fatalf("Failed to start scheduler: %v", err)
	}

	// Initialize activity log cleanup service (60 days retention)
	cleanupSvc := cleanup.NewService(repo, 60*24*time.Hour)
	if err := cleanupSvc.Start(); err != nil {
		log.Fatalf("Failed to start cleanup service: %v", err)
	}
	defer cleanupSvc.Stop()

	// Initialize Discord notifier
	var notifier *notification.DiscordNotifier
	if cfg.Discord.WebhookURL != "" {
		notifier = notification.NewDiscordNotifier(cfg.Discord.WebhookURL, "DumpStation")
		notifier.SendMessage("🚀 **DumpStation Started**\n✅ System is now online and ready to manage backups.")
	}

	// Log system startup
	if err := repo.LogActivity(nil, models.ActionSystemStartup, models.LogLevelInfo,
		"system", nil, "System",
		"DumpStation started successfully", "", ""); err != nil {
		log.Printf("[ACTIVITY_LOG] ⚠️  Failed to log system startup: %v", err)
	}

	// Initialize handlers
	otpExpiry := time.Duration(cfg.Discord.OTPExpiration) * time.Minute
	h := handlers.New(repo, jwtMgr, orch, sched, notifier, otpExpiry,
		cfg.Turnstile.Enabled, cfg.Turnstile.SecretKey, cfg.Turnstile.Timeout,
		cipher, cfg)

	// Initialize TOTP manager for 2FA
	totpConfig := auth.DefaultTOTPConfig()
	totpConfig.Issuer = "DumpStation" // Customize issuer name
	totpMgr := auth.NewTOTPManager(totpConfig)

	// Setup routes with 2FA support
	trustProxy := os.Getenv("TRUST_PROXY_HEADERS") == "true"
	router := handlers.SetupRoutesWithTOTP(h, jwtMgr, cfg, totpMgr, agentapi.New(repo, orch, trustProxy))

	// Start HTTP server
	addr := cfg.Server.Host + ":" + cfg.Server.Port
	srv := &http.Server{
		Addr:              addr,
		Handler:           router,
		ReadHeaderTimeout: 15 * time.Second,
		// No global read/write timeout: agent long-polls hold requests for
		// up to 30s and proxied artifact transfers stream for as long as the
		// backup takes. Handlers bound their own work.
		IdleTimeout: 120 * time.Second,
	}

	// Start server in a goroutine
	go func() {
		log.Printf("Server listening on %s", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	// Log system shutdown
	if err := repo.LogActivity(nil, models.ActionSystemShutdown, models.LogLevelInfo,
		"system", nil, "System",
		"DumpStation shutting down", "", ""); err != nil {
		log.Printf("[ACTIVITY_LOG] ⚠️  Failed to log system shutdown: %v", err)
	}

	// Send shutdown notification
	if notifier != nil {
		notifier.SendMessage("⏹️ **DumpStation Shutting Down**\n👋 System is going offline.")
	}

	// Graceful shutdown with 30 second timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	sched.Stop()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("Server forced to shutdown: %v", err)
	}
	orch.Stop(20 * time.Second)

	log.Println("Server exited gracefully")
}

// ensureSystemUser ensures the single system user exists in the database
// This is called at startup to seed the default user if not present
func ensureSystemUser(repo *repository.Repository) error {
	// Get system user credentials from environment with defaults
	systemUsername := os.Getenv("SYSTEM_USERNAME")
	if systemUsername == "" {
		systemUsername = "root"
	}
	systemEmail := os.Getenv("SYSTEM_EMAIL")
	if systemEmail == "" {
		systemEmail = "root@dumpstation.monzim.com"
	}

	// Check if system user already exists
	user, err := repo.GetSystemUser()
	if err != nil {
		return err
	}

	if user != nil {
		log.Printf("[AUTH] ✅ System user exists: %s (%s)", user.DiscordUsername, user.Email)
		return ensureAdministrator(repo, systemUsername)
	}

	// Create the system user using raw SQL since CreateUser is disabled
	log.Printf("[AUTH] 🔧 Creating system user: %s (%s)", systemUsername, systemEmail)
	if err := repo.SeedSystemUser(systemUsername, systemEmail); err != nil {
		return err
	}

	log.Printf("[AUTH] ✅ System user created successfully")
	return ensureAdministrator(repo, systemUsername)
}

// ensureAdministrator guarantees at least one administrator exists: when
// none does (Discord-OTP-only installs), the configured system user is
// promoted so user management stays reachable.
func ensureAdministrator(repo *repository.Repository, systemUsername string) error {
	n, err := repo.CountAdmins()
	if err != nil || n > 0 {
		return err
	}
	u, err := repo.GetUserByUsernameOrEmail(systemUsername)
	if err != nil || u == nil || u.IsDemo {
		return err
	}
	log.Printf("[AUTH] Promoting system user %q to administrator (no administrator existed)", systemUsername)
	return repo.SetUserAdmin(u.ID, true)
}
