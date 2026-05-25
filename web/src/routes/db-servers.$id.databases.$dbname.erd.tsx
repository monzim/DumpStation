import { lazy, Suspense } from "react";
import { AppLayout } from "@/components/app-layout";
import {
  createFileRoute,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { useDbServer, useDbServerERD } from "@/lib/api/db-servers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";

// Lazy-loaded so mermaid (~1 MB raw) only ships when the ERD route is
// actually opened — keeps it out of the Cloudflare Worker server bundle.
const DbServerERD = lazy(() =>
  import("@/components/db-server-erd").then((m) => ({ default: m.DbServerERD }))
);

export const Route = createFileRoute(
  "/db-servers/$id/databases/$dbname/erd"
)({
  component: ErdPage,
});

function ErdPage() {
  const { id, dbname } = useParams({
    from: "/db-servers/$id/databases/$dbname/erd",
  });
  const navigate = useNavigate();
  const { data: server } = useDbServer(id);
  const { data, isLoading, isError, error } = useDbServerERD(id, dbname);

  return (
    <AppLayout>
      <div className="space-y-8">
        <Button
          variant="ghost-dark"
          size="sm"
          className="-ml-2"
          onClick={() =>
            navigate({
              to: "/db-servers/$id/databases/$dbname",
              params: { id, dbname },
            })
          }
        >
          <ArrowLeft className="size-4" />
          Back to {dbname}
        </Button>

        <div className="space-y-3">
          <Eyebrow>Schema diagram</Eyebrow>
          <h1 className="text-display-sm text-on-primary">Entity relationships</h1>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Badge variant="mono">{dbname}</Badge>
            {server && <Badge variant="mono">on {server.name}</Badge>}
            {data && (
              <>
                <Badge variant="mono">
                  {data.tables.length} table
                  {data.tables.length === 1 ? "" : "s"}
                </Badge>
                <Badge variant="mono">
                  {data.relations.length} relation
                  {data.relations.length === 1 ? "" : "s"}
                </Badge>
              </>
            )}
          </div>
        </div>
      </div>

      {/* The diagram bleeds out of the AppLayout container's horizontal
          padding so it spans the entire working area edge-to-edge. The
          inner component owns the dark canvas and tall viewport height. */}
      <div className="-mx-6 lg:-mx-12 mt-8">
        {isLoading ? (
          <Skeleton className="h-[calc(100vh-220px)] min-h-[520px] w-full rounded-none" />
        ) : isError ? (
          <div className="px-6 lg:px-12">
            <Card variant="console">
              <CardContent>
                <p className="text-body-sm text-error">
                  Failed to build the ERD: {(error as Error)?.message}
                </p>
              </CardContent>
            </Card>
          </div>
        ) : data ? (
          <Suspense
            fallback={
              <Skeleton className="h-[calc(100vh-220px)] min-h-[520px] w-full rounded-none" />
            }
          >
            <DbServerERD schema={data} />
          </Suspense>
        ) : null}
      </div>
    </AppLayout>
  );
}
