import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDisable2FA,
  useGet2FAStatus,
  useRegenerateBackupCodes,
} from "@/lib/api/auth";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Key,
  Loader2,
  RefreshCw,
  Shield,
  ShieldCheck,
  ShieldOff,
  Smartphone,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { TwoFactorSetupDialog } from "./two-factor-setup-dialog";

interface DisableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDisabled?: () => void;
}

function DisableTwoFactorDialog({
  open,
  onOpenChange,
  onDisabled,
}: DisableDialogProps) {
  const [code, setCode] = useState("");
  const disableMutation = useDisable2FA();

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await disableMutation.mutateAsync({ code });
      toast.success("Two-factor authentication disabled");
      onDisabled?.();
      handleClose();
    } catch (error: unknown) {
      const apiError = error as { message?: string };
      toast.error("Failed to disable 2FA", {
        description: apiError.message || "Invalid code. Please try again.",
      });
      setCode("");
    }
  };

  const handleClose = () => {
    setCode("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <ShieldOff className="h-5 w-5" />
            Disable Two-Factor Authentication
          </DialogTitle>
          <DialogDescription>
            This will make your account less secure. You'll need to enter a code
            from your authenticator app to confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-destructive">Warning</p>
              <p className="text-sm text-muted-foreground">
                After disabling 2FA, anyone with your password will be able to
                access your account.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleDisable} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="disable-code">Authenticator Code</Label>
            <Input
              id="disable-code"
              type="text"
              inputMode="numeric"
              placeholder="00000000"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 8))
              }
              disabled={disableMutation.isPending}
              maxLength={8}
              required
              autoFocus
              className="h-12 text-center text-xl font-mono tracking-[0.3em] placeholder:tracking-[0.3em]"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={disableMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={disableMutation.isPending || code.length !== 8}
            >
              {disableMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Disabling...
                </>
              ) : (
                "Disable 2FA"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface RegenerateBackupCodesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function RegenerateBackupCodesDialog({
  open,
  onOpenChange,
}: RegenerateBackupCodesDialogProps) {
  const [step, setStep] = useState<"verify" | "codes">("verify");
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const regenerateMutation = useRegenerateBackupCodes();

  const handleRegenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await regenerateMutation.mutateAsync({ code });
      setBackupCodes(response.codes);
      setStep("codes");
      toast.success("Backup codes regenerated");
    } catch (error: unknown) {
      const apiError = error as { message?: string };
      toast.error("Failed to regenerate backup codes", {
        description: apiError.message || "Invalid code. Please try again.",
      });
      setCode("");
    }
  };

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

These are your NEW backup codes. Old codes are no longer valid.
Each code can only be used once.
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

  const handleClose = () => {
    setStep("verify");
    setCode("");
    setBackupCodes([]);
    setCopiedCodes(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {step === "verify" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Key className="h-5 w-5 text-primary" />
                Regenerate Backup Codes
              </DialogTitle>
              <DialogDescription>
                This will invalidate your existing backup codes and generate new
                ones.
              </DialogDescription>
            </DialogHeader>

            <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Your old backup codes will no longer work after regenerating.
                </p>
              </div>
            </div>

            <form onSubmit={handleRegenerate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="regen-code">Authenticator Code</Label>
                <Input
                  id="regen-code"
                  type="text"
                  inputMode="numeric"
                  placeholder="00000000"
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 8))
                  }
                  disabled={regenerateMutation.isPending}
                  maxLength={8}
                  required
                  autoFocus
                  className="h-12 text-center text-xl font-mono tracking-[0.3em] placeholder:tracking-[0.3em]"
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={regenerateMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={regenerateMutation.isPending || code.length !== 8}
                >
                  {regenerateMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Regenerating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Regenerate
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-600" />
                New Backup Codes
              </DialogTitle>
              <DialogDescription>
                Save these new codes in a safe place. Your old codes are no
                longer valid.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    <strong>Important:</strong> These codes won't be shown
                    again!
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 p-4 bg-muted/50 rounded-lg border">
                {backupCodes.map((backupCode, index) => (
                  <code
                    key={index}
                    className="p-2 text-sm font-mono text-center bg-background rounded border"
                  >
                    {backupCode}
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
                  Copy
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
              <Button onClick={handleClose} className="w-full">
                I've saved my codes
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function TwoFactorSettings() {
  const { data: status, isLoading, refetch } = useGet2FAStatus();
  const [setupDialogOpen, setSetupDialogOpen] = useState(false);
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);

  const handleSetupComplete = () => {
    refetch();
  };

  const handleDisabled = () => {
    refetch();
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5" />
            <Skeleton className="h-6 w-48" />
          </div>
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-32" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                  status?.enabled
                    ? "bg-green-100 dark:bg-green-900/30"
                    : "bg-muted"
                }`}
              >
                {status?.enabled ? (
                  <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
                ) : (
                  <Shield className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Two-Factor Authentication
                  <Badge
                    variant={status?.enabled ? "default" : "secondary"}
                    className={
                      status?.enabled
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100"
                        : ""
                    }
                  >
                    {status?.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {status?.enabled
                    ? "Your account is protected with two-factor authentication"
                    : "Add an extra layer of security to your account"}
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {status?.enabled ? (
            <>
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/30">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <div>
                    <p className="font-medium text-green-900 dark:text-green-200">
                      2FA is active
                    </p>
                    {status.verified_at && (
                      <p className="text-sm text-green-700 dark:text-green-400">
                        Enabled{" "}
                        {formatDistanceToNow(new Date(status.verified_at), {
                          addSuffix: true,
                        })}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  onClick={() => setRegenerateDialogOpen(true)}
                  className="flex-1"
                >
                  <Key className="mr-2 h-4 w-4" />
                  Regenerate Backup Codes
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setDisableDialogOpen(true)}
                  className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <ShieldOff className="mr-2 h-4 w-4" />
                  Disable 2FA
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/50 border">
                <Smartphone className="h-6 w-6 text-muted-foreground mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium">Protect your account</p>
                  <p className="text-sm text-muted-foreground">
                    Two-factor authentication adds an extra layer of security by
                    requiring a code from your authenticator app in addition to
                    your password.
                  </p>
                </div>
              </div>

              <Button onClick={() => setSetupDialogOpen(true)}>
                <Shield className="mr-2 h-4 w-4" />
                Set Up 2FA
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <TwoFactorSetupDialog
        open={setupDialogOpen}
        onOpenChange={setSetupDialogOpen}
        onSetupComplete={handleSetupComplete}
      />

      <DisableTwoFactorDialog
        open={disableDialogOpen}
        onOpenChange={setDisableDialogOpen}
        onDisabled={handleDisabled}
      />

      <RegenerateBackupCodesDialog
        open={regenerateDialogOpen}
        onOpenChange={setRegenerateDialogOpen}
      />
    </>
  );
}
