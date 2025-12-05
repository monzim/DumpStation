import { apiClient } from "@/lib/api/client";
import { useNavigate } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useState } from "react";

interface AuthContextType {
  isAuthenticated: boolean;
  setIsAuthenticated: (value: boolean) => void;
  isDemo: boolean;
  setIsDemo: (value: boolean) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if token exists in localStorage
    const token = apiClient.getToken();
    setIsAuthenticated(!!token);
    setIsDemo(apiClient.getIsDemo());
  }, []);

  const logout = () => {
    apiClient.clearToken();
    setIsAuthenticated(false);
    setIsDemo(false);
    navigate({ to: "/login" });
  };

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, setIsAuthenticated, isDemo, setIsDemo, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
