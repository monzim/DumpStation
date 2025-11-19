import type { SystemStats } from "@/lib/types/api";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";

export const useSystemStats = () => {
  return useQuery({
    queryKey: ["system-stats"],
    queryFn: async () => {
      // if (USE_MOCK) {
      //   return mockApi.getStats();
      // }
      return apiClient.get<SystemStats>("/stats");
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });
};
