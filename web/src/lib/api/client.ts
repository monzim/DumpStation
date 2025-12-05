import type { ApiError } from "@/lib/types/api";

// Use Vite's import.meta.env for environment variables
// VITE_API_BASE_URL is set at build time via .env files or Cloudflare vars
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api/v1";

const TWO_FA_TOKEN_KEY = "2fa_token";
const IS_DEMO_KEY = "is_demo";

export class ApiClient {
  private token: string | null = null;
  private twoFAToken: string | null = null;
  private isDemo: boolean = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("auth_token");
      this.twoFAToken = sessionStorage.getItem(TWO_FA_TOKEN_KEY);
      this.isDemo = localStorage.getItem(IS_DEMO_KEY) === "true";
    }
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
