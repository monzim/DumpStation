# DumpStation site

The public landing page (`/`) and documentation (`/docs/`), served as static
assets by a Cloudflare Worker. No build step: edit the files in `public/`.

```
public/
  index.html          landing page
  docs/index.html     install, configuration and operations guide
  404.html
  _headers            security headers and caching
  assets/
    site.css          shared styles (pitch-black by default, light on toggle)
    home.css          landing page and the in-browser demo app
    docs.css          docs layout
    theme.js          applies the saved theme before first paint
    site.js           shared behaviour: theme, menu, copy, highlighting, tabs
    home.js           the demo app (sample data, simulated jobs) and the deploy configurator
    docs.js           scroll-spy, on-this-page, filters
```

## Develop

```bash
cd site
npx wrangler dev          # http://localhost:8787
```

## Deploy

```bash
cd site
npx wrangler deploy
```

The Worker is named `dumpstation-site` (see `wrangler.jsonc`). Attach a custom
domain in the Cloudflare dashboard or add a `routes` entry.

## The demo

The app window on the landing page is plain HTML rendered by `home.js` from
sample data. Nothing talks to a server; jobs, agents and storage tests are
simulated with timers. Keep its labels in step with the real UI when screens
change.
