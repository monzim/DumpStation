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
import { requestDownloadOTP, verifyDownloadOTP } from "@/lib/api/backups";
import type { Backup } from "@/lib/types/api";
import { Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface DownloadBackupDialogProps {
  backup: Backup | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Two-step download flow:
//   1. Click "Send code" → backend mints an OTP and ships it via every
//      configured notification channel (Discord and/or Telegram). The HTTP
//      response only carries the OTP id and the channel list — never the
//      code itself.
//   2. User types the 6-digit code → backend verifies + returns a 5-minute
//      presigned URL. We assign window.location to it; the browser handles
//      the actual file download via the Content-Disposition header.
export function DownloadBackupDialog({
  backup,
  open,
  onOpenChange,
}: DownloadBackupDialogProps) {
  const [step, setStep] = useState<"request" | "verify">("request");
  const [otpId, setOtpId] = useState<string | null>(null);
  const [channels, setChannels] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [remainingSec, setRemainingSec] = useState<number>(0);

  useEffect(() => {
    if (!open) {
      // Reset everything when the dialog closes so the next open is fresh.
      setStep("request");
      setOtpId(null);
      setChannels([]);
      setCode("");
      setExpiresAt(null);
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const ms = expiresAt.getTime() - Date.now();
      setRemainingSec(Math.max(0, Math.round(ms / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  const handleRequest = async () => {
    if (!backup) return;
    setBusy(true);
    try {
      const res = await requestDownloadOTP(backup.id);
      setOtpId(res.otp_id);
      setChannels(res.channels);
      setExpiresAt(new Date(res.expires_at));
      setStep("verify");
      toast.success(
        `Code sent via ${res.channels.join(", ")}`,
        { description: "Check your messages." }
      );
    } catch (err) {
      const msg =
        (err as { message?: string })?.message ??
        "Failed to send download code";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backup || !otpId) return;
    setBusy(true);
    try {
      const res = await verifyDownloadOTP(backup.id, otpId, code.trim());
      // window.location.assign triggers a normal navigation. The presigned
      // URL has a Content-Disposition: attachment header, so the browser
      // saves the file rather than rendering it.
      window.location.assign(res.download_url);
      toast.success("Download started");
      onOpenChange(false);
    } catch (err) {
      const msg =
        (err as { message?: string })?.message ?? "Invalid or expired code";
      toast.error(msg);
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Download backup
          </DialogTitle>
          <DialogDescription>
            {backup ? <>Backup: <span className="font-mono">{backup.name}</span></> : null}
          </DialogDescription>
        </DialogHeader>

        {step === "request" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              For security, downloads require a one-time code. Click below
              to send the code to your configured notification channels.
              You'll need at least one channel (Discord or Telegram) set up
              under Notifications.
            </p>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button onClick={handleRequest} disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  "Send code"
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Code sent via <span className="font-medium">{channels.join(", ")}</span>.
              {remainingSec > 0 ? (
                <> Expires in <span className="font-mono">{formatMmSs(remainingSec)}</span>.</>
              ) : (
                <> <span className="text-destructive">Expired — request a new code.</span></>
              )}
            </p>
            <div className="space-y-2">
              <Label htmlFor="otp-code">Enter 6-digit code</Label>
              <Input
                id="otp-code"
                inputMode="numeric"
                autoFocus
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="h-12 text-center text-2xl font-mono tracking-[0.5em]"
                placeholder="000000"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("request")}
                disabled={busy}
              >
                Resend code
              </Button>
              <Button type="submit" disabled={busy || code.length !== 6 || remainingSec <= 0}>
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying…
                  </>
                ) : (
                  "Download"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatMmSs(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
