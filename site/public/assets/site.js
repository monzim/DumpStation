// Shared behaviour for the landing page and the docs.
(() => {
  // Where the hosted demo lives. Leave empty to hide every "live demo" link.
  const DEMO_URL = '';
  const REPO = 'monzim/DumpStation';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;

  // ---------- theme ----------
  $$('[data-theme-toggle]').forEach((b) =>
    b.addEventListener('click', () => {
      const next = root.dataset.theme === 'light' ? 'dark' : 'light';
      root.dataset.theme = next;
      try { localStorage.setItem('ds-site-theme', next); } catch (e) {}
      const meta = $('meta[name="theme-color"]');
      if (meta) meta.content = next === 'light' ? '#fbfaf8' : '#000000';
    }),
  );

  // ---------- header ----------
  const hdr = $('#hdr');
  if (hdr) {
    const onScroll = () => (window.scrollY > 8 ? hdr.setAttribute('data-scrolled', '') : hdr.removeAttribute('data-scrolled'));
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
  }

  // ---------- mobile menu ----------
  const menuBtn = $('[data-menu]');
  const mnav = $('#mnav');
  if (menuBtn && mnav) {
    const set = (open) => {
      menuBtn.setAttribute('aria-expanded', String(open));
      open ? mnav.setAttribute('data-open', '') : mnav.removeAttribute('data-open');
    };
    menuBtn.addEventListener('click', () => set(menuBtn.getAttribute('aria-expanded') !== 'true'));
    mnav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
    matchMedia('(min-width: 861px)').addEventListener('change', (m) => m.matches && set(false));
  }

  // ---------- toast ----------
  const toastEl = $('[data-toast]');
  let toastT;
  window.dsToast = (msg) => {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.setAttribute('data-on', '');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.removeAttribute('data-on'), 1800);
  };

  // ---------- copy ----------
  const COPY_ICON = '<svg><use href="#i-copy"/></svg>';
  const CHECK_ICON = '<svg><use href="#i-check"/></svg>';
  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (err) {}
      ta.remove();
    }
    if (btn) {
      const label = btn.querySelector('span');
      const prev = btn.innerHTML;
      btn.setAttribute('data-done', '');
      btn.innerHTML = CHECK_ICON + (label ? '<span>Copied</span>' : '');
      setTimeout(() => { btn.removeAttribute('data-done'); btn.innerHTML = prev; }, 1400);
    }
    window.dsToast('Copied to clipboard');
  }
  window.dsCopy = copyText;
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    const sel = b.getAttribute('data-copy');
    const src = sel ? $(sel) : b.closest('.code')?.querySelector('pre');
    if (src) copyText(src.innerText.replace(/\n$/, ''), b);
  });

  // ---------- syntax highlighting (tiny, line-based) ----------
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function hlLine(line, lang) {
    // comments
    const cIdx = (() => {
      if (lang === 'nginx' || lang === 'caddy' || lang === 'bash' || lang === 'yaml' || lang === 'env') {
        let inS = false, q = '';
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (inS) { if (ch === q) inS = false; continue; }
          if (ch === '"' || ch === "'") { inS = true; q = ch; continue; }
          if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) return i;
        }
      }
      return -1;
    })();
    let code = cIdx >= 0 ? line.slice(0, cIdx) : line;
    const comment = cIdx >= 0 ? line.slice(cIdx) : '';
    let out = esc(code);
    // strings
    out = out.replace(/("[^"]*"|'[^']*')/g, '<span class="tk-s">$1</span>');
    if (lang === 'yaml') out = out.replace(/^(\s*-?\s*)([A-Za-z0-9_.-]+)(:)(?=\s|$)/, '$1<span class="tk-k">$2</span>$3');
    if (lang === 'env') out = out.replace(/^([A-Z0-9_]+)(=)/, '<span class="tk-k">$1</span>$2');
    if (lang === 'bash') {
      out = out.replace(/^(\s*)(docker compose|docker|kubectl|git|cd|cp|echo|cat|sudo|openssl|curl|systemctl|mkdir|chmod)(?=\s|$)/, '$1<span class="tk-k">$2</span>');
      out = out.replace(/(\$\([^)]*\))/g, '<span class="tk-v">$1</span>');
      out = out.replace(/(\s)(-{1,2}[a-zA-Z][\w-]*)/g, '$1<span class="tk-v">$2</span>');
    }
    if (lang === 'nginx' || lang === 'caddy') out = out.replace(/^(\s*)([a-z_]+)(?=\s)/, '$1<span class="tk-k">$2</span>');
    if (lang === 'json') out = out.replace(/<span class="tk-s">("[^"]*")<\/span>(\s*:)/g, '<span class="tk-k">$1</span>$2');
    return out + (comment ? '<span class="tk-c">' + esc(comment) + '</span>' : '');
  }
  window.dsHighlight = (codeEl) => {
    const lang = codeEl.getAttribute('data-lang') || '';
    if (!lang) return;
    const raw = codeEl.textContent;
    codeEl.innerHTML = raw.split('\n').map((l) => hlLine(l, lang)).join('\n');
  };
  $$('pre code[data-lang]').forEach(window.dsHighlight);

  // ---------- tabbed code groups (docs) ----------
  $$('[data-tabs]').forEach((group) => {
    const tabs = $$('[role="tab"]', group);
    const panes = $$('[role="tabpanel"]', group);
    const select = (i) => {
      tabs.forEach((t, j) => { t.setAttribute('aria-selected', String(i === j)); t.tabIndex = i === j ? 0 : -1; });
      panes.forEach((p, j) => (p.hidden = i !== j));
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(i));
      t.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const n = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
        select(n); tabs[n].focus();
      });
    });
    const copyBtn = $('[data-copy-active]', group);
    if (copyBtn) copyBtn.addEventListener('click', () => {
      const pane = panes.find((p) => !p.hidden) || panes[0];
      copyText(pane.querySelector('pre').innerText, copyBtn);
    });
  });

  // ---------- reveal on scroll ----------
  const reveals = $$('.reveal');
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.setAttribute('data-in', ''); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    reveals.forEach((el) => io.observe(el));
  } else reveals.forEach((el) => el.setAttribute('data-in', ''));

  // ---------- demo links ----------
  $$('[data-demo-link]').forEach((a) => {
    if (DEMO_URL) { a.href = DEMO_URL; a.hidden = false; }
  });

  // ---------- GitHub stars (best effort, cached for an hour) ----------
  const starEl = $('[data-stars]');
  if (starEl) {
    const show = (n) => { if (typeof n === 'number') { starEl.textContent = n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); starEl.hidden = false; } };
    let cached;
    try { cached = JSON.parse(localStorage.getItem('ds-stars') || 'null'); } catch (e) {}
    if (cached && Date.now() - cached.t < 3600e3) show(cached.n);
    else fetch('https://api.github.com/repos/' + REPO, { headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && typeof j.stargazers_count === 'number') { show(j.stargazers_count); try { localStorage.setItem('ds-stars', JSON.stringify({ n: j.stargazers_count, t: Date.now() })); } catch (e) {} } })
      .catch(() => {});
  }

  $$('[data-year]').forEach((el) => (el.textContent = String(new Date().getFullYear())));
})();
