// Apply the saved theme before first paint to avoid a flash (external file: CSP forbids inline scripts).
// Keep in sync with resolveTheme() in src/lib/theme/mode.tsx.
try {
  var m = localStorage.getItem('ds.theme')
  var root = document.documentElement
  root.setAttribute('data-astryx-theme', m === 'black' ? 'dumpstation-black' : 'neutral')
  if (m === 'light' || m === 'dark') root.setAttribute('data-theme', m)
  else if (m === 'black') root.setAttribute('data-theme', 'dark')
} catch (e) {}
