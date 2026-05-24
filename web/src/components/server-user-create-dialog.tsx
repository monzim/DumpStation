import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateServerUser } from "@/lib/api/db-servers";
import { Loader2 } from "lucide-react";

interface Props {
  serverId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ServerUserCreateDialog({ serverId, open, onOpenChange }: Props) {
  const createMutation = useCreateServerUser(serverId);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [canLogin, setCanLogin] = useState(true);

  useEffect(() => {
    if (!open) {
      setUsername("");
      setPassword("");
      setCanLogin(true);
    }
  }, [open]);

  const submit = async () => {
    if (!username.trim() || !password) return;
    try {
      await createMutation.mutateAsync({
        username: username.trim(),
        password,
        can_login: canLogin,
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
          <DialogTitle>Create role</DialogTitle>
          <DialogDescription>
            Adds a new PostgreSQL role on the remote server.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="user-name">Username</Label>
            <Input
              id="user-name"
              placeholder="app_user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-pw">Password</Label>
            <Input
              id="user-pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={canLogin}
              onChange={(e) => setCanLogin(e.target.checked)}
              className="rounded border-input"
            />
            Can log in (LOGIN attribute)
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={
              !username.trim() || !password || createMutation.isPending
            }
          >
            {createMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
