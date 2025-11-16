package scheduler

import (
	"log"

	"github.com/google/uuid"
	"github.com/monzim/db_proxy/v1/internal/backup"
	"github.com/monzim/db_proxy/v1/internal/models"
	"github.com/monzim/db_proxy/v1/internal/repository"
	"github.com/robfig/cron/v3"
)

// Scheduler manages scheduled backups
type Scheduler struct {
	cron      *cron.Cron
	repo      *repository.Repository
	backupSvc *backup.Service
	jobMap    map[uuid.UUID]cron.EntryID // Maps database ID to cron entry ID
}

// NewScheduler creates a new scheduler
func NewScheduler(repo *repository.Repository, backupSvc *backup.Service) *Scheduler {
	return &Scheduler{
		cron:      cron.New(),
		repo:      repo,
		backupSvc: backupSvc,
		jobMap:    make(map[uuid.UUID]cron.EntryID),
	}
}

// Start starts the scheduler and loads all database configurations
func (s *Scheduler) Start() error {
	log.Println("Starting backup scheduler...")

	// Load all database configurations
	configs, err := s.repo.ListDatabaseConfigs()
	if err != nil {
		return err
	}

	// Schedule each database
	for _, config := range configs {
		if config.Enabled && !config.Paused {
			if err := s.AddJob(config); err != nil {
				log.Printf("Failed to schedule backup for %s: %v", config.Name, err)
			}
		}
	}

	s.cron.Start()
	log.Printf("Scheduler started with %d active jobs", len(s.jobMap))

	return nil
}

// Stop stops the scheduler
func (s *Scheduler) Stop() {
	log.Println("Stopping backup scheduler...")
	s.cron.Stop()
}

// AddJob adds a new backup job to the scheduler
func (s *Scheduler) AddJob(config *models.DatabaseConfig) error {
	// Remove existing job if any
	s.RemoveJob(config.ID)

	if !config.Enabled || config.Paused {
		return nil
	}

	// Capture config in closure
	dbConfig := config

	entryID, err := s.cron.AddFunc(config.Schedule, func() {
		log.Printf("Executing scheduled backup for: %s", dbConfig.Name)
		if err := s.backupSvc.ExecuteBackup(dbConfig); err != nil {
			log.Printf("Scheduled backup failed for %s: %v", dbConfig.Name, err)
		}
	})

	if err != nil {
		return err
	}

	s.jobMap[config.ID] = entryID
	log.Printf("Scheduled backup for %s with cron: %s", config.Name, config.Schedule)

	return nil
}

// RemoveJob removes a backup job from the scheduler
func (s *Scheduler) RemoveJob(dbID uuid.UUID) {
	if entryID, exists := s.jobMap[dbID]; exists {
		s.cron.Remove(entryID)
		delete(s.jobMap, dbID)
		log.Printf("Removed backup job for database ID: %s", dbID)
	}
}

// UpdateJob updates an existing backup job
func (s *Scheduler) UpdateJob(config *models.DatabaseConfig) error {
	s.RemoveJob(config.ID)
	return s.AddJob(config)
}
