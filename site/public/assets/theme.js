// Runs before first paint: apply the saved theme (dark is the default).
(function () {
  try {
    var t = localStorage.getItem('ds-site-theme');
    if (!t) t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
  } catch (e) {
    document.documentElement.dataset.theme = 'dark';
  }
})();
