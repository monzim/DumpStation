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
import { Skeleton } from "@/components/ui/skeleton";
import { DbServerERD } from "@/components/db-server-erd";
import { ArrowLeft, Network } from "lucide-react";

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
      <div className="space-y-6 animate-in fade-in duration-300 max-w-6xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground"
          onClick={() =>
            navigate({
              to: "/db-servers/$id/databases/$dbname",
              params: { id, dbname },
            })
          }
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to {dbname}
        </Button>

        <Card className="border-0 shadow-sm bg-linear-to-br from-primary/5 via-background to-background">
          <CardContent className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="bg-primary text-primary-foreground p-3 rounded-2xl shadow-md shrink-0">
                  <Network className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold tracking-tight truncate">
                    Schema diagram
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <Badge variant="secondary" className="font-mono">
                      {dbname}
                    </Badge>
                    {server && (
                      <Badge variant="outline" className="font-normal">
                        on {server.name}
                      </Badge>
                    )}
                    {data && (
                      <>
                        <Badge variant="secondary" className="font-normal">
                          {data.tables.length} table
                          {data.tables.length === 1 ? "" : "s"}
                        </Badge>
                        <Badge variant="secondary" className="font-normal">
                          {data.relations.length} relation
                          {data.relations.length === 1 ? "" : "s"}
                        </Badge>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <Skeleton className="h-96 w-full" />
        ) : isError ? (
          <Card className="border-destructive/40">
            <CardContent className="pt-6 text-sm text-destructive">
              Failed to build the ERD: {(error as Error)?.message}
            </CardContent>
          </Card>
        ) : data ? (
          <DbServerERD schema={data} />
        ) : null}
      </div>
    </AppLayout>
  );
}
