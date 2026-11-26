//go:build linux

package pgexec

import (
	"os/exec"
	"syscall"
)

// bindToParent kills the child if the agent/server process dies, so no
// orphaned pg_dump keeps running after a crash.
func bindToParent(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Pdeathsig: syscall.SIGKILL}
}
