import type {
  AuthResponse,
  LoginRequest,
  VerifyRequest,
} from "@/lib/types/api";
import { useMutation } from "@tanstack/react-query";
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
      return apiClient.post<AuthResponse>("/auth/verify", data);
    },
    onSuccess: (data) => {
      apiClient.setToken(data.token);
    },
  });
};

export const logout = () => {
  apiClient.clearToken();
};
