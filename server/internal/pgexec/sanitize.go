package pgexec

import "regexp"

var (
	uriCredRe = regexp.MustCompile(`([a-zA-Z][a-zA-Z0-9+.-]*://[^:/@\s]+):[^@\s]+@`)
	kvPassRe  = regexp.MustCompile(`(?i)(password\s*[=:]\s*)\S+`)
)
