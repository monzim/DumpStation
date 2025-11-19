import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin, useVerify } from "@/lib/api/auth";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Database, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: RouteComponent,
});

function RouteComponent() {
  const [step, setStep] = useState<"login" | "verify">("login");
  const [username, setUsername] = useState("admin");
  const [otp, setOtp] = useState("");
  const navigate = useNavigate();
  const { setIsAuthenticated } = useAuth();
  const loginMutation = useLogin();
  const verifyMutation = useVerify();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await loginMutation.mutateAsync({ username });
      toast.success("OTP sent successfully", {
        description: "Check your Discord for the verification code.",
      });
      setStep("verify");
    } catch (error: unknown) {
      const apiError = error as { message?: string };
      toast.error("Login failed", {
        description: apiError.message || "Failed to send OTP",
      });
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await verifyMutation.mutateAsync({ username, otp });
      toast.success("Login successful", {
        description: "Welcome to the PostgreSQL Backup Service.",
      });
      setIsAuthenticated(true);
      navigate({
        to: "/dashboard",
      });
    } catch (error: unknown) {
      const apiError = error as { message?: string };
      toast.error("Verification failed", {
        description: apiError.message || "Invalid or expired OTP",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center mb-8">
          <div className="bg-primary text-primary-foreground p-3 rounded-lg">
            <Database className="h-8 w-8" />
          </div>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">
              {step === "login" ? "Welcome Back" : "Verify OTP"}
            </CardTitle>
            <CardDescription className="text-center">
              {step === "login"
                ? "Sign in to access your PostgreSQL backup dashboard"
                : "Enter the verification code sent to Discord"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === "login" ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="admin"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={loginMutation.isPending}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending OTP...
                    </>
                  ) : (
                    "Send OTP"
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerify} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="otp">Verification Code</Label>
                  <Input
                    id="otp"
                    type="text"
                    placeholder="123456"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    disabled={verifyMutation.isPending}
                    maxLength={6}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Use <span className="font-mono font-semibold">123456</span>{" "}
                    for demo
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep("login")}
                    disabled={verifyMutation.isPending}
                    className="flex-1"
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={verifyMutation.isPending}
                  >
                    {verifyMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      "Verify"
                    )}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
