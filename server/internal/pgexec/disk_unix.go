//go:build unix

package pgexec

import "syscall"

// FreeBytes returns free space available to unprivileged users at path.
func FreeBytes(path string) (uint64, bool) {
	var st syscall.Statfs_t
	if err := syscall.Statfs(path, &st); err != nil {
		return 0, false
	}
	return st.Bavail * uint64(st.Bsize), true
}
