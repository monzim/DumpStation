import { AppLayout } from "@/components/app-layout";
import { DbServerList } from "@/components/db-server-list";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/db-servers/")({
  component: DbServersIndexPage,
  head: () => ({
    meta: [
      { title: "DB Servers - DumpStation" },
      {
        name: "description",
        content:
          "Administer PostgreSQL servers — create databases, manage users, and grant access without leaving DumpStation.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function DbServersIndexPage() {
  return (
    <AppLayout>
      <div className="animate-in fade-in duration-300">
        <DbServerList />
      </div>
    </AppLayout>
  );
}
