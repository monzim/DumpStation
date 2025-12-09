import { AppLayout } from "@/components/app-layout";
import { LabelManager } from "@/components/label-manager";
import { createFileRoute } from "@tanstack/react-router";
import { Tags } from "lucide-react";

export const Route = createFileRoute("/labels")({
  component: LabelsPage,
  head: () => ({
    meta: [
      { title: "Labels - DumpStation" },
      {
        name: "description",
        content:
          "Manage labels for organizing your databases, storage, and notifications.",
      },
      {
        name: "robots",
        content: "noindex, nofollow",
      },
      {
        property: "og:title",
        content: "Labels - DumpStation",
      },
      {
        property: "og:description",
        content: "Manage labels for organizing your resources.",
      },
      {
        property: "og:url",
        content: "https://dumpstation.monzim.com/labels",
      },
      {
        name: "twitter:title",
        content: "Labels - DumpStation",
      },
      {
        name: "twitter:description",
        content: "Manage labels for organizing your resources.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://dumpstation.monzim.com/labels",
      },
    ],
  }),
});

function LabelsPage() {
  return (
    <AppLayout>
      <div className="animate-in fade-in duration-300 space-y-8">
        {/* Page Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Tags className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Labels
              </h1>
              <p className="text-muted-foreground">
                Create and manage labels to organize your databases, storage,
                and notifications
              </p>
            </div>
          </div>
        </div>

        {/* Label Manager Component */}
        <LabelManager />
      </div>
    </AppLayout>
  );
}
