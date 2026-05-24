import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDbServerUsers, useGrantPresetRole } from "@/lib/api/db-servers";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type { ServerGrantPreset } from "@/lib/types/api";

const PRESETS: Array<{
  value: ServerGrantPreset;
  title: string;
  body: string;
}> = [
  {
    value: "readonly",
    title: "Read-only",
    body: "SELECT on all current and future tables in the public schema.",
  },
  {
    value: "readwrite",
    title: "Read / write",
    body:
      "SELECT, INSERT, UPDATE, DELETE on current and future tables and sequences in public.",
  },
  {
    value: "owner",
    title: "Owner",
    body:
      "ALTER DATABASE … OWNER TO role. Full control of the database — use with care.",
  },
];

interface Props {
  serverId: string;
  dbname: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ServerGrantDialog({
  serverId,
  dbname,
  open,
  onOpenChange,
}: Props) {
  const { data: users } = useDbServerUsers(serverId);
  const grantMutation = useGrantPresetRole(serverId);
  const [username, setUsername] = useState<string>("");
  const [preset, setPreset] = useState<ServerGrantPreset>("readonly");

  useEffect(() => {
    if (!open) {
      setUsername("");
      setPreset("readonly");
    }
  }, [open]);

  const submit = async () => {
    if (!username) return;
    try {
      await grantMutation.mutateAsync({
        dbname,
        input: { username, preset },
      });
      onOpenChange(false);
    } catch {
      /* toast on error */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Grant access</DialogTitle>
          <DialogDescription>
            Grant a preset role on database <strong>{dbname}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="grant-user">User</Label>
            <Select value={username} onValueChange={setUsername}>
              <SelectTrigger id="grant-user">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {users
                  ?.filter((u) => u.can_login)
                  .map((u) => (
                    <SelectItem key={u.name} value={u.name}>
                      {u.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Preset</Label>
            {PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPreset(p.value)}
                className={cn(
                  "w-full text-left rounded-lg border p-3 transition-colors",
                  preset === p.value
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted"
                )}
              >
                <div className="font-medium text-sm">{p.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {p.body}
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={grantMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!username || grantMutation.isPending}
          >
            {grantMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Grant
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
