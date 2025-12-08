# DumpStation Web Interface

Modern, responsive React web application for managing PostgreSQL backups. Built with TanStack Router, React Query, and shadcn/ui components.

🔗 **[Main Project Documentation](../README.md)** | 🚀 **[Backend API](../server/README.md)** | 📖 **[Deployment Guide](../docs/DEPLOYMENT.md)**

---

## 📋 Overview

The DumpStation web interface provides an intuitive dashboard for managing database backups, storage configurations, and monitoring backup operations in real-time.

### Technology Stack

- **Framework**: React 19.2.0
- **Build Tool**: Vite 7.1.7
- **Router**: TanStack Router v1.132.0
- **State Management**: TanStack Query (React Query) v5.90.2
- **UI Components**: Radix UI primitives
- **Component Library**: shadcn/ui
- **Styling**: Tailwind CSS 4.0.6
- **Form Handling**: React Hook Form v7.66.1
- **Theming**: next-themes (dark/light mode)
- **Icons**: Lucide React
- **Deployment**: Cloudflare Workers (wrangler 4.49.0)

---

## ✨ Features

### 🎨 Modern User Interface

- **Responsive Design**: Works perfectly on desktop, tablet, and mobile
- **Dark/Light Mode**: Automatic theme switching with manual override
- **Real-time Updates**: Live dashboard updates via React Query
- **Interactive Components**: Built with Radix UI and shadcn/ui
- **Smooth Animations**: Framer Motion for delightful interactions

### 🗄️ Database Management

- View all configured databases
- Add new database configurations
- Edit database settings
- Delete databases
- Trigger manual backups
- Pause/resume scheduled backups
- View backup history per database

### ☁️ Storage Configuration

- Manage storage providers (S3, R2, MinIO)
- Add/edit/delete storage configs
- Reusable storage configurations
- Test storage connectivity

### 🔔 Notifications

- Configure Discord webhook notifications
- Manage notification channels
- Real-time backup status alerts

### 📊 Dashboard & Analytics

- System-wide statistics
- Backup success/failure rates
- Storage usage metrics
- Recent backup activity
- Activity log browser
- Searchable logs with filters

### 🔐 Authentication

- Discord OTP login
- JWT token management
- TOTP 2FA support
- Profile management
- Avatar upload

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20+ ([install](https://nodejs.org/))
- **pnpm** ([install](https://pnpm.io/installation))
- **Backend API** running (see [server/README.md](../server/README.md))

### Installation

```bash
# Navigate to web directory
cd web

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

The app will be available at `http://localhost:7511`

---

## 📦 Available Scripts

### Development

```bash
pnpm dev           # Start dev server with HMR
pnpm build         # Build for production
pnpm preview       # Preview production build locally
```

### Code Quality

```bash
pnpm lint          # Run ESLint
pnpm type-check    # Run TypeScript checks
pnpm format        # Format code with Prettier
```

### Deployment

```bash
pnpm deploy        # Deploy to Cloudflare Workers
pnpm pages:dev     # Test Cloudflare Pages locally
```

---

## 📁 Project Structure

```
web/
├── src/
│   ├── components/         # React components
│   │   ├── backup-list.tsx
│   │   ├── backup-details-dialog.tsx
│   │   ├── database-list.tsx
│   │   ├── database-dialog.tsx
│   │   ├── storage-list.tsx
│   │   ├── storage-dialog.tsx
│   │   ├── notification-list.tsx
│   │   ├── notification-dialog.tsx
│   │   ├── stats-card.tsx
│   │   ├── theme-provider.tsx
│   │   └── ui/            # shadcn/ui components (50+)
│   │       ├── button.tsx
│   │       ├── dialog.tsx
│   │       ├── card.tsx
│   │       ├── form.tsx
│   │       └── ...
│   │
│   ├── lib/               # Utilities and API
│   │   ├── api/           # API client functions
│   │   │   ├── auth.ts
│   │   │   ├── databases.ts
│   │   │   ├── backups.ts
│   │   │   ├── storage.ts
│   │   │   └── notifications.ts
│   │   ├── types/         # TypeScript interfaces
│   │   │   └── api.ts
│   │   └── utils/         # Helper functions
│   │       └── utils.ts
│   │
│   ├── routes/            # TanStack Router pages
│   │   ├── __root.tsx     # Root layout
│   │   ├── index.tsx      # Dashboard page
│   │   ├── login.tsx      # Login page
│   │   └── dashboard/     # Dashboard routes
│   │       └── databases.tsx
│   │
│   ├── providers/         # Context providers
│   │   ├── auth-provider.tsx    # Authentication state
│   │   └── query-provider.tsx   # React Query setup
│   │
│   ├── hooks/             # Custom React hooks
│   │   ├── use-mobile.ts
│   │   └── use-toast.ts
│   │
│   ├── router.tsx         # Router configuration
│   ├── routeTree.gen.ts   # Generated route tree
│   └── styles.css         # Global styles
│
├── public/                # Static assets
│   ├── images/           # Image files
│   │   └── og.webp       # Social media preview
│   ├── manifest.json     # PWA manifest
│   └── robots.txt        # SEO configuration
│
├── components.json       # shadcn/ui configuration
├── package.json          # Dependencies
├── vite.config.ts        # Vite configuration
├── tsconfig.json         # TypeScript configuration
├── tailwind.config.ts    # Tailwind CSS configuration
├── postcss.config.mjs    # PostCSS configuration
└── wrangler.jsonc        # Cloudflare Workers config
```

---

## 🛠️ Development

### Environment Variables

Create a `.env.local` file:

```env
VITE_API_BASE_URL=http://localhost:8080/api/v1
```

### API Integration

The app uses TanStack Query for data fetching:

```typescript
// Example: Fetch databases
import { useQuery } from '@tanstack/react-query';
import { fetchDatabases } from '@/lib/api/databases';

function DatabaseList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['databases'],
    queryFn: fetchDatabases,
  });

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorMessage error={error} />;

  return <DatabaseTable data={data} />;
}
```

### Adding New Components

#### Using shadcn/ui

```bash
# Add a new component
pnpm dlx shadcn@latest add button

# Add multiple components
pnpm dlx shadcn@latest add dialog card form
```

Components are added to `src/components/ui/`

#### Custom Components

Create components in `src/components/`:

```typescript
// src/components/my-component.tsx
import { Button } from '@/components/ui/button';

export function MyComponent() {
  return (
    <div>
      <Button>Click me</Button>
    </div>
  );
}
```

### Routing

This project uses file-based routing with TanStack Router.

#### Adding a New Route

1. Create a new file in `src/routes/`:

```typescript
// src/routes/settings.tsx
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  return <div>Settings</div>;
}
```

2. The route is automatically available at `/settings`

#### Navigating Between Routes

```typescript
import { Link } from '@tanstack/react-router';

function Navigation() {
  return (
    <nav>
      <Link to="/">Dashboard</Link>
      <Link to="/settings">Settings</Link>
    </nav>
  );
}
```

### State Management

Uses TanStack Query for server state and React Context for UI state:

```typescript
// Example: Authentication context
import { useAuth } from '@/providers/auth-provider';

function UserProfile() {
  const { user, logout } = useAuth();

  return (
    <div>
      <p>Welcome, {user.username}</p>
      <Button onClick={logout}>Logout</Button>
    </div>
  );
}
```

### Theming

Toggle between dark and light modes:

```typescript
import { useTheme } from 'next-themes';

function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      Toggle Theme
    </Button>
  );
}
```

---

## 🎨 UI Components

### Available Components

Over 50 pre-built components from shadcn/ui:

- **Layout**: Card, Separator, Tabs, Accordion
- **Forms**: Input, Select, Textarea, Checkbox, Radio, Switch
- **Feedback**: Alert, Toast, Dialog, Drawer
- **Data Display**: Table, Badge, Avatar, Skeleton
- **Navigation**: Button, Link, Breadcrumb, Pagination
- **Overlays**: Modal, Popover, Tooltip, Context Menu

### Component Examples

#### Dialog

```typescript
import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog';

function MyDialog() {
  return (
    <Dialog>
      <DialogTrigger>Open</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Title</DialogTitle>
        </DialogHeader>
        <p>Content</p>
      </DialogContent>
    </Dialog>
  );
}
```

#### Form with Validation

```typescript
import { useForm } from 'react-hook-form';
import { Form, FormField, FormItem, FormLabel } from '@/components/ui/form';

function MyForm() {
  const form = useForm({
    defaultValues: { name: '' }
  });

  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <Input {...field} />
          </FormItem>
        )}
      />
    </Form>
  );
}
```

---

## 🚀 Deployment

### Cloudflare Workers

The app is configured for deployment to Cloudflare Workers.

#### Prerequisites

- Cloudflare account
- Wrangler CLI installed globally

#### Deploy

```bash
# Login to Cloudflare
pnpm wrangler login

# Deploy to production
pnpm deploy

# Deploy to preview
pnpm wrangler deploy --env preview
```

#### Configuration

Edit `wrangler.jsonc`:

```jsonc
{
  "name": "dumpstation-web",
  "compatibility_date": "2025-12-08",
  "pages_build_output_dir": "dist",
}
```

### Static Hosting

Build and deploy to any static hosting:

```bash
# Build
pnpm build

# Output in dist/
# Upload dist/ to:
# - Netlify
# - Vercel
# - GitHub Pages
# - AWS S3 + CloudFront
# - Any static host
```

### Docker (with nginx)

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install
COPY . .
RUN pnpm build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

---

## 🧪 Testing

```bash
# Run tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage
pnpm test:coverage
```

### Example Test

```typescript
import { render, screen } from '@testing-library/react';
import { BackupList } from './BackupList';

describe('BackupList', () => {
  it('displays backups', async () => {
    render(<BackupList databaseId="123" />);

    expect(await screen.findByText('Backup 1')).toBeInTheDocument();
  });
});
```

---

## 📝 Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines.

**Frontend-specific checklist:**

- [ ] Components follow naming conventions
- [ ] TypeScript types properly defined
- [ ] Responsive design tested
- [ ] Dark mode compatibility checked
- [ ] Accessibility (a11y) considered
- [ ] Tests added for new features

---

## 🔧 Troubleshooting

### Common Issues

**API connection failed:**

```bash
# Verify backend is running
curl http://localhost:8080/health

# Check VITE_API_BASE_URL in .env.local
```

**Build errors:**

```bash
# Clear cache and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

**Type errors:**

```bash
# Regenerate route types
pnpm run type-check
```

**Styling issues:**

```bash
# Rebuild Tailwind
pnpm run build:css
```

---

## 📚 Documentation

### Key Resources

- **[TanStack Router](https://tanstack.com/router)** - File-based routing
- **[TanStack Query](https://tanstack.com/query)** - Data fetching
- **[shadcn/ui](https://ui.shadcn.com)** - UI components
- **[Tailwind CSS](https://tailwindcss.com)** - Utility-first CSS
- **[Radix UI](https://radix-ui.com)** - Unstyled components
- **[Vite](https://vitejs.dev)** - Build tool
- **[Cloudflare Workers](https://workers.cloudflare.com)** - Deployment

### Project-Specific Docs

- **[Main README](../README.md)** - Project overview
- **[Backend API](../server/README.md)** - API documentation
- **[Deployment Guide](../docs/DEPLOYMENT.md)** - Production deployment
- **[Contributing](../CONTRIBUTING.md)** - Development guidelines

---

## 📄 License

This project is licensed under the MIT License - see [LICENSE](../LICENSE) file.

---

<div align="center">

**Built with ❤️ using React**

[⬆ Back to Top](#dumpstation-web-interface)

</div>

## Testing

This project uses [Vitest](https://vitest.dev/) for testing. You can run the tests with:

```bash
npm run test
```

## Styling

This project uses [Tailwind CSS](https://tailwindcss.com/) for styling.

## Routing

This project uses [TanStack Router](https://tanstack.com/router). The initial setup is a file based router. Which means that the routes are managed as files in `src/routes`.

### Adding A Route

To add a new route to your application just add another a new file in the `./src/routes` directory.

TanStack will automatically generate the content of the route file for you.

Now that you have two routes you can use a `Link` component to navigate between them.

### Adding Links

To use SPA (Single Page Application) navigation you will need to import the `Link` component from `@tanstack/react-router`.

```tsx
import { Link } from "@tanstack/react-router";
```

Then anywhere in your JSX you can use it like so:

```tsx
<Link to="/about">About</Link>
```

This will create a link that will navigate to the `/about` route.

More information on the `Link` component can be found in the [Link documentation](https://tanstack.com/router/v1/docs/framework/react/api/router/linkComponent).

### Using A Layout

In the File Based Routing setup the layout is located in `src/routes/__root.tsx`. Anything you add to the root route will appear in all the routes. The route content will appear in the JSX where you use the `<Outlet />` component.

Here is an example layout that includes a header:

```tsx
import { Outlet, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { Link } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => (
    <>
      <header>
        <nav>
          <Link to="/">Home</Link>
          <Link to="/about">About</Link>
        </nav>
      </header>
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
});
```

The `<TanStackRouterDevtools />` component is not required so you can remove it if you don't want it in your layout.

More information on layouts can be found in the [Layouts documentation](https://tanstack.com/router/latest/docs/framework/react/guide/routing-concepts#layouts).

## Data Fetching

There are multiple ways to fetch data in your application. You can use TanStack Query to fetch data from a server. But you can also use the `loader` functionality built into TanStack Router to load the data for a route before it's rendered.

For example:

```tsx
const peopleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/people",
  loader: async () => {
    const response = await fetch("https://swapi.dev/api/people");
    return response.json() as Promise<{
      results: {
        name: string;
      }[];
    }>;
  },
  component: () => {
    const data = peopleRoute.useLoaderData();
    return (
      <ul>
        {data.results.map((person) => (
          <li key={person.name}>{person.name}</li>
        ))}
      </ul>
    );
  },
});
```

Loaders simplify your data fetching logic dramatically. Check out more information in the [Loader documentation](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#loader-parameters).

### React-Query

React-Query is an excellent addition or alternative to route loading and integrating it into you application is a breeze.

First add your dependencies:

```bash
npm install @tanstack/react-query @tanstack/react-query-devtools
```

Next we'll need to create a query client and provider. We recommend putting those in `main.tsx`.

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ...

const queryClient = new QueryClient();

// ...

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);

  root.render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
```

You can also add TanStack Query Devtools to the root route (optional).

```tsx
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <ReactQueryDevtools buttonPosition="top-right" />
      <TanStackRouterDevtools />
    </>
  ),
});
```

Now you can use `useQuery` to fetch your data.

```tsx
import { useQuery } from "@tanstack/react-query";

import "./App.css";

function App() {
  const { data } = useQuery({
    queryKey: ["people"],
    queryFn: () =>
      fetch("https://swapi.dev/api/people")
        .then((res) => res.json())
        .then((data) => data.results as { name: string }[]),
    initialData: [],
  });

  return (
    <div>
      <ul>
        {data.map((person) => (
          <li key={person.name}>{person.name}</li>
        ))}
      </ul>
    </div>
  );
}

export default App;
```

You can find out everything you need to know on how to use React-Query in the [React-Query documentation](https://tanstack.com/query/latest/docs/framework/react/overview).

## State Management

Another common requirement for React applications is state management. There are many options for state management in React. TanStack Store provides a great starting point for your project.

First you need to add TanStack Store as a dependency:

```bash
npm install @tanstack/store
```

Now let's create a simple counter in the `src/App.tsx` file as a demonstration.

```tsx
import { useStore } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import "./App.css";

const countStore = new Store(0);

function App() {
  const count = useStore(countStore);
  return (
    <div>
      <button onClick={() => countStore.setState((n) => n + 1)}>
        Increment - {count}
      </button>
    </div>
  );
}

export default App;
```

One of the many nice features of TanStack Store is the ability to derive state from other state. That derived state will update when the base state updates.

Let's check this out by doubling the count using derived state.

```tsx
import { useStore } from "@tanstack/react-store";
import { Store, Derived } from "@tanstack/store";
import "./App.css";

const countStore = new Store(0);

const doubledStore = new Derived({
  fn: () => countStore.state * 2,
  deps: [countStore],
});
doubledStore.mount();

function App() {
  const count = useStore(countStore);
  const doubledCount = useStore(doubledStore);

  return (
    <div>
      <button onClick={() => countStore.setState((n) => n + 1)}>
        Increment - {count}
      </button>
      <div>Doubled - {doubledCount}</div>
    </div>
  );
}

export default App;
```

We use the `Derived` class to create a new store that is derived from another store. The `Derived` class has a `mount` method that will start the derived store updating.

Once we've created the derived store we can use it in the `App` component just like we would any other store using the `useStore` hook.

You can find out everything you need to know on how to use TanStack Store in the [TanStack Store documentation](https://tanstack.com/store/latest).

# Demo files

Files prefixed with `demo` can be safely deleted. They are there to provide a starting point for you to play around with the features you've installed.

# Learn More

You can learn more about all of the offerings from TanStack in the [TanStack documentation](https://tanstack.com).
