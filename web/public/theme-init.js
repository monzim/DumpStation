// Apply the saved theme before first paint to avoid a flash (external file: CSP forbids inline scripts).
// Keep in sync with resolveTheme() in src/lib/theme/mode.tsx.
try {
  var root = document.documentElement
  var m = localStorage.getItem('ds.theme')
  // The public demo takes ?theme= from the landing page and defaults to Black.
  if (root.hasAttribute('data-ds-demo')) {
    var q = new URLSearchParams(location.search).get('theme')
    if (q === 'light' || q === 'dark' || q === 'black' || q === 'system') {
      m = q
      localStorage.setItem('ds.theme', q)
    }
    if (!m) m = 'black'
  }
  root.setAttribute('data-astryx-theme', m === 'black' ? 'dumpstation-black' : 'neutral')
  if (m === 'light' || m === 'dark') root.setAttribute('data-theme', m)
  else if (m === 'black') root.setAttribute('data-theme', 'dark')
} catch (e) {}
