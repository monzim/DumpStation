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

// ─────────────────── Failed-backup purge ───────────────────

export interface FailedBackupCount {
  count: number;
}

export function useFailedBackupCount() {
  return useQuery({
    queryKey: ["failed-backup-count"],
    queryFn: () => apiClient.get<FailedBackupCount>("/backups/failed/count"),
    refetchInterval: 60_000,
  });
}

export function usePurgeFailedBackups() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete<{ deleted: number }>("/backups/failed"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      queryClient.invalidateQueries({ queryKey: ["failed-backup-count"] });
    },
  });
}

// ─────────────────── OTP-gated backup download ───────────────────

export interface DownloadOTPRequestResponse {
  otp_id: string;
  expires_at: string;
  channels: string[];
}

export interface DownloadURLResponse {
  download_url: string;
  expires_at: string;
}

export const requestDownloadOTP = (backupId: string) =>
  apiClient.post<DownloadOTPRequestResponse>(
    `/backups/${backupId}/download/request-otp`
  );

export const verifyDownloadOTP = (
  backupId: string,
  otpId: string,
  code: string
) =>
  apiClient.post<DownloadURLResponse>(`/backups/${backupId}/download/verify`, {
    otp_id: otpId,
    code,
  });

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
