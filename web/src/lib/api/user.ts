import type { AvatarUploadRequest, UserProfile } from "@/lib/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

/**
 * Hook to get the current user's profile
 */
export const useUserProfile = () => {
  return useQuery({
    queryKey: ["user-profile"],
    queryFn: async () => {
      return apiClient.get<UserProfile>("/users/me");
    },
    staleTime: 60000, // Consider data stale after 1 minute
    retry: 1,
  });
};

/**
 * Hook to upload user avatar (base64 method)
 */
export const useUploadAvatar = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: AvatarUploadRequest) => {
      return apiClient.post<UserProfile>("/users/me/avatar", data);
    },
    onSuccess: () => {
      // Invalidate user profile query to reflect the new avatar
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
    },
  });
};

/**
 * Hook to delete user avatar
 */
export const useDeleteAvatar = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return apiClient.delete<UserProfile>("/users/me/avatar");
    },
    onSuccess: () => {
      // Invalidate user profile query to reflect the removed avatar
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
    },
  });
};

/**
 * Utility function to convert a File to base64 data URL
 */
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read file as string"));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
};

/**
 * Helper to get user initials from username or email
 */
export const getUserInitials = (username?: string, email?: string): string => {
  if (username) {
    // Take first two characters of username
    return username.slice(0, 2).toUpperCase();
  }
  if (email) {
    // Take first letter of email
    return email.charAt(0).toUpperCase();
  }
  return "U";
};
