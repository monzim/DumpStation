import type { ApiError } from "@/lib/types/api";

// Runtime configuration helper
// Checks window.APP_CONFIG first (can be set after build), then falls back to build-time env vars
const getConfig = (key: string, defaultValue: string): string => {
  if (typeof window !== "undefined" && (window as any).APP_CONFIG) {
    return (window as any).APP_CONFIG[key] || defaultValue;
  }
  return defaultValue;
};

const API_BASE_URL = getConfig(
  "API_BASE_URL",
  import.meta.env.VITE_API_BASE_URL ||
    "https://api.dumpstation.monzim.com/api/v1"
);

const TWO_FA_TOKEN_KEY = "2fa_token";
const IS_DEMO_KEY = "is_demo";

// Session expiration callback type
type SessionExpiredCallback = () => void;

export class ApiClient {
  private token: string | null = null;
  private twoFAToken: string | null = null;
  private isDemo: boolean = false;
  private onSessionExpired: SessionExpiredCallback | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("auth_token");
      this.twoFAToken = sessionStorage.getItem(TWO_FA_TOKEN_KEY);
      this.isDemo = localStorage.getItem(IS_DEMO_KEY) === "true";
    }
  }

  /**
   * Register a callback to be called when the session expires (401 Unauthorized)
   */
  setSessionExpiredCallback(callback: SessionExpiredCallback) {
    this.onSessionExpired = callback;
  }

  setToken(token: string) {
    this.token = token;
    if (typeof window !== "undefined") {
      localStorage.setItem("auth_token", token);
    }
  }

  clearToken() {
    this.token = null;
    this.isDemo = false;
    if (typeof window !== "undefined") {
      localStorage.removeItem("auth_token");
      localStorage.removeItem(IS_DEMO_KEY);
    }
  }

  getToken(): string | null {
    return this.token;
  }

  setIsDemo(isDemo: boolean) {
    this.isDemo = isDemo;
    if (typeof window !== "undefined") {
      localStorage.setItem(IS_DEMO_KEY, isDemo ? "true" : "false");
    }
  }

  getIsDemo(): boolean {
    return this.isDemo;
  }

  set2FAToken(token: string) {
    this.twoFAToken = token;
    if (typeof window !== "undefined") {
      sessionStorage.setItem(TWO_FA_TOKEN_KEY, token);
    }
  }

  clear2FAToken() {
    this.twoFAToken = null;
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(TWO_FA_TOKEN_KEY);
    }
  }

  get2FAToken(): string | null {
    return this.twoFAToken;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      // Handle 401 Unauthorized - session expired
      if (response.status === 401) {
        // Clear tokens
        this.clearToken();
        this.clear2FAToken();

        // Trigger session expired callback if registered
        if (this.onSessionExpired) {
          this.onSessionExpired();
        }
      }

      const error: ApiError = await response.json().catch(() => ({
        message: `HTTP ${response.status}: ${response.statusText}`,
      }));

      throw error;
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  private buildHeaders(use2FAToken = false): HeadersInit {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (use2FAToken && this.twoFAToken) {
      headers["X-2FA-Token"] = this.twoFAToken;
    } else if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    return headers;
  }

  async get<T>(endpoint: string, use2FAToken = false): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "GET",
      headers: this.buildHeaders(use2FAToken),
    });

    return this.handleResponse<T>(response);
  }

  async post<T>(
    endpoint: string,
    data?: unknown,
    use2FAToken = false
  ): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: this.buildHeaders(use2FAToken),
      body: data ? JSON.stringify(data) : undefined,
    });

    return this.handleResponse<T>(response);
  }

  async put<T>(
    endpoint: string,
    data: unknown,
    use2FAToken = false
  ): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "PUT",
      headers: this.buildHeaders(use2FAToken),
      body: JSON.stringify(data),
    });

    return this.handleResponse<T>(response);
  }

  async delete<T>(endpoint: string, use2FAToken = false): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "DELETE",
      headers: this.buildHeaders(use2FAToken),
    });

    return this.handleResponse<T>(response);
  }
}

export const apiClient = new ApiClient();

/**
 * Get the current auth token from the API client
 * Useful for constructing authenticated URLs for image requests
 */
export const getAuthToken = (): string | null => {
  return apiClient.getToken();
};

/**
 * Get the API base URL
 */
export const getApiBaseUrl = (): string => {
  return getConfig(
    "API_BASE_URL",
    import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api/v1"
  );
};
