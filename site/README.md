# DumpStation site

The public landing page (`/`), documentation (`/docs/`) and live demo
(`/demo/`), served by a Cloudflare Worker with static assets.

```
public/
  index.html          landing page
  docs/index.html     install, configuration and operations guide
  demo/               built from ../web (git-ignored, see "The demo")
  404.html
  _headers            security headers and caching
  robots.txt, sitemap.xml, llms.txt, site.webmanifest
  assets/
    site.css          shared styles
    home.css          landing page (dark only)
    docs.css          docs layout
    theme.js          applies the saved docs theme before first paint
    site.js           shared behaviour: menu, copy, highlighting, tabs, stars
    home.js           live demo window and the self-host configurator
    docs.js           scroll-spy, on-this-page, filters
    ui/               screenshots of the demo (Black theme, 1280x800 at 1x and 2x)
    me/               maker photo and illustration
src/index.js          Worker: SPA fallback for /demo/*, 404 page for the rest
```

## The demo

`/demo/` is the real web app built with `vite build --mode demo`. In that mode
`api()` in `web/src/lib/api/client.ts` calls `web/src/demo/api.ts` instead of
the network: an in-memory backend seeded with sample databases, agents,
storage and two weeks of history. Backups, restores, agent enrollment and
connection tests advance with wall-clock time, so the UI polls and updates
the way it does against a real server. Nothing is sent anywhere and reloading
resets it. The demo code is not included in the normal build.

```bash
cd web && npm ci           # once
cd ../site && npm run build    # writes public/demo
```

For quick iteration on the demo itself: `cd web && npm run dev:demo`
(http://127.0.0.1:7512/demo/).

The landing page embeds the demo in an iframe on screens 900px and wider,
rendered at 1440x900 and scaled to fit. Smaller screens get a screenshot and a
link.

## Develop

```bash
cd site
npm run build             # the demo, once
npx wrangler dev          # http://localhost:8787
```

## Deploy

```bash
cd site
npm run deploy            # builds the demo, then wrangler deploy
```

The Worker is named `dumpstation-site` (see `wrangler.jsonc`). Attach a custom
domain in the Cloudflare dashboard or add a `routes` entry.

## Screenshots

`assets/ui/*.webp` are captures of the demo in the Black theme at a 1280x800
viewport with device scale 2 (the `@2x` files) and downscaled 1x copies.
Recapture them when the UI changes.
