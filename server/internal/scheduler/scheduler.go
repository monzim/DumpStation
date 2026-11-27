// Package scheduler fires scheduled backups. The scheduler only decides
// *when* a backup should exist; the jobs orchestrator decides where it runs
// (directly on the server or on an agent).
package scheduler

import (
	"errors"
	"log"
	"runtime/debug"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/monzim/db_proxy/v1/internal/jobs"
	"github.com/monzim/db_proxy/v1/internal/models"
	"github.com/monzim/db_proxy/v1/internal/repository"
	"github.com/robfig/cron/v3"
)

// Scheduler manages cron entries per database.
type Scheduler struct {
	mu     sync.Mutex
	cron   *cron.Cron
	repo   *repository.Repository
	orch   *jobs.Orchestrator
	jobMap map[uuid.UUID]cron.EntryID
}

// NewScheduler creates a scheduler.
func NewScheduler(repo *repository.Repository, orch *jobs.Orchestrator) *Scheduler {
	return &Scheduler{
		cron:   cron.New(cron.WithChain(cron.Recover(cron.DefaultLogger))),
		repo:   repo,
		orch:   orch,
		jobMap: make(map[uuid.UUID]cron.EntryID),
	}
}

// Start loads every enabled database and starts the cron runner.
func (s *Scheduler) Start() error {
	configs, err := s.repo.ListDatabaseConfigs()
	if err != nil {
		return err
	}
	for _, c := range configs {
		if err := s.AddJob(c); err != nil {
			log.Printf("[scheduler] %s: %v", c.Name, err)
		}
	}
	s.cron.Start()
	log.Printf("[scheduler] started with %d active schedules", len(s.jobMap))
	return nil
}

// Stop stops firing new jobs.
func (s *Scheduler) Stop() { <-s.cron.Stop().Done() }

// AddJob (re)registers the schedule for a database.
func (s *Scheduler) AddJob(config *models.DatabaseConfig) error {
	s.RemoveJob(config.ID)
	if !config.Enabled || config.Paused {
		return nil
	}
	sched, err := jobs.ParseSchedule(config.Schedule, config.Timezone)
	if err != nil {
		return err
	}
	dbID := config.ID
	entryID := s.cron.Schedule(sched, cron.FuncJob(func() {
		runJobWithRecover(dbID.String(), func() error { return s.fire(dbID) })
	}))
	s.mu.Lock()
	s.jobMap[config.ID] = entryID
	s.mu.Unlock()
	return nil
}

// fire loads the current configuration (not a stale snapshot) and enqueues.
func (s *Scheduler) fire(dbID uuid.UUID) error {
	db, err := s.repo.GetDatabaseConfig(dbID)
	if err != nil {
		return err
	}
	if db == nil || !db.Enabled || db.Paused {
		s.RemoveJob(dbID)
		return nil
	}
	_, err = s.orch.EnqueueBackup(db, models.TriggerScheduled, nil)
	if errors.Is(err, jobs.ErrBackupInProgress) {
		log.Printf("[scheduler] skipping %s: previous backup still active", db.Name)
		return nil
	}
	return err
}

// RemoveJob removes a database's schedule.
func (s *Scheduler) RemoveJob(dbID uuid.UUID) {
	s.mu.Lock()
	entryID, exists := s.jobMap[dbID]
	delete(s.jobMap, dbID)
	s.mu.Unlock()
	if exists {
		s.cron.Remove(entryID)
	}
}

// UpdateJob re-registers a database's schedule.
func (s *Scheduler) UpdateJob(config *models.DatabaseConfig) error { return s.AddJob(config) }

// NextRun returns the next fire time of a database, if scheduled.
func (s *Scheduler) NextRun(dbID uuid.UUID) *time.Time {
	s.mu.Lock()
	id, ok := s.jobMap[dbID]
	s.mu.Unlock()
	if !ok {
		return nil
	}
	e := s.cron.Entry(id)
	if e.Next.IsZero() {
		return nil
	}
	n := e.Next
	return &n
}

// runJobWithRecover runs fn and contains any panic so the cron goroutine survives.
func runJobWithRecover(name string, fn func() error) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("PANIC in scheduled job %q: %v\n%s", name, r, debug.Stack())
		}
	}()
	if err := fn(); err != nil {
		log.Printf("Scheduled job %q failed: %v", name, err)
	}
}
