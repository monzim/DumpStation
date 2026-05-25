import { AppLayout } from "@/components/app-layout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import {
  KpiTile,
  LiveDot,
  PageBriefing,
  SectionRule,
  useNow,
} from "@/components/ui/page-briefing";
import { Skeleton } from "@/components/ui/skeleton";
import { TwoFactorSettings } from "@/components/two-factor-settings";
import {
  useFailedBackupCount,
  usePurgeFailedBackups,
} from "@/lib/api/backups";
import {
  fileToBase64,
  getUserInitials,
  useDeleteAvatar,
  useUploadAvatar,
  useUserAvatar,
  useUserProfile,
} from "@/lib/api/user";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createFileRoute } from "@tanstack/react-router";
import {
  Calendar,
  Camera,
  Hash,
  Loader2,
  Mail,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  UserCircle,
  Wrench,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Settings - DumpStation" },
      {
        name: "description",
        content:
          "Manage your account settings, security preferences, and two-factor authentication.",
      },
      {
        name: "robots",
        content: "noindex, nofollow",
      },
      {
        property: "og:title",
        content: "Settings - DumpStation",
      },
      {
        property: "og:description",
        content: "Manage your account settings and security preferences.",
      },
      {
        property: "og:url",
        content: "https://dumpstation.monzim.com/settings",
      },
      {
        name: "twitter:title",
        content: "Settings - DumpStation",
      },
      {
        name: "twitter:description",
        content: "Manage your account settings and security preferences.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://dumpstation.monzim.com/settings",
      },
    ],
  }),
});

function daysSince(dateString?: string): number | null {
  if (!dateString) return null;
  const t = new Date(dateString).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function SettingsPage() {
  const { data: user, isLoading: isLoadingUser } = useUserProfile();
  const { data: avatarUrl } = useUserAvatar(user?.has_profile_picture);
  const uploadAvatarMutation = useUploadAvatar();
  const deleteAvatarMutation = useDeleteAvatar();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const now = useNow();

  const initials = getUserInitials(user?.discord_username, user?.email);
  const accountAgeDays = daysSince(user?.created_at);

  const handleAvatarClick = () => {
    if (!user?.is_demo) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast.error(
        "Invalid file type. Please upload a JPEG, PNG, GIF, or WebP image.",
      );
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 2MB.");
      return;
    }

    setIsUploading(true);
    try {
      const base64 = await fileToBase64(file);
      await uploadAvatarMutation.mutateAsync({ image: base64 });
      toast.success("Profile picture updated successfully!");
    } catch (error) {
      console.error("Failed to upload avatar:", error);
      toast.error("Failed to upload profile picture. Please try again.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDeleteAvatar = async () => {
    if (!user?.has_profile_picture) return;

    try {
      await deleteAvatarMutation.mutateAsync();
      toast.success("Profile picture removed successfully!");
    } catch (error) {
      console.error("Failed to delete avatar:", error);
      toast.error("Failed to remove profile picture. Please try again.");
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <AppLayout>
      <div className="space-y-12 animate-in fade-in duration-500">
        <PageBriefing
          eyebrow={`Account · Control panel · ${now.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}`}
          title="Account"
          echo="control."
          subtitle="Identity, two-factor, profile, and the destructive maintenance levers — in one place."
          ledger={[
            {
              label: "Live",
              value: (
                <span className="inline-flex items-center gap-2">
                  <LiveDot
                    tone={user?.two_factor_enabled ? "success" : "warning"}
                  />
                  {now.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                  })}
                </span>
              ),
            },
            {
              label: "2FA",
              value: user?.two_factor_enabled ? "Enabled" : "Off",
            },
            {
              label: "Mode",
              value: user?.is_demo ? "Demo" : user?.is_admin ? "Admin" : "User",
            },
          ]}
        />

        {/* ─────────  IDENTITY CARD + KPI MIX  ───────── */}
        <section className="space-y-4">
          <SectionRule label="01 · Identity" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Identity card (wider) */}
            <Card className="lg:col-span-7 p-0 overflow-hidden">
              <div className="border-b border-hairline-soft p-6 lg:p-8">
                <Eyebrow>Profile picture</Eyebrow>
                <p className="text-heading-sm text-on-primary mt-1">Identity</p>
              </div>
              <div className="p-6 lg:p-8">
                {isLoadingUser ? (
                  <div className="flex items-center gap-6">
                    <Skeleton className="h-24 w-24 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-9 w-36 mt-2" />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                    <div className="relative group shrink-0">
                      <Avatar className="size-24 ring-1 ring-hairline-soft ring-offset-4 ring-offset-canvas-soft">
                        <AvatarImage
                          src={avatarUrl || undefined}
                          alt={user?.discord_username || "Profile"}
                        />
                        <AvatarFallback className="text-2xl font-semibold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      {!user?.is_demo && (
                        <button
                          onClick={handleAvatarClick}
                          disabled={isUploading}
                          aria-label="Change profile picture"
                          className="absolute inset-0 flex items-center justify-center bg-black/55 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:cursor-not-allowed"
                        >
                          {isUploading ? (
                            <Loader2 className="size-6 text-on-primary animate-spin" />
                          ) : (
                            <Camera className="size-6 text-on-primary" />
                          )}
                        </button>
                      )}
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      onChange={handleFileChange}
                      className="hidden"
                    />

                    <div className="flex-1 min-w-0 space-y-3 w-full">
                      <div className="space-y-1">
                        <p className="text-heading-sm text-on-primary truncate">
                          {user?.discord_username || "Unnamed user"}
                        </p>
                        <p className="text-caption text-ash truncate">
                          {user?.email || "No email on file"}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {user?.is_demo && (
                          <Badge variant="warning">
                            <Shield className="size-2.5" /> Demo
                          </Badge>
                        )}
                        {user?.is_admin && (
                          <Badge variant="info">
                            <Sparkles className="size-2.5" /> Admin
                          </Badge>
                        )}
                        {user?.two_factor_enabled ? (
                          <Badge variant="success">
                            <ShieldCheck className="size-2.5" /> 2FA on
                          </Badge>
                        ) : (
                          <Badge variant="warning">
                            <ShieldAlert className="size-2.5" /> 2FA off
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          variant="secondary-dark"
                          onClick={handleAvatarClick}
                          disabled={isUploading || user?.is_demo}
                        >
                          {isUploading ? (
                            <>
                              <Loader2 className="size-4 animate-spin" />
                              Uploading
                            </>
                          ) : (
                            <>
                              <Camera className="size-4" />
                              {user?.has_profile_picture
                                ? "Change photo"
                                : "Upload photo"}
                            </>
                          )}
                        </Button>
                        {user?.has_profile_picture && (
                          <Button
                            variant="ghost-dark"
                            onClick={handleDeleteAvatar}
                            disabled={
                              deleteAvatarMutation.isPending || user?.is_demo
                            }
                            className="text-error hover:text-error"
                          >
                            {deleteAvatarMutation.isPending ? (
                              <>
                                <Loader2 className="size-4 animate-spin" />
                                Removing
                              </>
                            ) : (
                              <>
                                <Trash2 className="size-4" />
                                Remove
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                      {!user?.is_demo && (
                        <p className="text-mono-micro uppercase text-mute">
                          JPEG · PNG · GIF · WebP · 2 MB max
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* KPI stack (narrower) */}
            <div className="lg:col-span-5 grid grid-cols-2 gap-4 content-start">
              <KpiTile
                label="2FA"
                icon={user?.two_factor_enabled ? ShieldCheck : ShieldAlert}
                tone={user?.two_factor_enabled ? "success" : "warning"}
                value={user?.two_factor_enabled ? "Enabled" : "Off"}
                hint={
                  user?.two_factor_enabled
                    ? "TOTP active"
                    : "Recommended"
                }
                isLoading={isLoadingUser}
              />
              <KpiTile
                label="Account age"
                icon={Calendar}
                value={
                  accountAgeDays === null
                    ? "—"
                    : `${accountAgeDays}d`
                }
                hint={user?.created_at ? formatDate(user.created_at) : "—"}
                isLoading={isLoadingUser}
              />
              <KpiTile
                label="Mode"
                icon={user?.is_admin ? Sparkles : UserCircle}
                tone={user?.is_demo ? "warning" : user?.is_admin ? "info" : "default"}
                value={user?.is_demo ? "Demo" : user?.is_admin ? "Admin" : "User"}
                hint={
                  user?.is_demo
                    ? "Read-only data"
                    : user?.is_admin
                      ? "Full privileges"
                      : "Standard"
                }
                isLoading={isLoadingUser}
              />
              <KpiTile
                label="User ID"
                icon={Hash}
                value={
                  user?.id ? `${user.id.slice(0, 8)}…` : "—"
                }
                hint={
                  user?.discord_user_id
                    ? `discord · ${user.discord_user_id.slice(0, 10)}`
                    : "—"
                }
                isLoading={isLoadingUser}
              />
            </div>
          </div>

          {/* Account information ledger */}
          <Card className="p-0 overflow-hidden">
            <div className="border-b border-hairline-soft p-6 lg:p-8">
              <Eyebrow>Account information</Eyebrow>
              <p className="text-heading-sm text-on-primary mt-1">
                Identity, managed through Discord authentication
              </p>
            </div>
            <div className="p-6 lg:p-8">
              {isLoadingUser ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <InfoRow
                    icon={User}
                    label="Username"
                    value={user?.discord_username || "Not set"}
                  />
                  <InfoRow
                    icon={Mail}
                    label="Email"
                    value={user?.email || "Not set"}
                  />
                  <InfoRow
                    icon={ShieldCheck}
                    label="Two-factor"
                    value={
                      user?.two_factor_enabled ? (
                        <span className="text-success">Enabled</span>
                      ) : (
                        <span className="text-mute">Not enabled</span>
                      )
                    }
                  />
                  <InfoRow
                    icon={Calendar}
                    label="Joined"
                    value={formatDate(user?.created_at)}
                  />
                </div>
              )}
            </div>
          </Card>
        </section>

        {/* ─────────  SECURITY (2FA settings)  ───────── */}
        <section className="space-y-4">
          <SectionRule label="02 · Security" />
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-app-sm bg-canvas-soft border border-hairline-soft flex items-center justify-center">
              <Shield className="size-4 text-ash" />
            </div>
            <div>
              <Eyebrow>Sign-in & two-factor</Eyebrow>
              <p className="text-heading-sm text-on-primary mt-0.5">
                Authentication hardening
              </p>
            </div>
          </div>
          <TwoFactorSettings />
        </section>

        {/* ─────────  MAINTENANCE  ───────── */}
        <section className="space-y-4">
          <SectionRule label="03 · Maintenance" />
          <MaintenanceSection />
        </section>
      </div>
    </AppLayout>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-app-md bg-canvas-soft border border-hairline-soft p-3 transition-colors hover:border-graphite/80">
      <div className="size-9 rounded-app-sm bg-canvas-soft border border-hairline-soft flex items-center justify-center shrink-0">
        <Icon className="size-4 text-ash" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-mono-caps uppercase text-mute">{label}</p>
        <p className="text-body-sm text-on-primary truncate font-medium">
          {value}
        </p>
      </div>
    </div>
  );
}

// MaintenanceSection surfaces destructive operational actions. Today the
// only one is "purge failed backups"; the section exists so we have a
// natural home for future maintenance widgets (orphan blob sweep, ERD
// cache reset, etc.) without crowding the Security section.
function MaintenanceSection() {
  const failedCount = useFailedBackupCount();
  const purge = usePurgeFailedBackups();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const count = failedCount.data?.count ?? 0;

  const handlePurge = async () => {
    try {
      const result = await purge.mutateAsync();
      toast.success(`Purged ${result.deleted} failed backup(s)`);
    } catch {
      toast.error("Failed to purge failed backups");
    } finally {
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="size-8 rounded-app-sm bg-canvas-soft border border-hairline-soft flex items-center justify-center">
          <Wrench className="size-4 text-ash" />
        </div>
        <div>
          <Eyebrow>Operational levers</Eyebrow>
          <p className="text-heading-sm text-on-primary mt-0.5">
            Destructive maintenance
          </p>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="border-b border-hairline-soft p-6 lg:p-8 flex items-start justify-between gap-4">
          <div>
            <Eyebrow>Purge failed backups</Eyebrow>
            <p className="text-body-sm text-ash mt-2 max-w-2xl">
              Failed backups accumulate over time. Purging removes the rows from
              the backup history and best-effort deletes any orphaned storage
              objects. Successful backups are unaffected.
            </p>
          </div>
          <Badge variant={count > 0 ? "error" : "mono"}>
            <Trash2 className="size-2.5" /> {count > 0 ? "Action needed" : "Clean"}
          </Badge>
        </div>
        <div className="p-6 lg:p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="size-12 rounded-app-md bg-canvas-soft border border-hairline-soft flex items-center justify-center">
                <Trash2
                  className={count > 0 ? "size-5 text-error" : "size-5 text-mute"}
                />
              </div>
              <div>
                <p className="text-mono-caps uppercase text-mute">
                  Currently failed
                </p>
                <p className="text-display-sm tabular-nums text-on-primary">
                  {failedCount.isLoading ? (
                    <Skeleton className="h-9 w-16" />
                  ) : (
                    count
                  )}
                </p>
              </div>
            </div>
            <Button
              variant="destructive"
              disabled={count === 0 || purge.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              {purge.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Purging
                </>
              ) : (
                <>
                  <Trash2 className="size-4" />
                  Purge {count > 0 ? count : ""} failed backup
                  {count === 1 ? "" : "s"}
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Purge failed backups?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes <span className="font-semibold">{count}</span> failed
              backup row{count === 1 ? "" : "s"} and best-effort removes any
              orphan storage objects. Successful backups stay untouched. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePurge}
              className="bg-brand-deep text-on-primary hover:bg-brand-deep/90"
            >
              Purge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
