import { Wordmark } from "@/components/ui/wordmark";

/*
 * Small console footer. Keeps the editorial register without competing with
 * the marketing landing page's much bigger footer.
 */
export function AppFooter() {
  return (
    <footer className="bg-canvas border-t border-hairline-soft mt-16">
      <div className="container mx-auto max-w-[1640px] px-6 lg:px-12 py-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <Wordmark size="sm" to="/" />
        <p className="text-mono-caps text-mute uppercase">
          DumpStation · PostgreSQL Backup Service
        </p>
        <a
          href="https://github.com/Monzim/DumpStation"
          target="_blank"
          rel="noreferrer noopener"
          className="text-mono-eyebrow text-ash hover:text-on-primary uppercase transition-colors"
        >
          GitHub →
        </a>
      </div>
    </footer>
  );
}
