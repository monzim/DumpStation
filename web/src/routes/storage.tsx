import { AppLayout } from "@/components/app-layout";
import { StorageList } from "@/components/storage-list";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/storage")({
  component: StoragePage,
  head: () => ({
    meta: [
      { title: "Storage - DumpStation" },
      {
        name: "description",
        content:
          "Manage storage configurations for your PostgreSQL database backups.",
      },
      {
        name: "robots",
        content: "noindex, nofollow",
      },
      {
        property: "og:title",
        content: "Storage - DumpStation",
      },
      {
        property: "og:description",
        content:
          "Manage storage configurations for your PostgreSQL database backups.",
      },
      {
        property: "og:url",
        content: "https://dumpstation.io/storage",
      },
      {
        name: "twitter:title",
        content: "Storage - DumpStation",
      },
      {
        name: "twitter:description",
        content:
          "Manage storage configurations for your PostgreSQL database backups.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://dumpstation.io/storage",
      },
    ],
  }),
});

function StoragePage() {
  return (
    <AppLayout>
      <div className="animate-in fade-in duration-300">
        <StorageList />
      </div>
    </AppLayout>
  );
}
