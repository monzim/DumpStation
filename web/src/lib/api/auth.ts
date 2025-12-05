import type {
  AuthResponse,
  AuthResponseWith2FA,
  LoginRequest,
  TwoFactorBackupCodesResponse,
  TwoFactorDisableRequest,
  TwoFactorSetupResponse,
  TwoFactorStatusResponse,
  TwoFactorVerifyRequest,
  TwoFactorVerifySetupRequest,
  VerifyRequest,
} from "@/lib/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

export const useLogin = () => {
  return useMutation({
    mutationFn: async (data: LoginRequest) => {
      return apiClient.post<{ message: string }>("/auth/login", data);
    },
  });
};

export const useVerify = () => {
  return useMutation({
    mutationFn: async (data: VerifyRequest) => {
      return apiClient.post<AuthResponseWith2FA>("/auth/verify", data);
    },
    onSuccess: (data) => {
      if (data.requires_2fa && data.two_factor_token) {
        // Store 2FA token for the verification step
        apiClient.set2FAToken(data.two_factor_token);
      } else if (data.token) {
        // Normal login - set the auth token
        apiClient.setToken(data.token);
      }
    },
  });
};

// Two-Factor Authentication Hooks

/**
 * Hook to initiate 2FA setup - returns QR code and backup codes
 */
export const useSetup2FA = () => {
  return useMutation({
    mutationFn: async () => {
      return apiClient.post<TwoFactorSetupResponse>("/auth/2fa/setup");
    },
  });
};

/**
 * Hook to verify and complete 2FA setup with a TOTP code
 */
export const useVerifySetup2FA = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: TwoFactorVerifySetupRequest) => {
      return apiClient.post<TwoFactorBackupCodesResponse>(
        "/auth/2fa/verify-setup",
        data
      );
    },
    onSuccess: () => {
      // Invalidate 2FA status query to reflect the new state
      queryClient.invalidateQueries({ queryKey: ["2fa-status"] });
    },
  });
};

/**
 * Hook to verify 2FA during login - uses the 2FA token from session storage
 */
export const useVerify2FA = () => {
  return useMutation({
    mutationFn: async (data: TwoFactorVerifyRequest) => {
      return apiClient.post<AuthResponse>("/auth/2fa/verify", data, true);
    },
    onSuccess: (data) => {
      // Set the auth token and clear the 2FA token
      apiClient.setToken(data.token);
      apiClient.clear2FAToken();
    },
  });
};

/**
 * Hook to disable 2FA - requires current TOTP code
 */
export const useDisable2FA = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: TwoFactorDisableRequest) => {
      return apiClient.post<{ message: string }>("/auth/2fa/disable", data);
    },
    onSuccess: () => {
      // Invalidate 2FA status query to reflect the new state
      queryClient.invalidateQueries({ queryKey: ["2fa-status"] });
    },
  });
};

/**
 * Hook to get the current 2FA status
 */
export const useGet2FAStatus = () => {
  return useQuery({
    queryKey: ["2fa-status"],
    queryFn: async () => {
      return apiClient.get<TwoFactorStatusResponse>("/auth/2fa/status");
    },
    staleTime: 30000, // Consider data stale after 30 seconds
  });
};

/**
 * Hook to regenerate backup codes - requires current TOTP code
 */
export const useRegenerateBackupCodes = () => {
  return useMutation({
    mutationFn: async (data: TwoFactorVerifyRequest) => {
      return apiClient.post<TwoFactorBackupCodesResponse>(
        "/auth/2fa/backup-codes",
        data
      );
    },
  });
};

export const logout = () => {
  apiClient.clearToken();
  apiClient.clear2FAToken();
};
