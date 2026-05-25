import type {
  AuthResponse,
  AuthResponseWith2FA,
  DemoAuthResponse,
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

// AuthConfig advertises which login methods this deployment has enabled so
// the login page can render only the buttons that will actually work.
export interface AuthConfigResponse {
  discord_enabled: boolean;
  github_enabled: boolean;
  demo_enabled: boolean;
}

export const useAuthConfig = () => {
  return useQuery<AuthConfigResponse>({
    queryKey: ["auth-config"],
    queryFn: async () => apiClient.get<AuthConfigResponse>("/auth/config"),
    staleTime: 5 * 60 * 1000,
  });
};

// startGitHubLogin redirects the browser to the backend handler which then
// 302s on to GitHub. Doing the redirect server-side keeps the OAuth state
// cookie HTTP-only and bound to the JWT secret.
export const startGitHubLogin = () => {
  const base = apiClient.getBaseURL();
  window.location.assign(`${base}/auth/github/login`);
};

// Session refresh + extension. The SessionGuard component invokes this on
// a slide-forward schedule; user code can also call it from the manual
// "Stay signed in" toast button.
export interface RefreshResponse {
  token: string;
  expires_at: string;
  session_expires_at: string;
}

export const refreshSession = async (): Promise<RefreshResponse> => {
  const data = await apiClient.post<RefreshResponse>("/auth/refresh");
  apiClient.setToken(data.token);
  apiClient.setTokenExpiresAt(data.expires_at);
  apiClient.setSessionExpiresAt(data.session_expires_at);
  return data;
};

// serverLogout fires a best-effort audit log before the client drops the
// token. The 204 response is fine to ignore.
export const serverLogout = async () => {
  try {
    await apiClient.post<void>("/auth/logout");
  } catch {
    // best-effort; the token is being cleared either way
  }
};

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

// Demo login hook - instantly login as demo user
export const useDemoLogin = () => {
  return useMutation({
    mutationFn: async () => {
      return apiClient.post<DemoAuthResponse>("/auth/demo-login");
    },
    onSuccess: (data) => {
      apiClient.setToken(data.token);
      apiClient.setIsDemo(data.is_demo);
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
