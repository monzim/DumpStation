import { apiClient } from "./client";
import { mockApi } from "./mock";
import type {
  DatabaseConfig,
  DatabaseConfigInput,
  Backup,
} from "@/lib/types/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const USE_MOCK = false;

// Query Keys
export const databaseKeys = {
  all: ["databases"] as const,
  lists: () => [...databaseKeys.all, "list"] as const,
  list: () => [...databaseKeys.lists()] as const,
  details: () => [...databaseKeys.all, "detail"] as const,
  detail: (id: string) => [...databaseKeys.details(), id] as const,
  backups: (id: string) => [...databaseKeys.all, "backups", id] as const,
};

// API Functions
export const databaseApi = {
  getAll: async (): Promise<DatabaseConfig[]> => {
    if (USE_MOCK) return mockApi.getDatabases();
    const response = await apiClient.get<DatabaseConfig[]>("/databases");
    return response;
  },

  getById: async (id: string): Promise<DatabaseConfig> => {
    if (USE_MOCK) return mockApi.getDatabaseById(id);
    const response = await apiClient.get<DatabaseConfig>(`/databases/${id}`);
    return response;
  },

  create: async (input: DatabaseConfigInput): Promise<DatabaseConfig> => {
    if (USE_MOCK) return mockApi.createDatabase(input);
    const response = await apiClient.post<DatabaseConfig>("/databases", input);
    return response;
  },

  update: async (
    id: string,
    input: DatabaseConfigInput
  ): Promise<DatabaseConfig> => {
    if (USE_MOCK) return mockApi.updateDatabase(id, input);
    const response = await apiClient.put<DatabaseConfig>(
      `/databases/${id}`,
      input
    );
    return response;
  },

  delete: async (id: string): Promise<void> => {
    if (USE_MOCK) return mockApi.deleteDatabase(id);
    await apiClient.delete(`/databases/${id}`);
  },

  pause: async (id: string): Promise<DatabaseConfig> => {
    if (USE_MOCK) return mockApi.pauseDatabase(id);
    const response = await apiClient.post<DatabaseConfig>(
      `/databases/${id}/pause`
    );
    return response;
  },

  unpause: async (id: string): Promise<DatabaseConfig> => {
    if (USE_MOCK) return mockApi.unpauseDatabase(id);
    const response = await apiClient.post<DatabaseConfig>(
      `/databases/${id}/unpause`
    );
    return response;
  },

  triggerBackup: async (id: string): Promise<Backup> => {
    if (USE_MOCK) return mockApi.triggerBackup(id);
    const response = await apiClient.post<Backup>(`/databases/${id}/backup`);
    return response;
  },

  getBackups: async (id: string): Promise<Backup[]> => {
    if (USE_MOCK) return mockApi.getDatabaseBackups(id);
    const response = await apiClient.get<Backup[]>(`/databases/${id}/backups`);
    return response;
  },
};

// React Query Hooks
export function useDatabases() {
  return useQuery({
    queryKey: databaseKeys.list(),
    queryFn: databaseApi.getAll,
  });
}

export function useDatabase(id: string) {
  return useQuery({
    queryKey: databaseKeys.detail(id),
    queryFn: () => databaseApi.getById(id),
    enabled: !!id,
  });
}

export function useDatabaseById(id: string) {
  return useDatabase(id);
}

export function useDatabaseBackups(id: string) {
  return useQuery({
    queryKey: databaseKeys.backups(id),
    queryFn: () => databaseApi.getBackups(id),
    enabled: !!id,
  });
}

export function useCreateDatabase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: databaseApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: databaseKeys.lists() });
      toast.success("Database configuration created successfully");
    },
    onError: (error: any) => {
      const message =
        error?.message || "Failed to create database configuration";
      toast.error(message);
    },
  });
}

export function useUpdateDatabase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DatabaseConfigInput }) =>
      databaseApi.update(id, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: databaseKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: databaseKeys.detail(variables.id),
      });
      toast.success("Database configuration updated successfully");
    },
    onError: (error: any) => {
      const message =
        error?.message || "Failed to update database configuration";
      toast.error(message);
    },
  });
}

export function useDeleteDatabase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: databaseApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: databaseKeys.lists() });
      toast.success("Database configuration deleted successfully");
    },
    onError: (error: any) => {
      const message =
        error?.message || "Failed to delete database configuration";
      toast.error(message);
    },
  });
}

export function usePauseDatabase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: databaseApi.pause,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: databaseKeys.lists() });
      queryClient.invalidateQueries({ queryKey: databaseKeys.detail(data.id) });
      toast.success("Database backups paused");
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to pause database";
      toast.error(message);
    },
  });
}

export function useUnpauseDatabase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: databaseApi.unpause,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: databaseKeys.lists() });
      queryClient.invalidateQueries({ queryKey: databaseKeys.detail(data.id) });
      toast.success("Database backups resumed");
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to unpause database";
      toast.error(message);
    },
  });
}

export function useTriggerBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: databaseApi.triggerBackup,
    onSuccess: (_, databaseId) => {
      queryClient.invalidateQueries({
        queryKey: databaseKeys.backups(databaseId),
      });
      toast.success("Backup triggered successfully");
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to trigger backup";
      toast.error(message);
    },
  });
}
