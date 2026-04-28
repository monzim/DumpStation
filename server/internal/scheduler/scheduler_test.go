package scheduler

import (
	"errors"
	"testing"
)

// TestRunJobWithRecover_PanicContained ensures that a panic inside the job
// function does not propagate out of runJobWithRecover. Without recover the
// cron runner goroutine would die and silently kill ALL scheduled jobs.
func TestRunJobWithRecover_PanicContained(t *testing.T) {
	t.Parallel()

	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("panic escaped runJobWithRecover: %v", r)
		}
	}()

	runJobWithRecover("panicking-job", func() error {
		panic("simulated backup explosion")
	})
}

// TestRunJobWithRecover_ErrorReturned ensures normal errors are not treated
// as panics — they should be logged and the function returns cleanly.
func TestRunJobWithRecover_ErrorReturned(t *testing.T) {
	t.Parallel()

	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("unexpected panic for normal error path: %v", r)
		}
	}()

	runJobWithRecover("erroring-job", func() error {
		return errors.New("normal failure")
	})
}

// TestRunJobWithRecover_Success exercises the happy path.
func TestRunJobWithRecover_Success(t *testing.T) {
	t.Parallel()

	called := false
	runJobWithRecover("happy-job", func() error {
		called = true
		return nil
	})

	if !called {
		t.Fatal("job function was not invoked")
	}
}
