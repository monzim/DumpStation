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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateServerDatabase,
  useDbServerUsers,
} from "@/lib/api/db-servers";
import { Loader2 } from "lucide-react";

const NO_OWNER = "__NONE__";

interface Props {
  serverId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ServerDatabaseCreateDialog({
  serverId,
  open,
  onOpenChange,
}: Props) {
  const { data: users } = useDbServerUsers(serverId);
  const createMutation = useCreateServerDatabase(serverId);
  const [name, setName] = useState("");
  const [owner, setOwner] = useState<string>(NO_OWNER);

  useEffect(() => {
    if (!open) {
      setName("");
      setOwner(NO_OWNER);
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) return;
    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        owner: owner === NO_OWNER ? undefined : owner,
      });
      onOpenChange(false);
    } catch {
      /* toast on error from mutation */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create database</DialogTitle>
          <DialogDescription>
            Creates a new database on the remote PostgreSQL server.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="db-name">Name</Label>
            <Input
              id="db-name"
              placeholder="app_prod"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Names are case-sensitive when quoted. Avoid spaces and special
              characters.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="db-owner">Owner (optional)</Label>
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger id="db-owner">
                <SelectValue placeholder="Connecting user" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_OWNER}>Connecting user (default)</SelectItem>
                {users?.map((u) => (
                  <SelectItem key={u.name} value={u.name}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
            disabled={!name.trim() || createMutation.isPending}
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
