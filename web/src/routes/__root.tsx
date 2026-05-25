import { AuthProvider } from "@/components/auth-provider";
import { SessionGuard } from "@/components/session-guard";
import { Toaster } from "@/components/ui/sonner";
import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import appCss from "../styles.css?url";

const SITE_URL = "https://dumpstation.monzim.com";
const SITE_NAME = "DumpStation";
const DEFAULT_OG_IMAGE = `${SITE_URL}/images/og.webp`;

const CF_BEACON_TOKEN = "e832e1329bb742ae9c1d0c07a7612b66";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  notFoundComponent: () => <NotFound />,
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        name: "theme-color",
        content: "#0b0b0b",
      },
      {
        name: "robots",
        content: "index, follow",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:site_name",
        content: SITE_NAME,
      },
      {
        property: "og:image",
        content: DEFAULT_OG_IMAGE,
      },
      {
        property: "og:image:width",
        content: "1200",
      },
      {
        property: "og:image:height",
        content: "630",
      },
      {
        property: "og:image:type",
        content: "image/webp",
      },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
      {
        name: "twitter:image",
        content: DEFAULT_OG_IMAGE,
      },
    ],
    links: [
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32x32.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: "/favicon-16x16.png",
      },
      { rel: "manifest", href: "/site.webmanifest", color: "#fffff" },
      { rel: "icon", href: "/favicon.ico" },
    ],
  }),

  component: RootComponent,
});

function NotFound() {
  return <>Page not found</>;
}
function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script src="/config.js" />
        <HeadContent />
        {!import.meta.env.DEV && CF_BEACON_TOKEN && (
          <script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={`{"token": "${CF_BEACON_TOKEN}"}`}
          />
        )}
      </head>
      <body>
        <AuthProvider>
          {children}
          <SessionGuard />
        </AuthProvider>
        <Toaster />
        {import.meta.env.DEV && (
          <TanStackDevtools
            config={{
              position: "bottom-right",
            }}
            plugins={[
              {
                name: "Tanstack Router",
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        )}
        <Scripts />
        {import.meta.env.DEV && (
          <ReactQueryDevtools buttonPosition="bottom-right" />
        )}
      </body>
    </html>
  );
}
