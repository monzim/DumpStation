import { AppLayout } from "@/components/app-layout";
import { BackupList } from "@/components/backup-list";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/backups")({
  component: BackupsPage,
  head: () => ({
    meta: [
      { title: "Backups - DumpStation" },
      {
        name: "description",
        content:
          "View and manage your PostgreSQL database backups. Track backup history and status.",
      },
      {
        name: "robots",
        content: "noindex, nofollow",
      },
      {
        property: "og:title",
        content: "Backups - DumpStation",
      },
      {
        property: "og:description",
        content:
          "View and manage your PostgreSQL database backups. Track backup history and status.",
      },
      {
        property: "og:url",
        content: "https://dumpstation.io/backups",
      },
      {
        name: "twitter:title",
        content: "Backups - DumpStation",
      },
      {
        name: "twitter:description",
        content:
          "View and manage your PostgreSQL database backups. Track backup history and status.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://dumpstation.io/backups",
      },
    ],
  }),
});

function BackupsPage() {
  return (
    <AppLayout>
      <div className="animate-in fade-in duration-300">
        <BackupList />
      </div>
    </AppLayout>
  );
}
