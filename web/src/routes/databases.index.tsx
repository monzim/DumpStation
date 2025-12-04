import { AppLayout } from "@/components/app-layout";
import { DatabaseList } from "@/components/database-list";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/databases/")({
  component: DatabasesPage,
  head: () => ({
    meta: [
      { title: "Databases - DumpStation" },
      {
        name: "description",
        content:
          "Manage your PostgreSQL database configurations for automated backups.",
      },
      {
        name: "robots",
        content: "noindex, nofollow",
      },
      {
        property: "og:title",
        content: "Databases - DumpStation",
      },
      {
        property: "og:description",
        content:
          "Manage your PostgreSQL database configurations for automated backups.",
      },
      {
        property: "og:url",
        content: "https://dumpstation.monzim.com/databases",
      },
      {
        name: "twitter:title",
        content: "Databases - DumpStation",
      },
      {
        name: "twitter:description",
        content:
          "Manage your PostgreSQL database configurations for automated backups.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://dumpstation.monzim.com/databases",
      },
    ],
  }),
});

function DatabasesPage() {
  return (
    <AppLayout>
      <div className="animate-in fade-in duration-300">
        <DatabaseList />
      </div>
    </AppLayout>
  );
}
