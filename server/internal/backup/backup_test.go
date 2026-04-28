package backup

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// TestTruncateAndRewind verifies that bytes from a failed first write are
// wiped before a retry, so the file ends up containing ONLY the second
// write's bytes — not first ++ second concatenated.
func TestTruncateAndRewind(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	path := filepath.Join(dir, "out.bin")
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	t.Cleanup(func() { _ = f.Close() })

	if _, err := f.WriteString("PARTIAL_FIRST_ATTEMPT_OUTPUT"); err != nil {
		t.Fatalf("first write: %v", err)
	}

	if err := truncateAndRewind(f); err != nil {
		t.Fatalf("truncateAndRewind: %v", err)
	}

	const second = "CLEAN_SECOND_ATTEMPT"
	if _, err := f.WriteString(second); err != nil {
		t.Fatalf("second write: %v", err)
	}
	if err := f.Sync(); err != nil {
		t.Fatalf("sync: %v", err)
	}

	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	if string(got) != second {
		t.Fatalf("file contents = %q, want exactly %q (no PARTIAL prefix)", got, second)
	}
	if strings.Contains(string(got), "PARTIAL") {
		t.Fatalf("partial first-attempt bytes leaked into retry output: %q", got)
	}
}

// TestOSCreateTempUniqueness asserts that os.CreateTemp with a glob pattern
// hands out unique paths even under heavy concurrency. This is the property
// the backup service relies on to avoid same-second collisions.
func TestOSCreateTempUniqueness(t *testing.T) {
	t.Parallel()

	const n = 50
	paths := make(chan string, n)
	var wg sync.WaitGroup
	wg.Add(n)

	for range n {
		go func() {
			defer wg.Done()
			f, err := os.CreateTemp("", "dumpstation-*.bak")
			if err != nil {
				t.Errorf("CreateTemp: %v", err)
				return
			}
			paths <- f.Name()
			_ = f.Close()
			_ = os.Remove(f.Name())
		}()
	}

	wg.Wait()
	close(paths)

	seen := make(map[string]bool, n)
	for p := range paths {
		if seen[p] {
			t.Fatalf("duplicate temp path: %s", p)
		}
		seen[p] = true
	}
	if len(seen) != n {
		t.Fatalf("got %d unique paths, want %d", len(seen), n)
	}
}
