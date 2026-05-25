import { useAuth } from "@/components/auth-provider";
import { Eyebrow } from "@/components/ui/eyebrow";
import { apiClient } from "@/lib/api/client";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

// The backend's /auth/github/callback handler 302s here with the freshly
// minted JWT in the query string. We stash it in the apiClient, flip
// auth-provider state, and navigate to the dashboard. Putting this in a
// dedicated route keeps secret material out of the browser history of the
// API origin — it lives in the SPA's history instead, which the very next
// replaceState below scrubs.
export const Route = createFileRoute("/auth/github/return")({
  component: GitHubReturn,
});

function GitHubReturn() {
  const navigate = useNavigate();
  const { setIsAuthenticated, setIsDemo } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const exp = params.get("exp");

    if (!token) {
      toast.error("GitHub sign-in failed", {
        description: "No token in callback URL.",
      });
      navigate({ to: "/login" });
      return;
    }

    apiClient.setToken(token);
    apiClient.setIsDemo(false);
    setIsDemo(false);
    if (exp) {
      apiClient.setTokenExpiresAt(exp);
    }
    setIsAuthenticated(true);

    window.history.replaceState({}, "", "/auth/github/return");

    toast.success("Signed in with GitHub");
    navigate({ to: "/dashboard" });
  }, [navigate, setIsAuthenticated, setIsDemo]);

  return (
    <div className="min-h-screen bg-canvas text-on-primary flex items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="size-10 animate-spin text-on-primary mx-auto" />
        <Eyebrow>Signing you in</Eyebrow>
        <p className="text-subtitle text-ash">Finishing GitHub sign-in…</p>
      </div>
    </div>
  );
}
