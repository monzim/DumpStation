import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import type {
  Label,
  LabelInput,
  AssignLabelsInput,
  ApiError,
} from "@/lib/types/api";

// Query keys
export const labelKeys = {
  all: ["labels"] as const,
  lists: () => [...labelKeys.all, "list"] as const,
  details: () => [...labelKeys.all, "detail"] as const,
  detail: (id: string) => [...labelKeys.details(), id] as const,
};

// Queries
export const useLabels = () => {
  return useQuery<Label[], ApiError>({
    queryKey: labelKeys.lists(),
    queryFn: async () => {
      const response = await apiClient.get<Label[]>("/labels");
      return response;
    },
  });
};

export const useLabel = (id: string) => {
  return useQuery<Label, ApiError>({
    queryKey: labelKeys.detail(id),
    queryFn: async () => {
      const response = await apiClient.get<Label>(`/labels/${id}`);
      return response;
    },
    enabled: !!id,
  });
};

// Mutations
export const useCreateLabel = () => {
  const queryClient = useQueryClient();

  return useMutation<Label, ApiError, LabelInput>({
    mutationFn: async (input) => {
      const response = await apiClient.post<Label>("/labels", input);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: labelKeys.lists() });
    },
  });
};

export const useUpdateLabel = () => {
  const queryClient = useQueryClient();

  return useMutation<Label, ApiError, { id: string; input: LabelInput }>({
    mutationFn: async ({ id, input }) => {
      const response = await apiClient.put<Label>(`/labels/${id}`, input);
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: labelKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: labelKeys.detail(variables.id),
      });
    },
  });
};

export const useDeleteLabel = () => {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: async (id) => {
      await apiClient.delete(`/labels/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: labelKeys.lists() });
    },
  });
};

// Label assignment mutations

// Database label assignment
export const useAssignLabelsToDatabase = () => {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    ApiError,
    { databaseId: string; labelIds: string[] }
  >({
    mutationFn: async ({ databaseId, labelIds }) => {
      const input: AssignLabelsInput = { label_ids: labelIds };
      await apiClient.post(`/databases/${databaseId}/labels`, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["databases"] });
      queryClient.invalidateQueries({ queryKey: labelKeys.lists() });
    },
  });
};

export const useRemoveLabelFromDatabase = () => {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, { databaseId: string; labelId: string }>({
    mutationFn: async ({ databaseId, labelId }) => {
      await apiClient.delete(`/databases/${databaseId}/labels/${labelId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["databases"] });
      queryClient.invalidateQueries({ queryKey: labelKeys.lists() });
    },
  });
};

// Storage label assignment
export const useAssignLabelsToStorage = () => {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, { storageId: string; labelIds: string[] }>(
    {
      mutationFn: async ({ storageId, labelIds }) => {
        const input: AssignLabelsInput = { label_ids: labelIds };
        await apiClient.post(`/storage/${storageId}/labels`, input);
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["storage"] });
        queryClient.invalidateQueries({ queryKey: labelKeys.lists() });
      },
    }
  );
};

export const useRemoveLabelFromStorage = () => {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, { storageId: string; labelId: string }>({
    mutationFn: async ({ storageId, labelId }) => {
      await apiClient.delete(`/storage/${storageId}/labels/${labelId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storage"] });
      queryClient.invalidateQueries({ queryKey: labelKeys.lists() });
    },
  });
};

// Notification label assignment
export const useAssignLabelsToNotification = () => {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    ApiError,
    { notificationId: string; labelIds: string[] }
  >({
    mutationFn: async ({ notificationId, labelIds }) => {
      const input: AssignLabelsInput = { label_ids: labelIds };
      await apiClient.post(`/notifications/${notificationId}/labels`, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: labelKeys.lists() });
    },
  });
};

export const useRemoveLabelFromNotification = () => {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    ApiError,
    { notificationId: string; labelId: string }
  >({
    mutationFn: async ({ notificationId, labelId }) => {
      await apiClient.delete(
        `/notifications/${notificationId}/labels/${labelId}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: labelKeys.lists() });
    },
  });
};
