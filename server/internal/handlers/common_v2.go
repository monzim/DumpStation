package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
)

// reqCtx carries the authenticated caller.
type reqCtx struct {
	UserID  uuid.UUID
	IsAdmin bool
	IsDemo  bool
	IP      string
}

// caller extracts the authenticated user or writes 401.
func caller(w http.ResponseWriter, r *http.Request) (*reqCtx, bool) {
	uid := getUserIDFromContext(r)
	if uid == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return nil, false
	}
	return &reqCtx{UserID: *uid, IsAdmin: getIsAdminFromContext(r), IsDemo: isDemoUserFromContext(r), IP: getIPAddress(r)}, true
}

// writer is caller plus a demo-account write guard.
func writer(w http.ResponseWriter, r *http.Request) (*reqCtx, bool) {
	c, ok := caller(w, r)
	if !ok {
		return nil, false
	}
	if c.IsDemo {
		writeError(w, http.StatusForbidden, "the demo account is read-only")
		return nil, false
	}
	return c, true
}

// decodeBody decodes a JSON body (max 1 MiB) and validates it.
func (h *Handler) decodeBody(w http.ResponseWriter, r *http.Request, v any, validate bool) bool {
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(v); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON in request body: "+err.Error())
		return false
	}
	if !validate {
		return true
	}
	if verr, err := h.validator.Validate(v); verr != nil {
		writeValidationError(w, verr)
		return false
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "validation error")
		return false
	}
	return true
}

func pathID(w http.ResponseWriter, r *http.Request, key string) (uuid.UUID, bool) {
	id, err := uuid.Parse(mux.Vars(r)[key])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid "+key)
		return uuid.Nil, false
	}
	return id, true
}

func queryInt(r *http.Request, key string, def int) int {
	if v, err := strconv.Atoi(r.URL.Query().Get(key)); err == nil {
		return v
	}
	return def
}

func queryUUID(r *http.Request, key string) *uuid.UUID {
	if v := r.URL.Query().Get(key); v != "" {
		if id, err := uuid.Parse(v); err == nil {
			return &id
		}
	}
	return nil
}

// Page is a paginated list response.
type Page[T any] struct {
	Items  []T   `json:"items"`
	Total  int64 `json:"total"`
	Limit  int   `json:"limit"`
	Offset int   `json:"offset"`
}

func jsonUnmarshal(s string, v any) error { return json.Unmarshal([]byte(s), v) }

// userFlags reads the caller's current role flags (see AuthMiddlewareWithLookup).
func (h *Handler) userFlags(id uuid.UUID) (bool, bool, bool) {
	u, err := h.repo.GetUserByID(id)
	if err != nil || u == nil {
		return false, false, false
	}
	return u.IsAdmin, u.IsDemo, true
}
