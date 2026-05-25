import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertBanner } from "@/components/ui/alert-banner";
import { Wordmark } from "@/components/ui/wordmark";
import {
  startGitHubLogin,
  useAuthConfig,
  useDemoLogin,
  useLogin,
  useVerify,
  useVerify2FA,
} from "@/lib/api/auth";
import { apiClient } from "@/lib/api/client";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Github,
  Loader2,
  MessageCircle,
  Play,
  Shield,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Turnstile } from "@marsidev/react-turnstile";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Sign In - DumpStation" },
      {
        name: "description",
        content:
          "Sign in to DumpStation to manage your PostgreSQL database backups. Secure Discord-based OTP authentication.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Sign In - DumpStation" },
      {
        property: "og:description",
        content: "Access your DumpStation dashboard to manage PostgreSQL backups.",
      },
      {
        property: "og:url",
        content: "https://dumpstation.monzim.com/login",
      },
      { name: "twitter:title", content: "Sign In - DumpStation" },
      {
        name: "twitter:description",
        content: "Access your DumpStation dashboard to manage PostgreSQL backups.",
      },
    ],
    links: [
      { rel: "canonical", href: "https://dumpstation.monzim.com/login" },
    ],
  }),
});

type LoginStep = "login" | "verify" | "2fa";

// Runtime configuration helper — runtime APP_CONFIG (Docker) takes
// precedence over build-time env (Cloudflare).
const getConfig = (
  key: string,
  envValue: string | undefined,
  fallback: string,
): string => {
  if (typeof window !== "undefined" && (window as any).APP_CONFIG?.[key]) {
    return (window as any).APP_CONFIG[key];
  }
  return envValue || fallback;
};

const TURNSTILE_SITE_KEY = getConfig(
  "TURNSTILE_SITE_KEY",
  import.meta.env.VITE_TURNSTILE_SITE_KEY,
  "",
);
const TURNSTILE_ENABLED = TURNSTILE_SITE_KEY !== "";

function LoginPage() {
  const [step, setStep] = useState<LoginStep>("login");
  const [username, setUsername] = useState("");
  const [otp, setOtp] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const navigate = useNavigate();
  const { setIsAuthenticated, setIsDemo } = useAuth();
  const loginMutation = useLogin();
  const verifyMutation = useVerify();
  const verify2FAMutation = useVerify2FA();
  const demoLoginMutation = useDemoLogin();
  const authConfig = useAuthConfig();

  // GitHub OAuth callback bounces failures back here with ?github_error=...
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const err = params.get("github_error");
    if (!err) return;
    const human: Record<string, string> = {
      not_allowed: "This GitHub account is not on the allow-list.",
      state_mismatch: "Sign-in attempt expired or was tampered with.",
      missing_state: "Sign-in attempt was incomplete.",
      missing_state_cookie: "Sign-in cookie missing. Try again.",
      missing_code: "GitHub did not return an authorization code.",
      exchange_failed: "Could not exchange GitHub code. Try again.",
      upsert_failed: "Server could not register this account.",
      token_failed: "Could not mint a session token.",
    };
    toast.error("GitHub sign-in failed", {
      description: human[err] ?? err,
    });
    params.delete("github_error");
    const next =
      window.location.pathname +
      (params.toString() ? "?" + params.toString() : "");
    window.history.replaceState({}, "", next);
  }, []);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!username.trim()) {
      toast.error("Username required", {
        description: "Please enter your username or email",
      });
      return;
    }

    if (TURNSTILE_ENABLED && !turnstileToken) {
      toast.error("Security verification required", {
        description: "Please complete the security challenge",
      });
      return;
    }

    try {
      await loginMutation.mutateAsync({
        username: username.trim(),
        turnstile_token: turnstileToken || undefined,
      });
      toast.success("OTP sent", {
        description: "Check Discord for the 6-digit code.",
      });
      setStep("verify");
    } catch {
      // Auth endpoints intentionally use a single generic message: echoing
      // the API error would let an attacker enumerate valid usernames.
      toast.error("Login failed", {
        description: "Unable to start login. Check your details and try again.",
      });
      setTurnstileToken("");
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await verifyMutation.mutateAsync({
        username: username.trim(),
        otp,
      });
      if (response.requires_2fa) {
        setOtp("");
        setStep("2fa");
        toast.info("Two-factor required", {
          description: "Enter your authenticator code.",
        });
      } else {
        toast.success("Signed in");
        setIsAuthenticated(true);
        navigate({ to: "/dashboard" });
      }
    } catch {
      toast.error("Verification failed", {
        description: "Invalid or expired code. Please try again.",
      });
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await verify2FAMutation.mutateAsync({ code: twoFactorCode });
      toast.success("Signed in");
      setIsAuthenticated(true);
      navigate({ to: "/dashboard" });
    } catch {
      toast.error("2FA failed", {
        description: "Invalid code. Please try again.",
      });
      setTwoFactorCode("");
    }
  };

  const handleBack = () => {
    if (step === "2fa") {
      setStep("verify");
      setTwoFactorCode("");
    } else if (step === "verify") {
      setStep("login");
      setOtp("");
    }
  };

  const handleResendOTP = async () => {
    try {
      await loginMutation.mutateAsync({
        username: username.trim(),
        turnstile_token: turnstileToken || undefined,
      });
      toast.success("OTP resent");
    } catch (error: unknown) {
      const apiError = error as { message?: string };
      toast.error("Failed to resend OTP", {
        description: apiError.message || "Please try again",
      });
    }
  };

  const handleDemoLogin = async () => {
    try {
      const response = await demoLoginMutation.mutateAsync();
      toast.success("Demo workspace ready", {
        description: response.message || "Read-only access enabled.",
      });
      setIsAuthenticated(true);
      setIsDemo(true);
      apiClient.setIsDemo(true);
      navigate({ to: "/dashboard" });
    } catch (error: unknown) {
      const apiError = error as { message?: string };
      toast.error("Demo login failed", {
        description: apiError.message || "Unable to login as demo user",
      });
    }
  };

  const eyebrowLabel =
    step === "login"
      ? "Authentication"
      : step === "verify"
        ? "OTP Verification"
        : "Two-Factor Authentication";

  const titleText =
    step === "login"
      ? "Sign in to DumpStation."
      : step === "verify"
        ? "Enter your code."
        : "Two-factor authentication.";

  const subtitleText =
    step === "login"
      ? "Use your Discord username or email. We'll send a 6-digit code."
      : step === "verify"
        ? "We've sent a 6-digit code to your Discord."
        : "Enter the code from your authenticator app, or a backup code.";

  return (
    <div className="min-h-screen bg-canvas text-on-primary flex flex-col">
      <header className="bg-canvas">
        <div className="container mx-auto max-w-[1640px] px-6 lg:px-12 h-16 flex items-center justify-between">
          <Wordmark size="md" to="/" />
          <Button variant="ghost-dark" asChild>
            <Link to="/">
              <ArrowLeft className="size-4" />
              Back home
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md space-y-10">
          <div className="space-y-4">
            <Eyebrow>{eyebrowLabel}</Eyebrow>
            <h1 className="text-display-sm text-on-primary">{titleText}</h1>
            <p className="text-subtitle text-ash">{subtitleText}</p>
          </div>

          {step === "login" && (
            <form onSubmit={handleLogin} className="space-y-6">
              {authConfig.data?.github_enabled && (
                <>
                  <Button
                    type="button"
                    variant="secondary-dark"
                    size="lg"
                    onClick={() => startGitHubLogin()}
                    className="w-full"
                  >
                    <Github className="size-4" />
                    Continue with GitHub
                  </Button>
                  <MonoDivider label="Or with Discord" />
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="username">Username or email</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="discord-handle or email"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={
                    loginMutation.isPending || demoLoginMutation.isPending
                  }
                  required
                  autoFocus
                  autoComplete="username"
                />
              </div>

              {TURNSTILE_ENABLED && (
                <div className="flex justify-center">
                  <Turnstile
                    siteKey={TURNSTILE_SITE_KEY}
                    onSuccess={(token) => setTurnstileToken(token)}
                    onError={() => {
                      setTurnstileToken("");
                      toast.error("Security verification failed");
                    }}
                    onExpire={() => {
                      setTurnstileToken("");
                      toast.warning("Security verification expired");
                    }}
                    options={{ theme: "dark", size: "normal" }}
                  />
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                disabled={
                  loginMutation.isPending ||
                  demoLoginMutation.isPending ||
                  !username.trim() ||
                  (TURNSTILE_ENABLED && !turnstileToken)
                }
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Sending OTP…
                  </>
                ) : (
                  <>
                    <MessageCircle className="size-4" />
                    Continue with Discord
                  </>
                )}
              </Button>

              <MonoDivider label="Or just look around" />

              <Button
                type="button"
                variant="ghost-dark"
                size="lg"
                onClick={handleDemoLogin}
                disabled={
                  loginMutation.isPending || demoLoginMutation.isPending
                }
                className="w-full"
              >
                {demoLoginMutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Loading demo…
                  </>
                ) : (
                  <>
                    <Play className="size-4" />
                    Try the demo workspace
                  </>
                )}
              </Button>

              <p className="text-caption text-mute text-center">
                Demo accounts have read-only access to a sample workspace.
              </p>
            </form>
          )}

          {step === "verify" && (
            <form onSubmit={handleVerify} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="otp">6-digit code</Label>
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) =>
                    setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  disabled={verifyMutation.isPending}
                  maxLength={6}
                  required
                  autoFocus
                  className="h-14 text-center font-mono text-heading-md tracking-[0.4em] placeholder:tracking-[0.4em] placeholder:text-mute"
                />
                <p className="text-caption text-mute text-center">
                  Posted to your Discord just now.
                </p>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                disabled={verifyMutation.isPending || otp.length !== 6}
              >
                {verifyMutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Verifying…
                  </>
                ) : (
                  "Verify and continue"
                )}
              </Button>

              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost-dark"
                  onClick={handleBack}
                  disabled={verifyMutation.isPending}
                >
                  <ArrowLeft className="size-4" />
                  Back
                </Button>
                <Button
                  type="button"
                  variant="ghost-dark"
                  onClick={handleResendOTP}
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? "Resending…" : "Resend code"}
                </Button>
              </div>
            </form>
          )}

          {step === "2fa" && (
            <form onSubmit={handleVerify2FA} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="2fa-code">Authenticator code</Label>
                <Input
                  id="2fa-code"
                  type="text"
                  placeholder="00000000"
                  value={twoFactorCode}
                  onChange={(e) => {
                    const value = e.target.value.toUpperCase();
                    const cleaned = value.replace(/[^A-Z0-9-]/g, "");
                    setTwoFactorCode(cleaned.slice(0, 14));
                  }}
                  disabled={verify2FAMutation.isPending}
                  maxLength={14}
                  required
                  autoFocus
                  className="h-14 text-center font-mono text-heading-sm tracking-[0.2em] placeholder:tracking-[0.2em] placeholder:text-mute"
                />
              </div>

              <AlertBanner
                tone="info"
                icon={<Shield className="size-4" />}
                title="Lost your authenticator?"
              >
                Enter one of your backup codes (e.g., 7DOK-EE4H-P54Q) instead.
              </AlertBanner>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                disabled={
                  verify2FAMutation.isPending || twoFactorCode.length < 8
                }
              >
                {verify2FAMutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Verifying…
                  </>
                ) : (
                  "Verify and sign in"
                )}
              </Button>

              <Button
                type="button"
                variant="ghost-dark"
                onClick={handleBack}
                disabled={verify2FAMutation.isPending}
                className="w-full"
              >
                <ArrowLeft className="size-4" />
                Back to OTP
              </Button>
            </form>
          )}
        </div>
      </main>

      <footer className="bg-canvas border-t border-hairline-soft">
        <div className="container mx-auto max-w-[1640px] px-6 lg:px-12 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-mono-caps text-mute uppercase">
            DumpStation · PostgreSQL backup service
          </p>
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="text-mono-eyebrow text-ash uppercase hover:text-on-primary transition-colors"
            >
              Home
            </Link>
            <a
              href="https://github.com/monzim/DumpStation"
              target="_blank"
              rel="noreferrer noopener"
              className="text-mono-eyebrow text-ash uppercase hover:text-on-primary transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function MonoDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-hairline-soft" />
      <span className="text-mono-caps text-mute uppercase">{label}</span>
      <div className="h-px flex-1 bg-hairline-soft" />
    </div>
  );
}
