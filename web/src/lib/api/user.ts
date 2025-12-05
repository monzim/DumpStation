import type { AvatarUploadRequest, UserProfile } from "@/lib/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, getApiBaseUrl, getAuthToken } from "./client";

/**
 * Fetch the user's avatar as a data URL
 * This handles the auth header properly by using fetch with Authorization
 */
const fetchAvatarAsDataUrl = async (): Promise<string | null> => {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const response = await fetch(`${getApiBaseUrl()}/users/me/avatar`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // No avatar
      }
      throw new Error(`Failed to fetch avatar: ${response.status}`);
    }

    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Failed to fetch avatar:", error);
    return null;
  }
};

/**
 * Hook to get the user's avatar as a data URL
 * This properly handles authentication by fetching with Authorization header
 */
export const useUserAvatar = (hasProfilePicture?: boolean) => {
  return useQuery({
    queryKey: ["user-avatar", hasProfilePicture],
    queryFn: fetchAvatarAsDataUrl,
    enabled: !!hasProfilePicture,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1,
  });
};

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
      // Invalidate both user profile and avatar queries
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      queryClient.invalidateQueries({ queryKey: ["user-avatar"] });
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
      // Invalidate both user profile and avatar queries
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      queryClient.invalidateQueries({ queryKey: ["user-avatar"] });
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
