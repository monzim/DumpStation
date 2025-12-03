import { ActivityLogList } from "@/components/activity-log-list";
import { AppLayout } from "@/components/app-layout";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/activity")({
  component: ActivityPage,
  head: () => ({
    meta: [
      { title: "Activity Logs - DumpStation" },
      {
        name: "description",
        content:
          "View activity logs and audit trail for your PostgreSQL backup operations.",
      },
      {
        name: "robots",
        content: "noindex, nofollow",
      },
      {
        property: "og:title",
        content: "Activity Logs - DumpStation",
      },
      {
        property: "og:description",
        content:
          "View activity logs and audit trail for your PostgreSQL backup operations.",
      },
      {
        property: "og:url",
        content: "https://dumpstation.io/activity",
      },
      {
        name: "twitter:title",
        content: "Activity Logs - DumpStation",
      },
      {
        name: "twitter:description",
        content:
          "View activity logs and audit trail for your PostgreSQL backup operations.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://dumpstation.io/activity",
      },
    ],
  }),
});

function ActivityPage() {
  return (
    <AppLayout>
      <div className="animate-in fade-in duration-300">
        <ActivityLogList />
      </div>
    </AppLayout>
  );
}
