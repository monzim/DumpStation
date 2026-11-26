package jobs

import (
	"fmt"
	"log"
	"time"

	"github.com/monzim/db_proxy/v1/internal/models"
	"github.com/monzim/db_proxy/v1/internal/pgexec"
	"github.com/robfig/cron/v3"
)

// reconcile repairs state left behind by a previous process: direct jobs
// cannot survive a restart (their pg_dump died with the process), so they
// are failed with an explicit "interrupted" cause. Agent jobs are durable
// and continue through the lease mechanism.
func (o *Orchestrator) reconcile() {
	backups, err := o.repo.ListActiveBackups()
	if err != nil {
		log.Printf("[jobs] reconcile backups: %v", err)
	}
	for _, b := range backups {
		if b.Executor == models.ExecutionAgent {
			continue
		}
		o.failBackup(b.ID, nil, &pgexec.Error{Code: pgexec.CodeInterrupted, Message: "Interrupted: the DumpStation server restarted while this backup was in progress"})
	}
	restores, err := o.repo.ListActiveRestores()
	if err != nil {
		log.Printf("[jobs] reconcile restores: %v", err)
	}
	for _, r := range restores {
		if r.Executor == models.ExecutionAgent {
			continue
		}
		o.finishRestore(r.ID, &pgexec.Error{Code: pgexec.CodeInterrupted, Message: "Interrupted: the DumpStation server restarted while this restore was in progress"})
	}
	o.checkMissedSchedules()
}

func (o *Orchestrator) maintenanceLoop() {
	t := time.NewTicker(15 * time.Second)
	defer t.Stop()
	missedTick := 0
	for {
		select {
		case <-o.ctx.Done():
			return
		case <-t.C:
			o.withRecover("maintenance", func() {
				o.expireLeases()
				o.expireQueued()
				o.trackAgentConnectivity()
				missedTick++
				if missedTick%40 == 0 { // every 10 minutes
					o.checkMissedSchedules()
				}
			})
		}
	}
}

// expireLeases handles agents that stopped reporting on a leased job
// (crash, restart, network loss). Backups are retried with backoff up to
// MaxAttempts; restores are never retried automatically because a partial
// restore may have modified the target.
func (o *Orchestrator) expireLeases() {
	jobs, err := o.repo.ListExpiredLeases(time.Now())
	if err != nil {
		return
	}
	for _, j := range jobs {
		o.abortUpload(j)
		switch {
		case j.Kind == models.AgentJobBackup && j.Attempts < j.MaxAttempts && j.BackupID != nil:
			backoff := time.Duration(j.Attempts*j.Attempts) * 30 * time.Second
			ok, _ := o.repo.UpdateAgentJobFields(j.ID, j.LeaseToken, map[string]any{
				"status": models.AgentJobQueued, "lease_token": "", "lease_expires_at": nil,
				"upload_id": "", "object_key": "", "available_at": time.Now().Add(backoff),
			})
			if !ok {
				continue
			}
			_, _ = o.repo.TransitionBackup(*j.BackupID, []models.BackupStatus{models.BackupStatusRunning}, map[string]any{
				"status": models.BackupStatusPending, "stage": models.StageQueued,
			})
			o.event(models.JobKindBackup, *j.BackupID, "warning", models.StageQueued,
				fmt.Sprintf("Agent stopped reporting progress; retrying in %s (attempt %d of %d used)", backoff, j.Attempts, j.MaxAttempts))
		default:
			ok, _ := o.repo.UpdateAgentJobFields(j.ID, j.LeaseToken, map[string]any{
				"status": models.AgentJobFailed, "error_message": "lease expired", "completed_at": time.Now(),
			})
			if !ok {
				continue
			}
			perr := &pgexec.Error{Code: pgexec.CodeAgentLost, Message: "The agent stopped responding while running this job"}
			if j.BackupID != nil {
				perr.Message += fmt.Sprintf(" (after %d attempts)", j.Attempts)
				o.failBackup(*j.BackupID, nil, perr)
			}
			if j.RestoreJobID != nil {
				o.finishRestore(*j.RestoreJobID, perr)
			}
		}
	}
}

func (o *Orchestrator) expireQueued() {
	jobs, err := o.repo.ListExpiredQueued(time.Now())
	if err != nil {
		return
	}
	for _, j := range jobs {
		ok, _ := o.repo.UpdateAgentJobFields(j.ID, "", map[string]any{"status": models.AgentJobExpired, "completed_at": time.Now()})
		if !ok {
			continue
		}
		perr := &pgexec.Error{Code: pgexec.CodeAgentUnavailable, Message: "The assigned agent did not pick up this job before it expired; check that the agent is running and connected"}
		if j.BackupID != nil {
			o.failBackup(*j.BackupID, nil, perr)
		}
		if j.RestoreJobID != nil {
			o.finishRestore(*j.RestoreJobID, perr)
		}
	}
}

// trackAgentConnectivity emits connected/disconnected events once per transition.
func (o *Orchestrator) trackAgentConnectivity() {
	agents, err := o.repo.ListAllAgents()
	if err != nil {
		return
	}
	now := time.Now()
	for _, a := range agents {
		if a.Status == models.AgentStatusRevoked || a.Status == models.AgentStatusPending {
			continue
		}
		online := a.IsOnline(now)
		if online == a.OnlineNotified {
			continue
		}
		_ = o.repo.UpdateAgentFields(a.ID, map[string]any{"online_notified": online})
		aid := a.ID
		if online {
			o.logActivity(&a.UserID, models.ActionAgentConnected, models.LogLevelSuccess, "agent", &aid, a.Name,
				fmt.Sprintf("Agent %q connected", a.Name), map[string]any{"version": a.Version, "hostname": a.Hostname})
			o.notifyAgentDatabases(a, fmt.Sprintf("🟢 DumpStation agent **%s** is back online.", a.Name))
			continue
		}
		o.logActivity(&a.UserID, models.ActionAgentDisconnected, models.LogLevelWarning, "agent", &aid, a.Name,
			fmt.Sprintf("Agent %q disconnected (last seen %s)", a.Name, a.LastSeenAt.Format(time.RFC3339)), nil)
		o.notifyAgentDatabases(a, fmt.Sprintf("🔴 DumpStation agent **%s** went offline. Backups assigned to it will wait until it reconnects.", a.Name))
		// Mark waiting backups so the UI shows why they are not running.
		if dbs, err := o.repo.ListDatabasesForAgent(a.ID); err == nil {
			for _, db := range dbs {
				if b, _ := o.repo.GetActiveBackupForDatabase(db.ID); b != nil && b.Status == models.BackupStatusPending {
					o.setStage(b.ID, models.StageWaitingAgent)
				}
			}
		}
	}
}

func (o *Orchestrator) notifyAgentDatabases(a *models.Agent, msg string) {
	dbs, err := o.repo.ListDatabasesForAgent(a.ID)
	if err != nil {
		return
	}
	seen := map[string]bool{}
	for _, db := range dbs {
		if db.NotificationID == nil || seen[db.NotificationID.String()] {
			continue
		}
		seen[db.NotificationID.String()] = true
		o.notifyText(db, msg)
	}
}

var cronParser = cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor)

// ParseSchedule parses a 5-field cron expression or descriptor in a time zone.
func ParseSchedule(expr, tz string) (cron.Schedule, error) {
	if tz != "" {
		if _, err := time.LoadLocation(tz); err != nil {
			return nil, fmt.Errorf("unknown time zone %q", tz)
		}
		expr = "CRON_TZ=" + tz + " " + expr
	}
	return cronParser.Parse(expr)
}

// checkMissedSchedules detects scheduled runs that produced no backup
// (typically because the server was down) and reports each once.
func (o *Orchestrator) checkMissedSchedules() {
	dbs, err := o.repo.ListEnabledDatabases()
	if err != nil {
		return
	}
	now := time.Now()
	const grace = 10 * time.Minute
	for _, db := range dbs {
		sched, err := ParseSchedule(db.Schedule, db.Timezone)
		if err != nil {
			continue
		}
		// Find the latest fire time in (now-48h, now-grace].
		var last time.Time
		t := sched.Next(now.Add(-48 * time.Hour))
		for i := 0; i < 5000 && !t.IsZero() && !t.After(now.Add(-grace)); i++ {
			last = t
			t = sched.Next(t)
		}
		if last.IsZero() || last.Before(db.CreatedAt) || last.Before(db.UpdatedAt) {
			continue
		}
		if prev, ok := o.missed[db.ID]; ok && !prev.Before(last) {
			continue
		}
		has, err := o.repo.HasBackupBetween(db.ID, last.Add(-time.Minute), last.Add(grace))
		if err != nil || has {
			continue
		}
		o.missed[db.ID] = last
		did := db.ID
		o.logActivity(&db.UserID, models.ActionBackupMissed, models.LogLevelWarning, "database", &did, db.Name,
			fmt.Sprintf("Scheduled backup of %q at %s did not run", db.Name, last.Format(time.RFC3339)),
			map[string]any{"scheduled_for": last})
		o.notifyText(db, fmt.Sprintf("⚠️ Scheduled backup of **%s** at %s did not run.", db.Name, last.Format(time.RFC1123)))
	}
}
