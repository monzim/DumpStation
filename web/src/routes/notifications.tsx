import { AppLayout } from "@/components/app-layout";
import { NotificationList } from "@/components/notification-list";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/notifications")({
  component: NotificationsPage,
  head: () => ({
    meta: [
      { title: "Notifications - DumpStation" },
      {
        name: "description",
        content:
          "Configure notification settings for your PostgreSQL backup alerts.",
      },
      {
        name: "robots",
        content: "noindex, nofollow",
      },
      {
        property: "og:title",
        content: "Notifications - DumpStation",
      },
      {
        property: "og:description",
        content:
          "Configure notification settings for your PostgreSQL backup alerts.",
      },
      {
        property: "og:url",
        content: "https://dumpstation.io/notifications",
      },
      {
        name: "twitter:title",
        content: "Notifications - DumpStation",
      },
      {
        name: "twitter:description",
        content:
          "Configure notification settings for your PostgreSQL backup alerts.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://dumpstation.io/notifications",
      },
    ],
  }),
});

function NotificationsPage() {
  return (
    <AppLayout>
      <div className="animate-in fade-in duration-300">
        <NotificationList />
      </div>
    </AppLayout>
  );
}
