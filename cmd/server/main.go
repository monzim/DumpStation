package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/monzim/db_proxy/v1/internal/auth"
	"github.com/monzim/db_proxy/v1/internal/backup"
	"github.com/monzim/db_proxy/v1/internal/config"
	"github.com/monzim/db_proxy/v1/internal/database"
	"github.com/monzim/db_proxy/v1/internal/handlers"
	"github.com/monzim/db_proxy/v1/internal/notification"
	"github.com/monzim/db_proxy/v1/internal/repository"
	"github.com/monzim/db_proxy/v1/internal/scheduler"
)

func main() {
	log.Println("Starting PostgreSQL Backup Service...")

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// Initialize database
	db, err := database.New(cfg.Database.GetDSN())
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	log.Println("Database connection established")

	// Run migrations
	if err := db.RunMigrations("migrations"); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	// Initialize repository
	repo := repository.New(db.DB)

	// Initialize JWT manager
	jwtMgr := auth.NewJWTManager(cfg.JWT.Secret, cfg.JWT.Expiration)

	// Initialize backup service
	backupSvc := backup.NewService(repo)

	// Initialize scheduler
	sched := scheduler.NewScheduler(repo, backupSvc)
	if err := sched.Start(); err != nil {
		log.Fatalf("Failed to start scheduler: %v", err)
	}
	defer sched.Stop()

	// Initialize Discord notifier
	var notifier *notification.DiscordNotifier
	if cfg.Discord.WebhookURL != "" {
		notifier = notification.NewDiscordNotifier(cfg.Discord.WebhookURL, "PostgreSQL Backup Service")
		notifier.SendMessage("🚀 **PostgreSQL Backup Service Started**\n✅ System is now online and ready to manage backups.")
	}

	// Initialize handlers
	otpExpiry := time.Duration(cfg.Discord.OTPExpiration) * time.Minute
	h := handlers.New(repo, jwtMgr, backupSvc, sched, notifier, otpExpiry)

	// Setup routes
	router := handlers.SetupRoutes(h, jwtMgr)

	// Start HTTP server
	addr := cfg.Server.Host + ":" + cfg.Server.Port
	srv := &http.Server{
		Addr:         addr,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
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

	// Send shutdown notification
	if notifier != nil {
		notifier.SendMessage("⏹️ **PostgreSQL Backup Service Shutting Down**\n👋 System is going offline.")
	}

	// Graceful shutdown with 30 second timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited gracefully")
}
