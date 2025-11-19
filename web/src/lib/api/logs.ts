import type {
  ActivityLog,
  ActivityLogListParams,
  ActivityLogListResponse,
} from "@/lib/types/api";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";

// Build query string from params
function buildQueryString(params: ActivityLogListParams): string {
  const queryParams = new URLSearchParams();

  if (params.user_id) queryParams.append("user_id", params.user_id);
  if (params.action) queryParams.append("action", params.action);
  if (params.level) queryParams.append("level", params.level);
  if (params.entity_type)
    queryParams.append("entity_type", params.entity_type);
  if (params.entity_id) queryParams.append("entity_id", params.entity_id);
  if (params.start_date) queryParams.append("start_date", params.start_date);
  if (params.end_date) queryParams.append("end_date", params.end_date);
  if (params.limit) queryParams.append("limit", params.limit.toString());
  if (params.offset) queryParams.append("offset", params.offset.toString());

  const queryString = queryParams.toString();
  return queryString ? `?${queryString}` : "";
}

// Get all activity logs with optional filtering
export function useActivityLogs(params: ActivityLogListParams = {}) {
  return useQuery({
    queryKey: ["activity-logs", params],
    queryFn: async (): Promise<ActivityLogListResponse> => {
      const queryString = buildQueryString(params);
      const response = await apiClient.get<ActivityLogListResponse>(
        `/logs${queryString}`
      );
      return response;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

// Get a single activity log by ID
export function useActivityLog(id: string) {
  return useQuery({
    queryKey: ["activity-logs", id],
    queryFn: async (): Promise<ActivityLog> => {
      const response = await apiClient.get<ActivityLog>(`/logs/${id}`);
      return response;
    },
    enabled: !!id,
  });
}
