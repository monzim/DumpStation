import { AppLayout } from "@/components/app-layout";
import { apiClient } from "@/lib/api/client";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard")({
  // beforeLoad runs before the route's component renders, so an
  // unauthenticated visitor never sees the dashboard shell or fires any of
  // its data-loading queries.
  beforeLoad: ({ location }) => {
    if (!apiClient.getToken()) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
        },
      });
    }
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
