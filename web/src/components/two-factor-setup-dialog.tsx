import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSetup2FA, useVerifySetup2FA } from "@/lib/api/auth";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Loader2,
  QrCode,
  Shield,
  Smartphone,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

interface TwoFactorSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSetupComplete?: () => void;
}

type SetupStep = "intro" | "qrcode" | "verify" | "backup" | "complete";

export function TwoFactorSetupDialog({
  open,
  onOpenChange,
  onSetupComplete,
}: TwoFactorSetupDialogProps) {
  const [step, setStep] = useState<SetupStep>("intro");
  const [verificationCode, setVerificationCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);

  const setup2FAMutation = useSetup2FA();
  const verifySetup2FAMutation = useVerifySetup2FA();

  const handleStartSetup = async () => {
    try {
      const response = await setup2FAMutation.mutateAsync();
      setQrCode(response.qr_code_data_url);
      setSecret(response.secret);
      setStep("qrcode");
    } catch (error: unknown) {
      const apiError = error as { message?: string };
      toast.error("Failed to start 2FA setup", {
        description: apiError.message || "Please try again later.",
      });
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await verifySetup2FAMutation.mutateAsync({
        code: verificationCode,
      });
      setBackupCodes(response.codes);
      setStep("backup");
      toast.success("2FA enabled successfully");
    } catch (error: unknown) {
      const apiError = error as { message?: string };
      toast.error("Verification failed", {
        description: apiError.message || "Invalid code. Please try again.",
      });
      setVerificationCode("");
    }
  };

  const handleCopySecret = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopiedSecret(true);
      toast.success("Secret copied to clipboard");
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      toast.error("Failed to copy secret");
    }
  }, [secret]);

  const handleCopyBackupCodes = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(backupCodes.join("\n"));
      setCopiedCodes(true);
      toast.success("Backup codes copied to clipboard");
      setTimeout(() => setCopiedCodes(false), 2000);
    } catch {
      toast.error("Failed to copy backup codes");
    }
  }, [backupCodes]);

  const handleDownloadBackupCodes = useCallback(() => {
    const content = `DumpStation - Two-Factor Authentication Backup Codes
=================================================

These are your backup codes. Each code can only be used once.
Store them somewhere safe and secure.

Generated: ${new Date().toISOString()}

${backupCodes.map((code, i) => `${i + 1}. ${code}`).join("\n")}

---
Keep these codes secure. Do not share them with anyone.
`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dumpstation-2fa-backup-codes.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Backup codes downloaded");
  }, [backupCodes]);

  const handleComplete = () => {
    setStep("complete");
    setTimeout(() => {
      onSetupComplete?.();
      handleClose();
    }, 2000);
  };

  const handleClose = () => {
    // Reset state when closing
    setStep("intro");
    setVerificationCode("");
    setQrCode("");
    setSecret("");
    setBackupCodes([]);
    setCopiedSecret(false);
    setCopiedCodes(false);
    onOpenChange(false);
  };

  const renderStepIndicator = () => {
    const steps = [
      { key: "intro", label: "Start" },
      { key: "qrcode", label: "Scan" },
      { key: "verify", label: "Verify" },
      { key: "backup", label: "Backup" },
    ];

    const currentIndex = steps.findIndex((s) => s.key === step);

    return (
      <div className="flex items-center justify-center gap-2 mb-6">
        {steps.map((s, index) => (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                index < currentIndex
                  ? "bg-primary text-primary-foreground"
                  : index === currentIndex
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {index < currentIndex ? <Check className="h-4 w-4" /> : index + 1}
            </div>
            {index < steps.length - 1 && (
              <div
                className={`w-8 h-0.5 transition-colors ${
                  index < currentIndex ? "bg-primary" : "bg-muted"
                }`}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        {step === "intro" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Set Up Two-Factor Authentication
              </DialogTitle>
              <DialogDescription>
                Add an extra layer of security to your account using an
                authenticator app.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/50 border">
                <Smartphone className="h-6 w-6 text-primary mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium">
                    You'll need an authenticator app
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Download Google Authenticator, Authy, or any TOTP-compatible
                    app on your phone.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/50 border">
                <QrCode className="h-6 w-6 text-primary mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium">Scan a QR code</p>
                  <p className="text-sm text-muted-foreground">
                    You'll scan a QR code with your authenticator app to link it
                    to your account.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30">
                <AlertCircle className="h-6 w-6 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium text-amber-900 dark:text-amber-200">
                    Save your backup codes
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    You'll receive backup codes in case you lose access to your
                    authenticator app.
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleStartSetup}
                disabled={setup2FAMutation.isPending}
              >
                {setup2FAMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  "Get Started"
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "qrcode" && (
          <>
            <DialogHeader>
              <DialogTitle>Scan QR Code</DialogTitle>
              <DialogDescription>
                Open your authenticator app and scan this QR code.
              </DialogDescription>
            </DialogHeader>

            {renderStepIndicator()}

            <div className="flex flex-col items-center gap-6 py-4">
              {qrCode && (
                <div className="p-4 bg-white rounded-xl border shadow-sm">
                  <img src={qrCode} alt="2FA QR Code" className="w-48 h-48" />
                </div>
              )}

              <div className="w-full space-y-2">
                <p className="text-sm text-center text-muted-foreground">
                  Can't scan? Enter this code manually:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-3 text-sm font-mono bg-muted rounded-lg text-center break-all">
                    {secret}
                  </code>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleCopySecret}
                    className="shrink-0"
                  >
                    {copiedSecret ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={() => setStep("verify")}>
                I've scanned the code
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "verify" && (
          <>
            <DialogHeader>
              <DialogTitle>Verify Setup</DialogTitle>
              <DialogDescription>
                Enter the 8-digit code from your authenticator app to verify the
                setup.
              </DialogDescription>
            </DialogHeader>

            {renderStepIndicator()}

            <form onSubmit={handleVerify} className="space-y-6 py-4">
              <div className="space-y-3">
                <Label htmlFor="verification-code">Verification Code</Label>
                <Input
                  id="verification-code"
                  type="text"
                  inputMode="numeric"
                  placeholder="00000000"
                  value={verificationCode}
                  onChange={(e) =>
                    setVerificationCode(
                      e.target.value.replace(/\D/g, "").slice(0, 8)
                    )
                  }
                  disabled={verifySetup2FAMutation.isPending}
                  maxLength={8}
                  required
                  autoFocus
                  className="h-14 text-center text-2xl font-mono tracking-[0.5em] placeholder:tracking-[0.5em]"
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep("qrcode")}
                  disabled={verifySetup2FAMutation.isPending}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={
                    verifySetup2FAMutation.isPending ||
                    verificationCode.length !== 8
                  }
                >
                  {verifySetup2FAMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}

        {step === "backup" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Save Your Backup Codes
              </DialogTitle>
              <DialogDescription>
                Store these codes in a safe place. Each code can only be used
                once.
              </DialogDescription>
            </DialogHeader>

            {renderStepIndicator()}

            <div className="space-y-4 py-4">
              <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    <strong>Important:</strong> These codes won't be shown
                    again. Save them now!
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 p-4 bg-muted/50 rounded-lg border">
                {backupCodes.map((code, index) => (
                  <code
                    key={index}
                    className="p-2 text-sm font-mono text-center bg-background rounded border"
                  >
                    {code}
                  </code>
                ))}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleCopyBackupCodes}
                  className="flex-1"
                >
                  {copiedCodes ? (
                    <Check className="mr-2 h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="mr-2 h-4 w-4" />
                  )}
                  Copy Codes
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDownloadBackupCodes}
                  className="flex-1"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={handleComplete} className="w-full">
                I've saved my backup codes
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "complete" && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-6">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Setup Complete!</h3>
            <p className="text-muted-foreground">
              Two-factor authentication is now enabled on your account.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
