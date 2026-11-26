// Apply the saved theme before first paint to avoid a flash (external file: CSP forbids inline scripts).
try {
  var m = localStorage.getItem('ds.theme')
  if (m === 'light' || m === 'dark') document.documentElement.setAttribute('data-theme', m)
} catch (e) {}
