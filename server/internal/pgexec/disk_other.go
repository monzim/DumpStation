//go:build !unix

package pgexec

// FreeBytes is not implemented on this platform.
func FreeBytes(path string) (uint64, bool) { return 0, false }
