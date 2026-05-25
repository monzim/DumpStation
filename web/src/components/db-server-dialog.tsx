import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
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
  useCreateDbServer,
  useUpdateDbServer,
  useTestDbServerAdHoc,
} from "@/lib/api/db-servers";
import type {
  ServerConnection,
  ServerConnectionInput,
  ServerSSLMode,
} from "@/lib/types/api";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

interface DbServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server?: ServerConnection | null;
}

type TestState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; sslMode?: string; latency?: string }
  | { kind: "error"; message: string };

const DEFAULTS: ServerConnectionInput = {
  name: "",
  host: "",
  port: 5432,
  user: "postgres",
  password: "",
  ssl_mode: "prefer",
};

export function DbServerDialog({
  open,
  onOpenChange,
  server,
}: DbServerDialogProps) {
  const isEditing = !!server;
  const createMutation = useCreateDbServer();
  const updateMutation = useUpdateDbServer();
  const testMutation = useTestDbServerAdHoc();
  const [testState, setTestState] = useState<TestState>({ kind: "idle" });

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
    getValues,
  } = useForm<ServerConnectionInput>({ defaultValues: DEFAULTS });

  const sslMode = watch("ssl_mode");

  useEffect(() => {
    if (!open) return;
    setTestState({ kind: "idle" });
    if (server) {
      reset({
        name: server.name,
        host: server.host,
        port: server.port,
        user: server.user,
        password: "", // never prefill — UPDATE leaves empty = keep existing
        ssl_mode: server.ssl_mode,
      });
    } else {
      reset(DEFAULTS);
    }
  }, [open, server, reset]);

  const onTest = async () => {
    const data = getValues();
    if (!data.host || !data.user || !data.password || !data.port) {
      toast.error("Fill host, port, user, and password before testing");
      return;
    }
    setTestState({ kind: "running" });
    try {
      const result = await testMutation.mutateAsync(data);
      if (result.ok) {
        setTestState({
          kind: "ok",
          sslMode: result.ssl_mode,
          latency: result.latency,
        });
        if (result.ssl_mode && result.ssl_mode !== data.ssl_mode) {
          setValue("ssl_mode", result.ssl_mode as ServerSSLMode);
        }
      } else {
        setTestState({ kind: "error", message: result.message ?? "Unknown error" });
      }
    } catch (e: any) {
      setTestState({ kind: "error", message: e?.message ?? "Test failed" });
    }
  };

  const onSubmit = async (data: ServerConnectionInput) => {
    try {
      if (isEditing && server) {
        await updateMutation.mutateAsync({ id: server.id, input: data });
      } else {
        await createMutation.mutateAsync(data);
      }
      onOpenChange(false);
    } catch {
      // mutation onError surfaces the toast already
    }
  };

  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    testMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Server Connection" : "Add Server Connection"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update credentials for a PostgreSQL server you administer. Leave password blank to keep the existing value."
              : "Register a PostgreSQL server using superuser/admin credentials. Credentials are encrypted at rest."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Friendly name</Label>
            <Input
              id="name"
              placeholder="Primary PG"
              {...register("name", { required: "Name is required" })}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-[1fr_120px] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="host">Host</Label>
              <Input
                id="host"
                placeholder="db.example.com"
                {...register("host", { required: "Host is required" })}
              />
              {errors.host && (
                <p className="text-xs text-destructive">{errors.host.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                type="number"
                {...register("port", {
                  required: true,
                  valueAsNumber: true,
                  min: 1,
                  max: 65535,
                })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="user">Admin user</Label>
            <Input
              id="user"
              placeholder="postgres"
              autoComplete="off"
              {...register("user", { required: "User is required" })}
            />
            {errors.user && (
              <p className="text-xs text-destructive">{errors.user.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">
              Password{" "}
              {isEditing && (
                <span className="text-muted-foreground font-normal">
                  (leave blank to keep)
                </span>
              )}
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              {...register("password", {
                required: isEditing ? false : "Password is required",
              })}
            />
            {errors.password && (
              <p className="text-xs text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ssl_mode">SSL mode</Label>
            <Select
              value={sslMode}
              onValueChange={(v) => setValue("ssl_mode", v as ServerSSLMode)}
            >
              <SelectTrigger id="ssl_mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="require">require</SelectItem>
                <SelectItem value="prefer">prefer (recommended)</SelectItem>
                <SelectItem value="disable">disable</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t">
            <div className="flex items-center gap-2 text-sm min-h-9">
              {testState.kind === "running" && (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">Testing…</span>
                </>
              )}
              {testState.kind === "ok" && (
                <>
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span className="text-success">
                    Connected via {testState.sslMode}
                    {testState.latency ? ` in ${testState.latency}` : ""}
                  </span>
                </>
              )}
              {testState.kind === "error" && (
                <>
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span className="text-destructive truncate max-w-[300px]">
                    {testState.message}
                  </span>
                </>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={onTest}
              disabled={busy}
            >
              Test Connection
            </Button>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing ? "Save changes" : "Add server"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
