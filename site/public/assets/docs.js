// Docs: scroll-spy, on-this-page, mobile sidebar, section and table filters.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const slug = (t) => t.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const sections = $$('.prose > section[id]');
  const sideLinks = $$('[data-side-nav] a[href^="#"]');
  const toc = $('[data-toc]');
  const cur = $('[data-cur]');

  // heading anchors + ids for h3
  sections.forEach((sec) => {
    $$('h2, h3', sec).forEach((h) => {
      if (h.tagName === 'H3' && !h.id) h.id = sec.id + '-' + slug(h.textContent);
      const id = h.tagName === 'H2' ? sec.id : h.id;
      const a = document.createElement('a');
      a.className = 'anchor'; a.href = '#' + id; a.textContent = '#';
      a.setAttribute('aria-label', 'Link to ' + h.textContent);
      h.appendChild(a);
    });
  });

  let active = null;
  function setActive(sec) {
    if (!sec || sec === active) return;
    active = sec;
    sideLinks.forEach((a) => a.setAttribute('aria-current', String(a.getAttribute('href') === '#' + sec.id)));
    if (cur) cur.textContent = sec.dataset.title || '';
    if (toc) {
      const hs = $$('h3[id]', sec);
      const items = [[sec.id, sec.dataset.title || $('h2,h1', sec).textContent]].concat(hs.map((h) => [h.id, h.firstChild.textContent]));
      toc.textContent = '';
      items.forEach(([id, t]) => {
        const a = document.createElement('a');
        a.href = '#' + id; a.textContent = t.trim();
        toc.appendChild(a);
      });
    }
  }
  function spy() {
    const y = 120;
    let hit = sections[0];
    for (const s of sections) { if (s.getBoundingClientRect().top - y <= 0) hit = s; else break; }
    if (innerHeight + scrollY >= document.body.scrollHeight - 4) hit = sections[sections.length - 1];
    setActive(hit);
    if (toc) {
      const subs = $$('a', toc);
      let sub = subs[0];
      subs.forEach((a) => { const el = document.getElementById(a.hash.slice(1)); if (el && el.getBoundingClientRect().top - y <= 0) sub = a; });
      subs.forEach((a) => a.setAttribute('aria-current', String(a === sub)));
    }
  }
  let raf;
  addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(spy); }, { passive: true });
  spy();

  // mobile sidebar
  const side = $('#side');
  const tog = $('[data-side-toggle]');
  const setSide = (open) => {
    if (!tog) return;
    tog.setAttribute('aria-expanded', String(open));
    open ? side.setAttribute('data-open', '') : side.removeAttribute('data-open');
    document.body.style.overflow = open ? 'hidden' : '';
  };
  tog?.addEventListener('click', () => setSide(tog.getAttribute('aria-expanded') !== 'true'));
  side.addEventListener('click', (e) => { if (e.target.closest('a')) setSide(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setSide(false); });
  matchMedia('(min-width: 901px)').addEventListener('change', (m) => m.matches && setSide(false));

  // section filter (sidebar): matches titles and section text
  const q = $('[data-doc-q]');
  const empty = $('[data-side-empty]');
  q.addEventListener('input', () => {
    const v = q.value.trim().toLowerCase();
    let shown = 0;
    sideLinks.forEach((a) => {
      const sec = document.getElementById(a.hash.slice(1));
      const ok = !v || a.textContent.toLowerCase().includes(v) || (sec && sec.textContent.toLowerCase().includes(v));
      a.hidden = !ok; if (ok) shown++;
    });
    $$('[data-side-nav] h4').forEach((h) => {
      let n = h.nextElementSibling, any = false;
      while (n && n.tagName === 'A') { if (!n.hidden) any = true; n = n.nextElementSibling; }
      h.hidden = !any;
    });
    empty.hidden = shown > 0;
  });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const first = sideLinks.find((a) => !a.hidden); if (first) { location.hash = first.hash; setSide(false); q.blur(); } }
  });
  addEventListener('keydown', (e) => {
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      e.preventDefault();
      if (matchMedia('(max-width: 900px)').matches) setSide(true);
      q.focus();
    }
  });

  // table filters
  $$('[data-filter]').forEach((inp) => {
    const tbl = $(inp.dataset.filter);
    const rows = $$('tbody tr', tbl);
    const count = $(`[data-filter-count="${inp.dataset.filter}"]`);
    const update = () => {
      const v = inp.value.trim().toLowerCase();
      let n = 0;
      rows.forEach((r) => { const ok = !v || r.textContent.toLowerCase().includes(v); r.hidden = !ok; if (ok) n++; });
      if (count) count.textContent = v ? `${n} of ${rows.length}` : `${rows.length} entries`;
    };
    inp.addEventListener('input', update);
    update();
  });
})();
