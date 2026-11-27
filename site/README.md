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
    docs.css          docs layout
    theme.js          applies the saved theme before first paint
    site.js           shared behaviour: theme, menu, copy, highlighting, tabs
    home.js           landing interactions (console, topology, demos, configurator)
    docs.js           scroll-spy, on-this-page, filters
    shots/*.webp      product tour screenshots
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

Set `DEMO_URL` at the top of `public/assets/site.js` to show the "live demo"
buttons.

## Screenshots

The tour images are 1440×900 captures of the app in the Black theme, saved as
WebP (`quality=82`). Keep the file names used in `home.js` (`TOUR`).
