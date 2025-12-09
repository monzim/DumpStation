import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useDemoLogin,
  useLogin,
  useVerify,
  useVerify2FA,
} from "@/lib/api/auth";
import { apiClient } from "@/lib/api/client";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Database,
  KeyRound,
  Loader2,
  MessageCircle,
  Play,
  Shield,
  Smartphone,
  User,
} from "lucide-react";
import { useState } from "react";
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
      {
        name: "robots",
        content: "noindex, nofollow",
      },
      // Open Graph
      {
        property: "og:title",
        content: "Sign In - DumpStation",
      },
      {
        property: "og:description",
        content:
          "Access your DumpStation dashboard to manage PostgreSQL backups.",
      },
      {
        property: "og:url",
        content: "https://dumpstation.monzim.com/login",
      },
      // Twitter Card
      {
        name: "twitter:title",
        content: "Sign In - DumpStation",
      },
      {
        name: "twitter:description",
        content:
          "Access your DumpStation dashboard to manage PostgreSQL backups.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://dumpstation.monzim.com/login",
      },
    ],
  }),
});

type LoginStep = "login" | "verify" | "2fa";

// Get Turnstile site key from environment variable
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
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

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!username.trim()) {
      toast.error("Username required", {
        description: "Please enter your username or email",
      });
      return;
    }

    // Check Turnstile verification if enabled
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
      toast.success("OTP sent successfully", {
        description: "Check your Discord for the verification code.",
      });
      setStep("verify");
    } catch (error: unknown) {
      const apiError = error as { message?: string };
      toast.error("Login failed", {
        description: apiError.message || "Invalid credentials",
      });
      // Reset Turnstile on error
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

      // Check if 2FA is required
      if (response.requires_2fa) {
        setOtp(""); // Clear OTP field
        setStep("2fa");
        toast.info("Two-factor authentication required", {
          description: "Please enter your authenticator code.",
        });
      } else {
        toast.success("Login successful", {
          description: "Welcome to the PostgreSQL Backup Service.",
        });
        setIsAuthenticated(true);
        navigate({ to: "/dashboard" });
      }
    } catch (error: unknown) {
      const apiError = error as { message?: string };
      toast.error("Verification failed", {
        description: apiError.message || "Invalid or expired OTP",
      });
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await verify2FAMutation.mutateAsync({ code: twoFactorCode });
      toast.success("Login successful", {
        description: "Welcome to the PostgreSQL Backup Service.",
      });
      setIsAuthenticated(true);
      navigate({ to: "/dashboard" });
    } catch (error: unknown) {
      const apiError = error as { message?: string };
      toast.error("2FA verification failed", {
        description: apiError.message || "Invalid code. Please try again.",
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
      toast.success("OTP resent", {
        description: "Check your Discord for the new verification code.",
      });
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
      toast.success("Demo login successful", {
        description: response.message || "Welcome to the demo!",
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

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left Panel - Branding (hidden on mobile, visible on lg+) */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-2/5 bg-linear-to-br from-primary via-primary/90 to-primary/80 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-white rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 text-primary-foreground w-full">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl group-hover:bg-white/30 transition-colors">
              <Database className="h-7 w-7" />
            </div>
            <span className="text-2xl font-bold">DumpStation</span>
          </Link>

          {/* Hero Content */}
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl xl:text-5xl font-bold leading-tight">
                Secure PostgreSQL Backup Management
              </h1>
              <p className="text-lg text-primary-foreground/80 leading-relaxed max-w-md">
                Automate your database backups with cloud storage, smart
                scheduling, and real-time notifications.
              </p>
            </div>

            {/* Features */}
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">Enterprise Security</p>
                  <p className="text-sm text-primary-foreground/70">
                    JWT authentication & encrypted backups
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">Discord Integration</p>
                  <p className="text-sm text-primary-foreground/70">
                    OTP verification & instant alerts
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <p className="text-sm text-primary-foreground/60">
            © {new Date().getFullYear()} monzim.com. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex flex-col min-h-screen bg-background">
        {/* Mobile Header */}
        <header className="lg:hidden border-b bg-background/80 backdrop-blur-md sticky top-0 z-50">
          <div className="flex items-center justify-between px-4 py-4">
            <Link to="/" className="flex items-center gap-2">
              <div className="bg-primary text-primary-foreground p-2 rounded-xl">
                <Database className="h-5 w-5" />
              </div>
              <span className="font-bold text-lg bg-linear-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                DumpStation
              </span>
            </Link>
          </div>
        </header>

        {/* Form Container */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-8 lg:p-12">
          <div className="w-full max-w-sm space-y-8">
            {/* Form Header */}
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mb-4">
                {step === "login" ? (
                  <User className="h-8 w-8 text-primary" />
                ) : step === "verify" ? (
                  <KeyRound className="h-8 w-8 text-primary" />
                ) : (
                  <Smartphone className="h-8 w-8 text-primary" />
                )}
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                {step === "login"
                  ? "Welcome back"
                  : step === "verify"
                    ? "Enter verification code"
                    : "Two-factor authentication"}
              </h2>
              <p className="text-muted-foreground">
                {step === "login"
                  ? "Enter your username or email to sign in"
                  : step === "verify"
                    ? "We've sent a code to your Discord"
                    : "Enter the code from your authenticator app"}
              </p>
            </div>

            {/* Login Step */}
            {step === "login" ? (
              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-3">
                  <Label htmlFor="username" className="text-sm font-medium">
                    Username or Email
                  </Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="Enter your username or email"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={
                      loginMutation.isPending || demoLoginMutation.isPending
                    }
                    required
                    autoFocus
                    autoComplete="username"
                    className="h-12"
                  />
                </div>

                {/* Cloudflare Turnstile Widget */}
                {TURNSTILE_ENABLED && (
                  <div className="flex justify-center">
                    <Turnstile
                      siteKey={TURNSTILE_SITE_KEY}
                      onSuccess={(token) => setTurnstileToken(token)}
                      onError={() => {
                        setTurnstileToken("");
                        toast.error("Security verification failed", {
                          description: "Please try again",
                        });
                      }}
                      onExpire={() => {
                        setTurnstileToken("");
                        toast.warning("Security verification expired", {
                          description: "Please verify again",
                        });
                      }}
                      options={{
                        theme: "auto",
                        size: "normal",
                      }}
                    />
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={
                    loginMutation.isPending ||
                    demoLoginMutation.isPending ||
                    !username.trim() ||
                    (TURNSTILE_ENABLED && !turnstileToken)
                  }
                  className="w-full h-12 text-base"
                  size="lg"
                >
                  {loginMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Sending OTP...
                    </>
                  ) : (
                    <>
                      <MessageCircle className="mr-2 h-5 w-5" />
                      Continue with Discord
                    </>
                  )}
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Or try it out
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDemoLogin}
                  disabled={
                    loginMutation.isPending || demoLoginMutation.isPending
                  }
                  className="w-full h-12 text-base border-primary/20 hover:bg-primary/5"
                  size="lg"
                >
                  {demoLoginMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Loading demo...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-5 w-5" />
                      Try Demo Account
                    </>
                  )}
                </Button>

                <p className="text-center text-sm text-muted-foreground">
                  Demo account has read-only access to explore the system.
                </p>
              </form>
            ) : step === "verify" ? (
              /* Verify Step */
              <form onSubmit={handleVerify} className="space-y-6">
                <div className="space-y-3">
                  <Label htmlFor="otp" className="text-sm font-medium">
                    Verification Code
                  </Label>
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
                    className="h-14 text-center text-2xl font-mono tracking-[0.5em] placeholder:tracking-[0.5em]"
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    Enter the 6-digit code from Discord
                  </p>
                </div>

                <div className="space-y-3">
                  <Button
                    type="submit"
                    className="w-full h-12 text-base"
                    size="lg"
                    disabled={verifyMutation.isPending || otp.length !== 6}
                  >
                    {verifyMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      "Verify & Continue"
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleBack}
                    disabled={verifyMutation.isPending}
                    className="w-full"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to login
                  </Button>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Didn't receive it?
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResendOTP}
                  disabled={loginMutation.isPending}
                  className="w-full"
                >
                  {loginMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Resending...
                    </>
                  ) : (
                    "Resend code"
                  )}
                </Button>
              </form>
            ) : (
              /* 2FA Step */
              <form onSubmit={handleVerify2FA} className="space-y-6">
                <div className="space-y-3">
                  <Label htmlFor="2fa-code" className="text-sm font-medium">
                    Authenticator Code
                  </Label>
                  <Input
                    id="2fa-code"
                    type="text"
                    placeholder="00000000 or XXXX-XXXX-XXXX"
                    value={twoFactorCode}
                    onChange={(e) => {
                      // Allow digits for TOTP or alphanumeric with dashes for backup codes
                      const value = e.target.value.toUpperCase();
                      // Remove any character that's not alphanumeric or dash
                      const cleaned = value.replace(/[^A-Z0-9-]/g, "");
                      setTwoFactorCode(cleaned.slice(0, 14));
                    }}
                    disabled={verify2FAMutation.isPending}
                    maxLength={14}
                    required
                    autoFocus
                    className="h-14 text-center text-xl font-mono tracking-widest placeholder:tracking-normal placeholder:text-base"
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    Enter your 8-digit TOTP code or backup code (XXXX-XXXX-XXXX)
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-muted/50 border border-border/50">
                  <div className="flex gap-3">
                    <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        Using a backup code?
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Enter one of your backup codes (e.g., 7DOK-EE4H-P54Q) if
                        you've lost access to your authenticator.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Button
                    type="submit"
                    className="w-full h-12 text-base"
                    size="lg"
                    disabled={
                      verify2FAMutation.isPending || twoFactorCode.length < 8
                    }
                  >
                    {verify2FAMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      "Verify & Sign In"
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleBack}
                    disabled={verify2FAMutation.isPending}
                    className="w-full"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to OTP verification
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Desktop Footer */}
        <footer className="hidden lg:block border-t py-6 px-12">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>PostgreSQL Backup Service</p>
            <div className="flex items-center gap-4">
              <Link to="/" className="hover:text-foreground transition-colors">
                Home
              </Link>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
