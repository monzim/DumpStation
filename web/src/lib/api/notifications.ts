import type {
  ApiError,
  NotificationConfig,
  NotificationConfigInput,
} from "@/lib/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import { mockApi } from "./mock";

const USE_MOCK = false;

// Query keys
export const notificationKeys = {
  all: ["notifications"] as const,
  lists: () => [...notificationKeys.all, "list"] as const,
  list: (filters: string) =>
    [...notificationKeys.lists(), { filters }] as const,
  details: () => [...notificationKeys.all, "detail"] as const,
  detail: (id: string) => [...notificationKeys.details(), id] as const,
};

// Queries
export const useNotifications = () => {
  return useQuery<NotificationConfig[], ApiError>({
    queryKey: notificationKeys.lists(),
    queryFn: async () => {
      if (USE_MOCK) {
        return mockApi.getNotifications();
      }
      const response =
        await apiClient.get<NotificationConfig[]>("/notifications");
      return response;
    },
  });
};

export const useNotification = (id: string) => {
  return useQuery<NotificationConfig, ApiError>({
    queryKey: notificationKeys.detail(id),
    queryFn: async () => {
      if (USE_MOCK) {
        return mockApi.getNotificationById(id);
      }
      const response = await apiClient.get<NotificationConfig>(
        `/notifications/${id}`
      );
      return response;
    },
    enabled: !!id,
  });
};

export const useNotificationById = (id: string) => {
  return useNotification(id);
};

// Mutations
export const useCreateNotification = () => {
  const queryClient = useQueryClient();

  return useMutation<NotificationConfig, ApiError, NotificationConfigInput>({
    mutationFn: async (input) => {
      if (USE_MOCK) {
        return mockApi.createNotification(input);
      }
      const response = await apiClient.post<NotificationConfig>(
        "/notifications",
        input
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
    },
  });
};

export const useUpdateNotification = () => {
  const queryClient = useQueryClient();

  return useMutation<
    NotificationConfig,
    ApiError,
    { id: string; input: NotificationConfigInput }
  >({
    mutationFn: async ({ id, input }) => {
      if (USE_MOCK) {
        return mockApi.updateNotification(id, input);
      }
      const response = await apiClient.put<NotificationConfig>(
        `/notifications/${id}`,
        input
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: notificationKeys.detail(variables.id),
      });
    },
  });
};

export const useDeleteNotification = () => {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: async (id) => {
      if (USE_MOCK) {
        return mockApi.deleteNotification(id);
      }
      await apiClient.delete(`/notifications/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
    },
  });
};
