package cleanup

import (
	"log"
	"time"

	"github.com/monzim/db_proxy/v1/internal/repository"
)

// Service handles cleanup of old activity logs
type Service struct {
	repo      *repository.Repository
	ticker    *time.Ticker
	stopChan  chan bool
	retention time.Duration
}

// NewService creates a new cleanup service
// retention specifies how old logs should be before deletion (e.g., 60 days)
func NewService(repo *repository.Repository, retention time.Duration) *Service {
	return &Service{
		repo:      repo,
		retention: retention,
		stopChan:  make(chan bool),
	}
}

// Start begins the background cleanup process
// It runs daily at 2 AM to clean up old activity logs
func (s *Service) Start() error {
	log.Println("[CLEANUP] Starting activity log cleanup service...")
	log.Printf("[CLEANUP] Retention period: %.0f days", s.retention.Hours()/24)

	// Run initial cleanup on startup
	go s.runCleanup()

	// Calculate duration until next 2 AM
	now := time.Now()
	nextRun := time.Date(now.Year(), now.Month(), now.Day(), 2, 0, 0, 0, now.Location())
	if now.After(nextRun) {
		nextRun = nextRun.Add(24 * time.Hour)
	}
	durationUntilNextRun := nextRun.Sub(now)

	log.Printf("[CLEANUP] Next cleanup scheduled at: %v", nextRun.Format(time.RFC3339))

	// Start a goroutine to run cleanup daily
	go func() {
		// Wait until 2 AM
		time.Sleep(durationUntilNextRun)

		// Create ticker for daily execution (24 hours)
		s.ticker = time.NewTicker(24 * time.Hour)
		defer s.ticker.Stop()

		// Run cleanup at 2 AM every day
		for {
			select {
			case <-s.ticker.C:
				s.runCleanup()
			case <-s.stopChan:
				log.Println("[CLEANUP] Stopping activity log cleanup service")
				return
			}
		}
	}()

	log.Println("[CLEANUP] ✅ Activity log cleanup service started")
	return nil
}

// Stop stops the cleanup service
func (s *Service) Stop() {
	if s.ticker != nil {
		s.stopChan <- true
	}
}

// runCleanup performs the actual cleanup of old logs
func (s *Service) runCleanup() {
	log.Println("[CLEANUP] Running activity log cleanup...")

	cutoffTime := time.Now().Add(-s.retention)
	log.Printf("[CLEANUP] Deleting logs older than: %v", cutoffTime.Format(time.RFC3339))

	deleted, err := s.repo.DeleteOldActivityLogs(cutoffTime)
	if err != nil {
		log.Printf("[CLEANUP] ❌ Failed to delete old activity logs: %v", err)
		return
	}

	if deleted > 0 {
		log.Printf("[CLEANUP] ✅ Successfully deleted %d old activity log(s)", deleted)
	} else {
		log.Println("[CLEANUP] No old activity logs to delete")
	}
}

// ForceCleanup allows manual triggering of cleanup (useful for testing or maintenance)
func (s *Service) ForceCleanup() {
	log.Println("[CLEANUP] Manual cleanup triggered")
	s.runCleanup()
}
