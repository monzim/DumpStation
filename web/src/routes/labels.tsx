import { AppLayout } from "@/components/app-layout";
import { LabelManager } from "@/components/label-manager";
import { Eyebrow } from "@/components/ui/eyebrow";
import { createFileRoute } from "@tanstack/react-router";

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
      <div className="space-y-8">
        <div className="space-y-3">
          <Eyebrow>Labels</Eyebrow>
          <h1 className="text-display-sm text-on-primary">Tags</h1>
          <p className="text-body text-ash max-w-2xl">
            Create and manage labels to organize your databases, storage, and
            notifications. Label colors are user-set and preserved as-is.
          </p>
        </div>
        <LabelManager />
      </div>
    </AppLayout>
  );
}
