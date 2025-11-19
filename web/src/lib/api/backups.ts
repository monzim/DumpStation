import type { Backup, RestoreJob, RestoreRequest } from "@/lib/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import { mockApi } from "./mock";

const USE_MOCK = false;

// Get all backups
export function useBackups() {
  return useQuery({
    queryKey: ["backups"],
    queryFn: async (): Promise<Backup[]> => {
      if (USE_MOCK) {
        return mockApi.getAllBackups();
      }
      const response = await apiClient.get<Backup[]>("/backups");
      return response;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

// Get a single backup by ID
export function useBackup(id: string) {
  return useQuery({
    queryKey: ["backups", id],
    queryFn: async (): Promise<Backup> => {
      if (USE_MOCK) {
        return mockApi.getBackupById(id);
      }
      const response = await apiClient.get<Backup>(`/backups/${id}`);
      return response;
    },
    enabled: !!id,
  });
}

// Restore a backup
export function useRestoreBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      backupId,
      request,
    }: {
      backupId: string;
      request?: RestoreRequest;
    }): Promise<RestoreJob> => {
      if (USE_MOCK) {
        return mockApi.restoreBackup(backupId, request);
      }
      const response = await apiClient.post<RestoreJob>(
        `/backups/${backupId}/restore`,
        request
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
    },
  });
}
