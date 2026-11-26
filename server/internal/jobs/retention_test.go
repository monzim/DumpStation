package jobs

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/monzim/db_proxy/v1/internal/models"
)

func backupsAged(now time.Time, days ...int) []*models.Backup {
	out := make([]*models.Backup, len(days))
	for i, d := range days {
		out[i] = &models.Backup{ID: uuid.New(), StartedAt: now.AddDate(0, 0, -d), Status: models.BackupStatusSuccess}
	}
	return out
}

func TestRetentionNeverDeletesNewest(t *testing.T) {
	now := time.Now()
	// Every backup is older than the 7-day window; the newest must survive.
	bs := backupsAged(now, 30, 40, 50)
	got := RetentionCandidates(bs, models.RotationPolicy{Type: models.RotationPolicyDays, Value: 7}, now)
	if len(got) != 2 || got[0] != bs[1] || got[1] != bs[2] {
		t.Fatalf("expected the two older backups, got %d", len(got))
	}
}

func TestRetentionCount(t *testing.T) {
	now := time.Now()
	bs := backupsAged(now, 0, 1, 2, 3, 4)
	got := RetentionCandidates(bs, models.RotationPolicy{Type: models.RotationPolicyCount, Value: 2}, now)
	if len(got) != 3 || got[0] != bs[2] {
		t.Fatalf("keep 2 should delete 3, got %d", len(got))
	}
	if got := RetentionCandidates(bs[:1], models.RotationPolicy{Type: models.RotationPolicyCount, Value: 1}, now); len(got) != 0 {
		t.Fatal("a single backup is never deleted")
	}
}

func TestParseSchedule(t *testing.T) {
	if _, err := ParseSchedule("0 2 * * *", "Asia/Dhaka"); err != nil {
		t.Fatal(err)
	}
	if _, err := ParseSchedule("@daily", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := ParseSchedule("0 2 * * *", "Mars/Olympus"); err == nil {
		t.Fatal("unknown time zone must fail")
	}
	if _, err := ParseSchedule("not cron", ""); err == nil {
		t.Fatal("invalid cron must fail")
	}
}

func TestObjectKeyIsServerControlled(t *testing.T) {
	db := &models.DatabaseConfig{ID: uuid.New(), Name: "../../etc/passwd x"}
	b := &models.Backup{ID: uuid.New(), StartedAt: time.Now()}
	k := ObjectKey(db, b)
	if want := "backups/" + db.ID.String() + "/"; k[:len(want)] != want {
		t.Fatalf("unexpected prefix %s", k)
	}
	for _, bad := range []string{"..", " "} {
		if contains(k[len("backups/"+db.ID.String()+"/"):], bad) {
			t.Fatalf("unsafe characters in key %s", k)
		}
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
