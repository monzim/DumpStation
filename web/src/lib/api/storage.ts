import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import { mockApi } from "./mock";
import type {
  StorageConfig,
  StorageConfigInput,
  ApiError,
} from "@/lib/types/api";

const USE_MOCK = false;

// Query keys
export const storageKeys = {
  all: ["storage"] as const,
  lists: () => [...storageKeys.all, "list"] as const,
  list: (filters: string) => [...storageKeys.lists(), { filters }] as const,
  details: () => [...storageKeys.all, "detail"] as const,
  detail: (id: string) => [...storageKeys.details(), id] as const,
};

// Queries
export const useStorageConfigs = () => {
  return useQuery<StorageConfig[], ApiError>({
    queryKey: storageKeys.lists(),
    queryFn: async () => {
      if (USE_MOCK) {
        return mockApi.getStorageConfigs();
      }
      const response = await apiClient.get<StorageConfig[]>("/storage");
      return response;
    },
  });
};

export const useStorageConfig = (id: string) => {
  return useQuery<StorageConfig, ApiError>({
    queryKey: storageKeys.detail(id),
    queryFn: async () => {
      if (USE_MOCK) {
        return mockApi.getStorageConfigById(id);
      }
      const response = await apiClient.get<StorageConfig>(`/storage/${id}`);
      return response;
    },
    enabled: !!id,
  });
};

export const useStorageConfigById = (id: string) => {
  return useStorageConfig(id);
};

// Mutations
export const useCreateStorageConfig = () => {
  const queryClient = useQueryClient();

  return useMutation<StorageConfig, ApiError, StorageConfigInput>({
    mutationFn: async (input) => {
      if (USE_MOCK) {
        return mockApi.createStorageConfig(input);
      }
      const response = await apiClient.post<StorageConfig>("/storage", input);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.lists() });
    },
  });
};

export const useUpdateStorageConfig = () => {
  const queryClient = useQueryClient();

  return useMutation<
    StorageConfig,
    ApiError,
    { id: string; input: StorageConfigInput }
  >({
    mutationFn: async ({ id, input }) => {
      if (USE_MOCK) {
        return mockApi.updateStorageConfig(id, input);
      }
      const response = await apiClient.put<StorageConfig>(
        `/storage/${id}`,
        input
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: storageKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: storageKeys.detail(variables.id),
      });
    },
  });
};

export const useDeleteStorageConfig = () => {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: async (id) => {
      if (USE_MOCK) {
        return mockApi.deleteStorageConfig(id);
      }
      await apiClient.delete(`/storage/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.lists() });
    },
  });
};
