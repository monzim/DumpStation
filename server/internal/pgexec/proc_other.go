//go:build !linux

package pgexec

import "os/exec"

func bindToParent(cmd *exec.Cmd) {}
