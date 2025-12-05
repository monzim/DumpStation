import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiClient } from "@/lib/api/client";
import { useNavigate } from "@tanstack/react-router";
import { LogIn } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

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
  const [showSessionExpired, setShowSessionExpired] = useState(false);
  const navigate = useNavigate();

  const handleSessionExpired = useCallback(() => {
    setIsAuthenticated(false);
    setIsDemo(false);
    setShowSessionExpired(true);
  }, []);

  useEffect(() => {
    // Register session expired callback with API client
    apiClient.setSessionExpiredCallback(handleSessionExpired);

    // Check if token exists in localStorage
    const token = apiClient.getToken();
    setIsAuthenticated(!!token);
    setIsDemo(apiClient.getIsDemo());
  }, [handleSessionExpired]);

  const logout = () => {
    apiClient.clearToken();
    setIsAuthenticated(false);
    setIsDemo(false);
    navigate({ to: "/login" });
  };

  const handleRelogin = () => {
    setShowSessionExpired(false);
    navigate({ to: "/login" });
  };

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, setIsAuthenticated, isDemo, setIsDemo, logout }}
    >
      {children}

      {/* Session Expired Dialog */}
      <AlertDialog
        open={showSessionExpired}
        onOpenChange={setShowSessionExpired}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <LogIn className="h-5 w-5 text-primary" />
              Session Expired
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your session has expired or is no longer valid. Please log in
              again to continue using DumpStation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleRelogin}>
              Log In Again
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
