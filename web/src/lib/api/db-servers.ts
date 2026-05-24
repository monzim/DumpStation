import { apiClient } from "./client";
import type {
  ServerConnection,
  ServerConnectionInput,
  ServerConnectionTestResult,
  ServerDatabaseInfo,
  ServerTableInfo,
  ServerRoleInfo,
  ServerCreateDatabaseInput,
  ServerCreateUserInput,
  ServerGrantInput,
  ServerTableRowsResult,
  ServerERDSchema,
} from "@/lib/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// ============================================================================
// Query keys — hierarchical so we can invalidate any subset cheaply.
// ============================================================================
export const dbServerKeys = {
  all: ["db-servers"] as const,
  lists: () => [...dbServerKeys.all, "list"] as const,
  list: () => [...dbServerKeys.lists()] as const,
  details: () => [...dbServerKeys.all, "detail"] as const,
  detail: (id: string) => [...dbServerKeys.details(), id] as const,
  databases: (id: string) => [...dbServerKeys.all, id, "databases"] as const,
  tables: (id: string, dbname: string) =>
    [...dbServerKeys.all, id, "databases", dbname, "tables"] as const,
  tableRows: (
    id: string,
    dbname: string,
    schema: string,
    table: string,
    page: number
  ) =>
    [
      ...dbServerKeys.all,
      id,
      "databases",
      dbname,
      "tables",
      schema,
      table,
      "rows",
      page,
    ] as const,
  erd: (id: string, dbname: string) =>
    [...dbServerKeys.all, id, "databases", dbname, "erd"] as const,
  users: (id: string) => [...dbServerKeys.all, id, "users"] as const,
};

// ============================================================================
// Raw API surface
// ============================================================================
export const dbServerApi = {
  list: () => apiClient.get<ServerConnection[]>("/server-connections"),
  get: (id: string) => apiClient.get<ServerConnection>(`/server-connections/${id}`),
  create: (input: ServerConnectionInput) =>
    apiClient.post<ServerConnection>("/server-connections", input),
  update: (id: string, input: ServerConnectionInput) =>
    apiClient.put<ServerConnection>(`/server-connections/${id}`, input),
  remove: (id: string) => apiClient.delete<void>(`/server-connections/${id}`),
  test: (id: string) =>
    apiClient.post<ServerConnectionTestResult>(`/server-connections/${id}/test`),
  testAdHoc: (input: ServerConnectionInput) =>
    apiClient.post<ServerConnectionTestResult>("/server-connections/test", input),

  listDatabases: (id: string) =>
    apiClient.get<ServerDatabaseInfo[]>(`/server-connections/${id}/databases`),
  createDatabase: (id: string, input: ServerCreateDatabaseInput) =>
    apiClient.post<{ name: string }>(
      `/server-connections/${id}/databases`,
      input
    ),
  dropDatabase: (id: string, dbname: string) =>
    apiClient.delete<void>(
      `/server-connections/${id}/databases/${encodeURIComponent(dbname)}`
    ),

  listTables: (id: string, dbname: string) =>
    apiClient.get<ServerTableInfo[]>(
      `/server-connections/${id}/databases/${encodeURIComponent(dbname)}/tables`
    ),

  listUsers: (id: string) =>
    apiClient.get<ServerRoleInfo[]>(`/server-connections/${id}/users`),
  createUser: (id: string, input: ServerCreateUserInput) =>
    apiClient.post<{ username: string }>(
      `/server-connections/${id}/users`,
      input
    ),
  dropUser: (id: string, username: string) =>
    apiClient.delete<void>(
      `/server-connections/${id}/users/${encodeURIComponent(username)}`
    ),

  grantPreset: (id: string, dbname: string, input: ServerGrantInput) =>
    apiClient.post<void>(
      `/server-connections/${id}/databases/${encodeURIComponent(dbname)}/grants`,
      input
    ),

  browseTable: (
    id: string,
    dbname: string,
    schema: string,
    table: string,
    limit: number,
    offset: number
  ) =>
    apiClient.get<ServerTableRowsResult>(
      `/server-connections/${id}/databases/${encodeURIComponent(dbname)}/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/rows?limit=${limit}&offset=${offset}`
    ),
  truncateTable: (id: string, dbname: string, schema: string, table: string) =>
    apiClient.post<void>(
      `/server-connections/${id}/databases/${encodeURIComponent(dbname)}/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/truncate`
    ),
  getDatabaseERD: (id: string, dbname: string) =>
    apiClient.get<ServerERDSchema>(
      `/server-connections/${id}/databases/${encodeURIComponent(dbname)}/erd`
    ),
};

// ============================================================================
// Read hooks
// ============================================================================
export function useDbServers() {
  return useQuery({
    queryKey: dbServerKeys.list(),
    queryFn: dbServerApi.list,
  });
}

export function useDbServer(id: string) {
  return useQuery({
    queryKey: dbServerKeys.detail(id),
    queryFn: () => dbServerApi.get(id),
    enabled: !!id,
  });
}

export function useDbServerDatabases(id: string) {
  return useQuery({
    queryKey: dbServerKeys.databases(id),
    queryFn: () => dbServerApi.listDatabases(id),
    enabled: !!id,
  });
}

export function useDbServerTables(id: string, dbname: string) {
  return useQuery({
    queryKey: dbServerKeys.tables(id, dbname),
    queryFn: () => dbServerApi.listTables(id, dbname),
    enabled: !!id && !!dbname,
  });
}

export function useDbServerUsers(id: string) {
  return useQuery({
    queryKey: dbServerKeys.users(id),
    queryFn: () => dbServerApi.listUsers(id),
    enabled: !!id,
  });
}

// ============================================================================
// Mutation hooks — follow databases.ts convention (toast + invalidate)
// ============================================================================
export function useCreateDbServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: dbServerApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dbServerKeys.lists() });
      toast.success("Server connection created");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create server connection"),
  });
}

export function useUpdateDbServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ServerConnectionInput }) =>
      dbServerApi.update(id, input),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: dbServerKeys.lists() });
      qc.invalidateQueries({ queryKey: dbServerKeys.detail(vars.id) });
      toast.success("Server connection updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update server connection"),
  });
}

export function useDeleteDbServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: dbServerApi.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dbServerKeys.lists() });
      toast.success("Server connection deleted");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete server connection"),
  });
}

export function useTestDbServer() {
  return useMutation({
    mutationFn: dbServerApi.test,
  });
}

export function useTestDbServerAdHoc() {
  return useMutation({
    mutationFn: dbServerApi.testAdHoc,
  });
}

export function useCreateServerDatabase(serverId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ServerCreateDatabaseInput) =>
      dbServerApi.createDatabase(serverId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dbServerKeys.databases(serverId) });
      toast.success("Database created");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create database"),
  });
}

export function useDropServerDatabase(serverId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dbname: string) => dbServerApi.dropDatabase(serverId, dbname),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dbServerKeys.databases(serverId) });
      toast.success("Database dropped");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to drop database"),
  });
}

export function useCreateServerUser(serverId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ServerCreateUserInput) =>
      dbServerApi.createUser(serverId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dbServerKeys.users(serverId) });
      toast.success("User created");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create user"),
  });
}

export function useDropServerUser(serverId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (username: string) => dbServerApi.dropUser(serverId, username),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dbServerKeys.users(serverId) });
      toast.success("User dropped");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to drop user"),
  });
}

export function useGrantPresetRole(serverId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dbname, input }: { dbname: string; input: ServerGrantInput }) =>
      dbServerApi.grantPreset(serverId, dbname, input),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: dbServerKeys.tables(serverId, vars.dbname) });
      toast.success(`Granted ${vars.input.preset} to ${vars.input.username}`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to grant role"),
  });
}

// ============================================================================
// Table browser, TRUNCATE, ERD
// ============================================================================

const ROWS_PER_PAGE = 50;

export function useServerTableRows(
  serverId: string,
  dbname: string,
  schema: string,
  table: string,
  page: number
) {
  return useQuery({
    queryKey: dbServerKeys.tableRows(serverId, dbname, schema, table, page),
    queryFn: () =>
      dbServerApi.browseTable(
        serverId,
        dbname,
        schema,
        table,
        ROWS_PER_PAGE,
        Math.max(0, (page - 1) * ROWS_PER_PAGE)
      ),
    enabled: !!serverId && !!dbname && !!schema && !!table,
  });
}

export function useTruncateServerTable(serverId: string, dbname: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ schema, table }: { schema: string; table: string }) =>
      dbServerApi.truncateTable(serverId, dbname, schema, table),
    onSuccess: () => {
      // Refresh the table list (row count estimates) and any cached pages.
      qc.invalidateQueries({ queryKey: dbServerKeys.tables(serverId, dbname) });
      qc.invalidateQueries({
        queryKey: [
          ...dbServerKeys.all,
          serverId,
          "databases",
          dbname,
          "tables",
        ],
      });
      toast.success("Table cleared");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to clear table"),
  });
}

export function useDbServerERD(serverId: string, dbname: string) {
  return useQuery({
    queryKey: dbServerKeys.erd(serverId, dbname),
    queryFn: () => dbServerApi.getDatabaseERD(serverId, dbname),
    enabled: !!serverId && !!dbname,
  });
}

export const TABLE_ROWS_PER_PAGE = ROWS_PER_PAGE;
