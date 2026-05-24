package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/monzim/db_proxy/v1/internal/dbadmin"
	"github.com/monzim/db_proxy/v1/internal/models"
	"gorm.io/gorm"
)

// adminRequestTimeout caps every outbound query against a foreign PostgreSQL.
// Picked to match the existing 15s server WriteTimeout less a buffer for
// response encoding.
const adminRequestTimeout = 12 * time.Second

// ============================================================================
// ServerConnection CRUD
// ============================================================================

// ListServerConnections godoc
// @Summary List PostgreSQL server connections
// @Description Returns every server connection owned by the current user (or all when admin).
// @Tags DB Servers
// @Produce json
// @Security BearerAuth
// @Success 200 {array} models.ServerConnectionResponse
// @Failure 401 {object} models.APIError
// @Router /server-connections [get]
func (h *Handler) ListServerConnections(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	items, err := h.repo.ListServerConnectionsByUser(*userID, getIsAdminFromContext(r))
	if err != nil {
		logError("list server connections", err)
		writeError(w, http.StatusInternalServerError, "failed to list server connections")
		return
	}
	writeJSON(w, http.StatusOK, models.ServerConnectionsToResponse(items))
}

// GetServerConnection godoc
// @Summary Get one PostgreSQL server connection
// @Tags DB Servers
// @Produce json
// @Security BearerAuth
// @Param id path string true "Server connection id"
// @Success 200 {object} models.ServerConnectionResponse
// @Failure 404 {object} models.APIError
// @Router /server-connections/{id} [get]
func (h *Handler) GetServerConnection(w http.ResponseWriter, r *http.Request) {
	sc, ok := h.requireServerConnection(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, sc.ToResponse())
}

// CreateServerConnection godoc
// @Summary Register a PostgreSQL server for administration
// @Description Verifies the credentials with a live connection test, then encrypts the password and persists.
// @Tags DB Servers
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body models.ServerConnectionInput true "Connection details"
// @Success 201 {object} models.ServerConnectionResponse
// @Failure 400 {object} models.APIError
// @Failure 502 {object} models.APIError "Connection test failed"
// @Router /server-connections [post]
func (h *Handler) CreateServerConnection(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var input models.ServerConnectionInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if validationErr, err := h.validator.Validate(&input); validationErr != nil || err != nil {
		if validationErr != nil {
			writeValidationError(w, validationErr)
			return
		}
		writeError(w, http.StatusInternalServerError, "validation error")
		return
	}
	if input.Password == "" {
		writeError(w, http.StatusBadRequest, "password is required when creating a server connection")
		return
	}

	// Verify credentials before persisting — fail fast rather than store
	// secrets we can't actually use.
	ctx, cancel := context.WithTimeout(r.Context(), adminRequestTimeout)
	defer cancel()
	testResult, err := dbadmin.TryConnect(ctx, dbadmin.Options{
		Host: input.Host, Port: input.Port, User: input.Username,
		Password: input.Password, SSLMode: input.SSLMode,
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("connection test failed: %v", err))
		return
	}

	// Encrypt before storage.
	ciphertext, err := h.cipher.Encrypt(input.Password)
	if err != nil {
		logError("encrypt server password", err)
		writeError(w, http.StatusInternalServerError, "failed to encrypt password")
		return
	}

	// Persist the SSL mode that actually worked so subsequent operations
	// use the same setting instead of re-running the SSL ladder.
	input.SSLMode = testResult.SSLMode

	sc, err := h.repo.CreateServerConnection(*userID, &input, ciphertext)
	if err != nil {
		logError("create server connection", err)
		writeError(w, http.StatusInternalServerError, "failed to create server connection")
		return
	}

	// Record the successful test on the row.
	_ = h.repo.UpdateServerConnectionTestResult(sc.ID, "ok", testResult.SSLMode, "")

	h.logActivity(userID, models.ActionServerConnectionCreated, models.LogLevelSuccess,
		"server_connection", &sc.ID, sc.Name,
		fmt.Sprintf("Registered PostgreSQL server %q at %s:%d", sc.Name, sc.Host, sc.Port),
		"", getIPAddress(r))

	writeJSON(w, http.StatusCreated, sc.ToResponse())
}

// UpdateServerConnection godoc
// @Summary Update a PostgreSQL server connection
// @Description Empty password means keep the existing one.
// @Tags DB Servers
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Server connection id"
// @Param body body models.ServerConnectionInput true "Updated connection details"
// @Success 200 {object} models.ServerConnectionResponse
// @Router /server-connections/{id} [put]
func (h *Handler) UpdateServerConnection(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}

	var input models.ServerConnectionInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if validationErr, err := h.validator.Validate(&input); validationErr != nil || err != nil {
		if validationErr != nil {
			writeValidationError(w, validationErr)
			return
		}
		writeError(w, http.StatusInternalServerError, "validation error")
		return
	}

	var ciphertext string
	if input.Password != "" {
		ciphertext, err = h.cipher.Encrypt(input.Password)
		if err != nil {
			logError("encrypt server password", err)
			writeError(w, http.StatusInternalServerError, "failed to encrypt password")
			return
		}
	}

	sc, err := h.repo.UpdateServerConnectionByUser(id, *userID, getIsAdminFromContext(r), &input, ciphertext)
	if err != nil {
		logError("update server connection", err)
		writeError(w, http.StatusInternalServerError, "failed to update server connection")
		return
	}
	if sc == nil {
		writeError(w, http.StatusNotFound, "server connection not found")
		return
	}

	h.logActivity(userID, models.ActionServerConnectionUpdated, models.LogLevelInfo,
		"server_connection", &sc.ID, sc.Name,
		fmt.Sprintf("Updated server connection %q", sc.Name),
		"", getIPAddress(r))

	writeJSON(w, http.StatusOK, sc.ToResponse())
}

// DeleteServerConnection godoc
// @Summary Delete a PostgreSQL server connection
// @Tags DB Servers
// @Security BearerAuth
// @Param id path string true "Server connection id"
// @Success 204
// @Failure 404 {object} models.APIError
// @Router /server-connections/{id} [delete]
func (h *Handler) DeleteServerConnection(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}

	// Load name before delete so the activity log entry has it.
	sc, _ := h.repo.GetServerConnectionByUser(id, *userID, getIsAdminFromContext(r))

	if err := h.repo.DeleteServerConnectionByUser(id, *userID, getIsAdminFromContext(r)); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			writeError(w, http.StatusNotFound, "server connection not found")
			return
		}
		logError("delete server connection", err)
		writeError(w, http.StatusInternalServerError, "failed to delete server connection")
		return
	}

	name := ""
	if sc != nil {
		name = sc.Name
	}
	h.logActivity(userID, models.ActionServerConnectionDeleted, models.LogLevelWarning,
		"server_connection", &id, name,
		fmt.Sprintf("Deleted server connection %q", name),
		"", getIPAddress(r))

	w.WriteHeader(http.StatusNoContent)
}

// ============================================================================
// Connection test
// ============================================================================

// TestServerConnection godoc
// @Summary Test a stored server connection
// @Description Tries the SSL ladder (require → prefer → disable) and records the outcome on the row.
// @Tags DB Servers
// @Produce json
// @Security BearerAuth
// @Param id path string true "Server connection id"
// @Success 200 {object} models.ServerConnectionTestResult
// @Router /server-connections/{id}/test [post]
func (h *Handler) TestServerConnection(w http.ResponseWriter, r *http.Request) {
	sc, ok := h.requireServerConnection(w, r)
	if !ok {
		return
	}
	plain, err := h.cipher.Decrypt(sc.Password)
	if err != nil {
		logError("decrypt server password", err)
		writeError(w, http.StatusInternalServerError, "failed to decrypt stored password")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), adminRequestTimeout)
	defer cancel()
	result, err := dbadmin.TryConnect(ctx, dbadmin.Options{
		Host: sc.Host, Port: sc.Port, User: sc.Username,
		Password: plain, SSLMode: sc.SSLMode,
	})

	out := models.ServerConnectionTestResult{}
	status := "ok"
	errMessage := ""
	if err != nil {
		out.OK = false
		out.Message = err.Error()
		status = "failed"
		errMessage = err.Error()
	} else {
		out.OK = true
		out.SSLMode = result.SSLMode
		out.Latency = result.Latency.String()
	}
	_ = h.repo.UpdateServerConnectionTestResult(sc.ID, status, out.SSLMode, errMessage)

	writeJSON(w, http.StatusOK, out)
}

// TestServerConnectionAdHoc godoc
// @Summary Test ad-hoc credentials before saving
// @Tags DB Servers
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body models.ServerConnectionInput true "Connection details to probe"
// @Success 200 {object} models.ServerConnectionTestResult
// @Router /server-connections/test [post]
func (h *Handler) TestServerConnectionAdHoc(w http.ResponseWriter, r *http.Request) {
	var input models.ServerConnectionInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if input.Host == "" || input.Port == 0 || input.Username == "" || input.Password == "" {
		writeError(w, http.StatusBadRequest, "host, port, user, and password are all required to test")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), adminRequestTimeout)
	defer cancel()
	result, err := dbadmin.TryConnect(ctx, dbadmin.Options{
		Host: input.Host, Port: input.Port, User: input.Username,
		Password: input.Password, SSLMode: input.SSLMode,
	})

	out := models.ServerConnectionTestResult{}
	if err != nil {
		out.Message = err.Error()
	} else {
		out.OK = true
		out.SSLMode = result.SSLMode
		out.Latency = result.Latency.String()
	}
	writeJSON(w, http.StatusOK, out)
}

// ============================================================================
// Per-server: databases
// ============================================================================

// ListServerDatabases godoc
// @Summary List databases on a remote server
// @Tags DB Servers
// @Produce json
// @Security BearerAuth
// @Param id path string true "Server connection id"
// @Success 200 {array} models.ServerDatabaseInfo
// @Router /server-connections/{id}/databases [get]
func (h *Handler) ListServerDatabases(w http.ResponseWriter, r *http.Request) {
	client, sc, ok := h.openClient(w, r, "")
	if !ok {
		return
	}
	defer client.Close()
	_ = sc

	ctx, cancel := context.WithTimeout(r.Context(), adminRequestTimeout)
	defer cancel()
	dbs, err := client.ListDatabases(ctx)
	if err != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("list databases: %v", err))
		return
	}
	if dbs == nil {
		dbs = []models.ServerDatabaseInfo{}
	}
	writeJSON(w, http.StatusOK, dbs)
}

// CreateServerDatabase godoc
// @Summary Create a database on a remote server
// @Tags DB Servers
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Server connection id"
// @Param body body models.ServerCreateDatabaseInput true "New database"
// @Success 201 {object} map[string]string
// @Router /server-connections/{id}/databases [post]
func (h *Handler) CreateServerDatabase(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	var input models.ServerCreateDatabaseInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if validationErr, err := h.validator.Validate(&input); validationErr != nil || err != nil {
		if validationErr != nil {
			writeValidationError(w, validationErr)
			return
		}
		writeError(w, http.StatusInternalServerError, "validation error")
		return
	}

	client, sc, ok := h.openClient(w, r, "")
	if !ok {
		return
	}
	defer client.Close()

	ctx, cancel := context.WithTimeout(r.Context(), adminRequestTimeout)
	defer cancel()
	if err := client.CreateDatabase(ctx, input.Name, input.Owner); err != nil {
		writeAdminError(w, "create database", err)
		return
	}

	h.logActivity(userID, models.ActionServerDatabaseCreated, models.LogLevelSuccess,
		"server_database", &sc.ID, sc.Name,
		fmt.Sprintf("Created database %q on server %q", input.Name, sc.Name),
		"", getIPAddress(r))

	writeJSON(w, http.StatusCreated, map[string]string{"name": input.Name})
}

// DropServerDatabase godoc
// @Summary Drop a database on a remote server
// @Tags DB Servers
// @Security BearerAuth
// @Param id path string true "Server connection id"
// @Param dbname path string true "Database name to drop"
// @Success 204
// @Router /server-connections/{id}/databases/{dbname} [delete]
func (h *Handler) DropServerDatabase(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	dbname := mux.Vars(r)["dbname"]
	if dbname == "" {
		writeError(w, http.StatusBadRequest, "dbname is required")
		return
	}

	client, sc, ok := h.openClient(w, r, "")
	if !ok {
		return
	}
	defer client.Close()

	ctx, cancel := context.WithTimeout(r.Context(), adminRequestTimeout)
	defer cancel()
	if err := client.DropDatabase(ctx, dbname); err != nil {
		writeAdminError(w, "drop database", err)
		return
	}

	h.logActivity(userID, models.ActionServerDatabaseDropped, models.LogLevelWarning,
		"server_database", &sc.ID, sc.Name,
		fmt.Sprintf("Dropped database %q on server %q", dbname, sc.Name),
		"", getIPAddress(r))

	w.WriteHeader(http.StatusNoContent)
}

// ListServerTables godoc
// @Summary List tables inside a database on a remote server
// @Tags DB Servers
// @Produce json
// @Security BearerAuth
// @Param id path string true "Server connection id"
// @Param dbname path string true "Database name"
// @Success 200 {array} models.ServerTableInfo
// @Router /server-connections/{id}/databases/{dbname}/tables [get]
func (h *Handler) ListServerTables(w http.ResponseWriter, r *http.Request) {
	dbname := mux.Vars(r)["dbname"]
	if dbname == "" {
		writeError(w, http.StatusBadRequest, "dbname is required")
		return
	}

	client, _, ok := h.openClient(w, r, dbname)
	if !ok {
		return
	}
	defer client.Close()

	ctx, cancel := context.WithTimeout(r.Context(), adminRequestTimeout)
	defer cancel()
	tables, err := client.ListTables(ctx)
	if err != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("list tables: %v", err))
		return
	}
	if tables == nil {
		tables = []models.ServerTableInfo{}
	}
	writeJSON(w, http.StatusOK, tables)
}

// ============================================================================
// Per-server: users
// ============================================================================

// ListServerUsers godoc
// @Summary List roles on a remote server
// @Tags DB Servers
// @Produce json
// @Security BearerAuth
// @Param id path string true "Server connection id"
// @Success 200 {array} models.ServerRoleInfo
// @Router /server-connections/{id}/users [get]
func (h *Handler) ListServerUsers(w http.ResponseWriter, r *http.Request) {
	client, _, ok := h.openClient(w, r, "")
	if !ok {
		return
	}
	defer client.Close()

	ctx, cancel := context.WithTimeout(r.Context(), adminRequestTimeout)
	defer cancel()
	roles, err := client.ListRoles(ctx)
	if err != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("list roles: %v", err))
		return
	}
	if roles == nil {
		roles = []models.ServerRoleInfo{}
	}
	writeJSON(w, http.StatusOK, roles)
}

// CreateServerUser godoc
// @Summary Create a role on a remote server
// @Tags DB Servers
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Server connection id"
// @Param body body models.ServerCreateUserInput true "New role"
// @Success 201 {object} map[string]string
// @Router /server-connections/{id}/users [post]
func (h *Handler) CreateServerUser(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	var input models.ServerCreateUserInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if validationErr, err := h.validator.Validate(&input); validationErr != nil || err != nil {
		if validationErr != nil {
			writeValidationError(w, validationErr)
			return
		}
		writeError(w, http.StatusInternalServerError, "validation error")
		return
	}

	client, sc, ok := h.openClient(w, r, "")
	if !ok {
		return
	}
	defer client.Close()

	ctx, cancel := context.WithTimeout(r.Context(), adminRequestTimeout)
	defer cancel()
	if err := client.CreateUser(ctx, input.Username, input.Password, input.CanLogin); err != nil {
		writeAdminError(w, "create user", err)
		return
	}

	h.logActivity(userID, models.ActionServerUserCreated, models.LogLevelSuccess,
		"server_user", &sc.ID, sc.Name,
		fmt.Sprintf("Created role %q on server %q", input.Username, sc.Name),
		"", getIPAddress(r))

	writeJSON(w, http.StatusCreated, map[string]string{"username": input.Username})
}

// DropServerUser godoc
// @Summary Drop a role on a remote server
// @Tags DB Servers
// @Security BearerAuth
// @Param id path string true "Server connection id"
// @Param username path string true "Role name to drop"
// @Success 204
// @Router /server-connections/{id}/users/{username} [delete]
func (h *Handler) DropServerUser(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	username := mux.Vars(r)["username"]
	if username == "" {
		writeError(w, http.StatusBadRequest, "username is required")
		return
	}

	client, sc, ok := h.openClient(w, r, "")
	if !ok {
		return
	}
	defer client.Close()

	ctx, cancel := context.WithTimeout(r.Context(), adminRequestTimeout)
	defer cancel()
	if err := client.DropUser(ctx, username); err != nil {
		writeAdminError(w, "drop user", err)
		return
	}

	h.logActivity(userID, models.ActionServerUserDropped, models.LogLevelWarning,
		"server_user", &sc.ID, sc.Name,
		fmt.Sprintf("Dropped role %q on server %q", username, sc.Name),
		"", getIPAddress(r))

	w.WriteHeader(http.StatusNoContent)
}

// GrantServerRole godoc
// @Summary Grant a preset role on a database
// @Tags DB Servers
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Server connection id"
// @Param dbname path string true "Database name"
// @Param body body models.ServerGrantInput true "Grant details"
// @Success 204
// @Router /server-connections/{id}/databases/{dbname}/grants [post]
func (h *Handler) GrantServerRole(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	dbname := mux.Vars(r)["dbname"]
	if dbname == "" {
		writeError(w, http.StatusBadRequest, "dbname is required")
		return
	}

	var input models.ServerGrantInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if validationErr, err := h.validator.Validate(&input); validationErr != nil || err != nil {
		if validationErr != nil {
			writeValidationError(w, validationErr)
			return
		}
		writeError(w, http.StatusInternalServerError, "validation error")
		return
	}
	if input.Preset != models.ServerGrantReadOnly &&
		input.Preset != models.ServerGrantReadWrite &&
		input.Preset != models.ServerGrantOwner {
		writeError(w, http.StatusBadRequest, "preset must be one of: readonly, readwrite, owner")
		return
	}

	client, sc, ok := h.openClient(w, r, "")
	if !ok {
		return
	}
	defer client.Close()

	ctx, cancel := context.WithTimeout(r.Context(), adminRequestTimeout)
	defer cancel()
	if err := client.GrantPreset(ctx, dbname, input.Username, input.Preset); err != nil {
		writeAdminError(w, "grant preset", err)
		return
	}

	h.logActivity(userID, models.ActionServerRoleGranted, models.LogLevelInfo,
		"server_grant", &sc.ID, sc.Name,
		fmt.Sprintf("Granted %s to %q on database %q (server %q)", input.Preset, input.Username, dbname, sc.Name),
		"", getIPAddress(r))

	w.WriteHeader(http.StatusNoContent)
}

// ============================================================================
// Internal helpers
// ============================================================================

// requireServerConnection loads + ownership-checks the row identified by the
// {id} URL var. On failure it writes the appropriate error and returns false.
func (h *Handler) requireServerConnection(w http.ResponseWriter, r *http.Request) (*models.ServerConnection, bool) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return nil, false
	}
	id, err := parseUUID(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return nil, false
	}
	sc, err := h.repo.GetServerConnectionByUser(id, *userID, getIsAdminFromContext(r))
	if err != nil {
		logError("get server connection", err)
		writeError(w, http.StatusInternalServerError, "failed to load server connection")
		return nil, false
	}
	if sc == nil {
		writeError(w, http.StatusNotFound, "server connection not found")
		return nil, false
	}
	return sc, true
}

// openClient resolves the connection, decrypts the password, and opens a
// dbadmin client. If dbname is empty the client targets the maintenance DB.
// Callers MUST Close the returned client on success.
func (h *Handler) openClient(w http.ResponseWriter, r *http.Request, dbname string) (*dbadmin.Client, *models.ServerConnection, bool) {
	sc, ok := h.requireServerConnection(w, r)
	if !ok {
		return nil, nil, false
	}
	plain, err := h.cipher.Decrypt(sc.Password)
	if err != nil {
		logError("decrypt server password", err)
		writeError(w, http.StatusInternalServerError, "failed to decrypt stored password")
		return nil, nil, false
	}
	client, err := dbadmin.New(dbadmin.Options{
		Host: sc.Host, Port: sc.Port, User: sc.Username,
		Password: plain, SSLMode: sc.SSLMode, DBName: dbname,
	})
	if err != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("connect to server: %v", err))
		return nil, nil, false
	}
	return client, sc, true
}

// writeAdminError maps dbadmin sentinel errors to HTTP statuses and falls
// back to a 502 (we're acting as a gateway to the foreign Postgres).
func writeAdminError(w http.ResponseWriter, op string, err error) {
	switch {
	case errors.Is(err, dbadmin.ErrAlreadyExists):
		writeError(w, http.StatusConflict, fmt.Sprintf("%s: already exists", op))
	case errors.Is(err, dbadmin.ErrNotFound):
		writeError(w, http.StatusNotFound, fmt.Sprintf("%s: not found", op))
	case errors.Is(err, dbadmin.ErrPermissionDenied):
		writeError(w, http.StatusForbidden, fmt.Sprintf("%s: permission denied on remote server", op))
	default:
		writeError(w, http.StatusBadGateway, fmt.Sprintf("%s: %v", op, err))
	}
}

