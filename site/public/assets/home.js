// Landing page interactions: hero console, topology, schedule preview,
// retention simulator, restore confirm, product tour, deploy configurator.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /* ================= Hero console ================= */
  const consoleEl = $('.console');
  if (consoleEl) {
    const logEl = $('[data-log]', consoleEl);
    const stages = $$('.stage', consoleEl);
    const statusEl = $('[data-c-status]', consoleEl);
    const sizeEl = $('[data-c-size]', consoleEl);
    const timeEl = $('[data-c-time]', consoleEl);
    const shaEl = $('[data-c-sha]', consoleEl);
    const viaEl = $('[data-c-via]', consoleEl);
    const dbEl = $('[data-c-db]', consoleEl);
    const destEl = $('[data-c-dest]', consoleEl);
    const modeBtns = $$('[data-mode]', consoleEl);

    const SCRIPTS = {
      agent: {
        db: 'orders · production', via: 'via agent eu-vpc-1 · pg 16.4', dest: 'r2://acme-backups/orders/', src: 'agent', total: 1.84e9,
        steps: [
          [0, 'job queued for agent eu-vpc-1 (scheduled, Europe/Berlin)', 'server'],
          [0, 'agent picked up job over long-poll · lease 120s', 'server'],
          [1, 'connection "orders" resolved locally · sslmode=require', 'agent'],
          [1, 'server version 16.4 → using pg_dump 16', 'agent'],
          [2, 'pg_dump --format=custom -Z 6 orders', 'agent'],
          [2, 'dumping 214 tables, 3 schemas', 'agent'],
          [3, 'presigned multipart upload · 16 MiB parts', 'agent'],
          [3, 'upload complete · direct to bucket', 'agent'],
          [4, 'HEAD object · size matches', 'server'],
          [4, 'sha256 recorded', 'server'],
          [5, 'retention keep 14 · pruned 1 old backup', 'server'],
          [6, 'notified #ops-backups on Discord', 'server'],
        ],
      },
      direct: {
        db: 'billing · neon', via: 'direct · pg 17.2', dest: 's3://acme-backups/billing/', src: 'server', total: 6.3e8,
        steps: [
          [0, 'job queued (manual: Back up now)', 'server'],
          [1, 'host allowed by DIRECT_ALLOWED_CIDRS', 'server'],
          [1, 'server version 17.2 → using pg_dump 17', 'server'],
          [2, 'pg_dump --format=custom -Z 6 billing', 'server'],
          [2, 'streaming to multipart upload, hashing on the fly', 'server'],
          [3, 'upload complete · 40 parts', 'server'],
          [4, 'HEAD object · size matches', 'server'],
          [4, 'sha256 recorded', 'server'],
          [5, 'retention 30 days · nothing to prune', 'server'],
          [6, 'notified Telegram @ops', 'server'],
        ],
      },
    };

    let mode = 'agent';
    let runId = 0;
    let visible = true;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const waitVisible = async () => { while (!visible || document.hidden) await sleep(250); };
    const fmtBytes = (b) => (b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1e3) + ' KB');
    const hex = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) => x.toString(16).padStart(2, '0')).join('');

    function setStage(i, progress) {
      stages.forEach((s, j) => {
        s.dataset.st = j < i ? 'done' : j === i ? 'active' : '';
        const bar = s.querySelector('i');
        bar.style.width = j < i ? '100%' : j === i ? Math.round(progress * 100) + '%' : '0%';
      });
    }
    function addLine(t, text, src, ok) {
      const d = document.createElement('div');
      d.innerHTML = `<span class="t">${t}</span><span class="src">${src}</span>${ok ? '<span class="ok">' + esc(text) + '</span>' : esc(text)}`;
      logEl.appendChild(d);
      while (logEl.children.length > 9) logEl.firstChild.remove();
    }
    function setStatus(s) {
      statusEl.dataset.s = s;
      statusEl.textContent = s === 'ok' ? 'Succeeded' : s === 'run' ? 'Running' : 'Queued';
    }

    async function run(id) {
      const sc = SCRIPTS[mode];
      dbEl.textContent = sc.db; viaEl.textContent = sc.via; destEl.textContent = sc.dest;
      logEl.textContent = ''; shaEl.textContent = '—'; sizeEl.textContent = '0 B'; timeEl.textContent = '0.0s';
      setStage(0, 0); setStatus('wait');
      const t0 = performance.now();
      let size = 0;
      const sha = hex();
      const tick = setInterval(() => { if (id === runId) timeEl.textContent = ((performance.now() - t0) / 1000 * 4.1).toFixed(1) + 's'; }, 100);

      if (reduced) {
        sc.steps.forEach(([, text, src], k) => addLine('02:00:' + String(k * 3).padStart(2, '0'), text, src, k === sc.steps.length - 1));
        setStage(6, 1); setStatus('ok'); sizeEl.textContent = fmtBytes(sc.total); shaEl.textContent = sha.slice(0, 12) + '…';
        timeEl.textContent = '41.2s'; clearInterval(tick);
        return;
      }

      let clock = 0;
      for (let k = 0; k < sc.steps.length; k++) {
        if (id !== runId) return clearInterval(tick);
        await waitVisible();
        const [stage, text, src] = sc.steps[k];
        const nextStage = sc.steps[k + 1] ? sc.steps[k + 1][0] : 6;
        if (stage >= 1) setStatus('run');
        clock += 2 + Math.floor(Math.random() * 4);
        addLine('02:00:' + String(clock).padStart(2, '0'), text, src, stage === 6);
        if (stage === 2 || stage === 3) {
          // animate bytes during dump/upload
          const steps = 14;
          for (let p = 1; p <= steps; p++) {
            if (id !== runId) return clearInterval(tick);
            await waitVisible();
            setStage(stage, (p / steps) * (nextStage > stage ? 1 : 0.5));
            if (stage === 2) { size = (sc.total * p) / steps; sizeEl.textContent = fmtBytes(size); }
            await sleep(70);
          }
        } else {
          setStage(stage, nextStage > stage ? 1 : 0.5);
          await sleep(stage === 6 ? 0 : 620);
        }
        if (stage === 4 && shaEl.textContent === '—') shaEl.textContent = sha.slice(0, 12) + '…';
      }
      setStage(6, 1); setStatus('ok'); clearInterval(tick);
      await sleep(3800);
      if (id === runId) run(++runId);
    }

    modeBtns.forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.mode;
      modeBtns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      run(++runId);
    }));
    if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(consoleEl);
    run(++runId);
  }

  /* ================= Topology ================= */
  const topoTabs = $$('[data-topo]');
  const setTopo = (m) => {
    topoTabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.topo === m)));
    $$('[data-topo-copy]').forEach((c) => (c.hidden = c.dataset.topoCopy !== m));
    const hot = m === 'direct' ? ['direct', 'store-d', 'meta'] : ['agent', 'agent2', 'store-a', 'meta'];
    $$('.tp-path').forEach((p) => {
      const on = hot.includes(p.dataset.p);
      p.classList.toggle('hot', on && p.dataset.p !== 'meta');
      p.classList.toggle('off', !on);
    });
    $$('.tp-lbl').forEach((l) => l.classList.toggle('off', !hot.includes(l.dataset.l)));
    $$('.tp-dim').forEach((n) => n.classList.toggle('off', n.dataset.tp !== m));
  };
  topoTabs.forEach((t, i) => {
    t.addEventListener('click', () => setTopo(t.dataset.topo));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const n = topoTabs[(i + 1) % topoTabs.length];
      n.focus(); setTopo(n.dataset.topo);
    });
  });
  if (topoTabs.length) setTopo('agent');

  /* ================= Schedule preview ================= */
  const sched = $('[data-sched-runs]');
  if (sched) {
    const PRESETS = {
      hourly: { cron: '0 * * * *', m: (p) => p.minute === 0 },
      '6h': { cron: '0 */6 * * *', m: (p) => p.minute === 0 && p.hour % 6 === 0 },
      daily: { cron: '0 2 * * *', m: (p) => p.minute === 0 && p.hour === 2 },
      weekly: { cron: '30 3 * * 0', m: (p) => p.minute === 30 && p.hour === 3 && p.weekday === 'Sun' },
      monthly: { cron: '0 4 1 * *', m: (p) => p.minute === 0 && p.hour === 4 && p.day === 1 },
    };
    let preset = 'daily';
    const tzSel = $('[data-sched-tz]');
    try {
      const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (local && !$$('option', tzSel).some((o) => o.value === local)) tzSel.insertAdjacentHTML('afterbegin', `<option>${esc(local)}</option>`);
      if (local) tzSel.value = local;
    } catch (e) {}

    const render = () => {
      const tz = tzSel.value;
      const P = PRESETS[preset];
      $('[data-sched-cron]').textContent = P.cron;
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, weekday: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' });
      const label = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
      let t = Math.ceil(Date.now() / 9e5) * 9e5; // next quarter hour
      const out = [];
      for (let i = 0; i < 4 * 24 * 45 && out.length < 4; i++, t += 9e5) {
        const o = {};
        parts.formatToParts(new Date(t)).forEach((x) => (o[x.type] = x.value));
        const p = { minute: +o.minute, hour: +o.hour % 24, day: +o.day, weekday: o.weekday };
        if (P.m(p)) out.push(t);
      }
      const rel = (ms) => { const h = (ms - Date.now()) / 36e5; return h < 1 ? 'in ' + Math.max(1, Math.round(h * 60)) + ' min' : h < 48 ? 'in ' + Math.round(h) + ' h' : 'in ' + Math.round(h / 24) + ' d'; };
      sched.innerHTML = out.map((ms) => `<li><span>${esc(label.format(new Date(ms)))}</span><span>${rel(ms)}</span></li>`).join('');
    };
    $$('[data-preset]').forEach((b) => b.addEventListener('click', () => {
      preset = b.dataset.preset;
      $$('[data-preset]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      render();
    }));
    tzSel.addEventListener('change', render);
    render();
  }

  /* ================= Retention ================= */
  const retRow = $('[data-ret]');
  if (retRow) {
    // newest first. f = failed
    const history = ['ok', 'ok', 'f', 'ok', 'ok', 'ok', 'ok', 'f', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok'];
    retRow.innerHTML = history.map(() => '<i></i>').join('');
    const cells = $$('i', retRow);
    const slider = $('[data-ret-n]');
    const render = () => {
      const n = +slider.value;
      let kept = 0, pruned = 0;
      history.forEach((h, i) => {
        let k;
        if (h === 'f') k = 'fail';
        else { kept++; k = kept === 1 ? 'newest' : kept <= n ? 'keep' : 'del'; if (k === 'del') pruned++; }
        cells[i].dataset.k = k;
      });
      $('[data-ret-label]').textContent = `keep last ${n}`;
      $('[data-ret-freed]').textContent = `${pruned} pruned`;
    };
    slider.addEventListener('input', render);
    render();
  }

  /* ================= Restore confirm ================= */
  const confirmIn = $('[data-confirm]');
  if (confirmIn) {
    const btn = $('[data-confirm-btn]');
    confirmIn.addEventListener('input', () => (btn.disabled = confirmIn.value.trim() !== 'orders'));
    btn.addEventListener('click', () => { window.dsToast('Restore queued · orders ← backup 02:00'); confirmIn.value = ''; btn.disabled = true; });
  }

  /* ================= Product tour ================= */
  const TOUR = [
    ['overview', 'Overview', '/', 'Health at a glance: databases needing attention, success rate, agents online, storage used and a 14-day backup history.'],
    ['databases', 'Databases', '/databases', 'Every database with its executor, schedule, time zone, retention and last result. Labels work as filters.'],
    ['backup-detail', 'Backup detail', '/backups/4f2a…', 'The full lifecycle of one job: stages, typed error codes, checksum, storage path and the streamed execution log.'],
    ['restore', 'Restore', '/backups/4f2a…/restore', 'Pick a target, choose options, type the name to confirm. Runs directly or through an agent.'],
    ['agents', 'Agents', '/agents/eu-private-vpc', 'Each agent with its heartbeat, host, PostgreSQL clients, local connections, credential and restore permission.'],
    ['agent-onboarding', 'Add agent', '/agents/new', 'A guided wizard: name it, get a single-use token and ready-made docker, Compose, Kubernetes or systemd snippets.'],
    ['storage', 'Storage', '/storage', 'S3, R2, MinIO and S3-compatible buckets with a built-in write/read/delete test.'],
  ];
  const tabsEl = $('[data-tour-tabs]');
  if (tabsEl) {
    const imgs = $('[data-tour-imgs]');
    tabsEl.innerHTML = TOUR.map(([id, name], i) => `<button role="tab" type="button" aria-selected="${i === 0}" aria-controls="tour-img" data-tour="${i}">${name}</button>`).join('');
    imgs.id = 'tour-img';
    imgs.setAttribute('role', 'tabpanel');
    imgs.innerHTML = TOUR.map(([id, name], i) => `<img src="/assets/shots/${id}.webp" alt="DumpStation ${name} screen" width="1440" height="900" ${i === 0 ? 'data-on' : 'loading="lazy"'} decoding="async" />`).join('');
    const btns = $$('button', tabsEl);
    const pics = $$('img', imgs);
    let cur = 0, timer;
    const show = (i, user) => {
      cur = i;
      btns.forEach((b, j) => b.setAttribute('aria-selected', String(i === j)));
      pics.forEach((p, j) => (i === j ? p.setAttribute('data-on', '') : p.removeAttribute('data-on')));
      $('[data-tour-url]').textContent = 'backups.example.com' + TOUR[i][2];
      $('[data-tour-cap]').textContent = TOUR[i][3];
      if (user) clearInterval(timer);
    };
    btns.forEach((b, i) => b.addEventListener('click', () => show(i, true)));
    show(0);
    if (!reduced) {
      let inView = false;
      new IntersectionObserver(([e]) => (inView = e.isIntersecting)).observe(imgs);
      timer = setInterval(() => { if (inView && !document.hidden) show((cur + 1) % TOUR.length); }, 5200);
    }
  }

  /* ================= Deploy configurator ================= */
  const paneHost = $('[data-deploy-panes]');
  if (paneHost) {
    const domainIn = $('[data-domain]');
    const b64 = (n) => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n))));
    const secrets = { pg: b64(24).replace(/[+/=]/g, ''), jwt: b64(64), key: b64(32), token: 'dse_…' };
    const clean = (v) => (v || 'backups.example.com').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/[^a-zA-Z0-9.:-]/g, '') || 'backups.example.com';

    const FILES = (d) => [
      [
        ['terminal', 'bash', `git clone https://github.com/monzim/DumpStation.git
cd DumpStation/configs
cp .env.example .env   # then paste the values from the .env tab`],
        ['.env', 'env', `# Generated in your browser. Keep DUMPSTATION_SECRET_KEY safe:
# it decrypts every stored secret.
POSTGRES_PASSWORD=${secrets.pg}
JWT_SECRET=${secrets.jwt}
DUMPSTATION_SECRET_KEY=${secrets.key}
PUBLIC_URL=https://${d}
SYSTEM_USERNAME=admin
SYSTEM_EMAIL=admin@${d.replace(/:\d+$/, '')}
APP_ENV=production
# Optional: post sign-in codes to Discord instead of the log
DISCORD_WEBHOOK_URL=`],
      ],
      [
        ['terminal', 'bash', `docker compose up -d
docker compose logs -f dumpstation

# No Discord webhook? Your sign-in code is in the log:
docker compose logs dumpstation | grep "OTP not sent"`],
        ['Caddyfile', 'caddy', `${d} {
    reverse_proxy 127.0.0.1:8080 {
        flush_interval -1
        transport http {
            read_timeout 6h
            write_timeout 6h
        }
    }
}`],
      ],
      [
        ['docker run', 'bash', `docker run -d --name dumpstation-agent --restart unless-stopped \\
  -e DUMPSTATION_SERVER_URL=https://${d} \\
  -e DUMPSTATION_ENROLLMENT_TOKEN=${secrets.token} \\
  -e DUMPSTATION_CONN_ORDERS='postgres://backup:secret@10.0.0.12:5432/orders' \\
  -v dumpstation-agent-state:/var/lib/dumpstation-agent \\
  ghcr.io/monzim/dumpstation-agent:latest`],
        ['compose.yml', 'yaml', `services:
  dumpstation-agent:
    image: ghcr.io/monzim/dumpstation-agent:latest
    restart: unless-stopped
    environment:
      DUMPSTATION_SERVER_URL: https://${d}
      DUMPSTATION_ENROLLMENT_TOKEN: ${secrets.token}   # from Agents → Add agent
      DUMPSTATION_CONN_ORDERS: postgres://backup_user@db.internal:5432/orders
      DUMPSTATION_CONN_ORDERS_PASSWORD_FILE: /run/secrets/orders_password
      DUMPSTATION_TRANSFER_MODE: auto
    secrets: [orders_password]
    volumes:
      - agent_state:/var/lib/dumpstation-agent
      - agent_tmp:/tmp/dumpstation
secrets:
  orders_password:
    file: ./orders_password.txt
volumes:
  agent_state:
  agent_tmp:`],
        ['kubectl', 'bash', `kubectl create namespace dumpstation
kubectl -n dumpstation create secret generic dumpstation-agent \\
  --from-literal=enrollment-token=${secrets.token} \\
  --from-literal=orders-password='...'
# set DUMPSTATION_SERVER_URL=https://${d} in agent.yaml, then:
kubectl -n dumpstation apply -f deploy/kubernetes/agent.yaml`],
      ],
    ];

    const tabsHost = $('[data-deploy-tabs]');
    const stepEls = $$('[data-step]');
    let step = 0, tab = 0;
    const render = () => {
      const files = FILES(clean(domainIn.value))[step];
      if (tab >= files.length) tab = 0;
      tabsHost.innerHTML = files.map(([n], i) => `<button role="tab" type="button" aria-selected="${i === tab}" data-dtab="${i}">${esc(n)}</button>`).join('');
      const [, lang, body] = files[tab];
      paneHost.innerHTML = `<pre><code data-lang="${lang}"></code></pre>`;
      const code = $('code', paneHost);
      code.textContent = body;
      window.dsHighlight(code);
      stepEls.forEach((s) => (+s.dataset.step === step ? s.setAttribute('aria-current', 'step') : s.removeAttribute('aria-current')));
    };
    tabsHost.addEventListener('click', (e) => { const b = e.target.closest('[data-dtab]'); if (b) { tab = +b.dataset.dtab; render(); } });
    stepEls.forEach((s) => {
      const go = () => { step = +s.dataset.step; tab = 0; render(); };
      s.addEventListener('click', go);
      s.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    domainIn.addEventListener('input', render);
    $('[data-copy-active]').addEventListener('click', (e) => window.dsCopy($('pre', paneHost).innerText, e.currentTarget));
    render();
  }
})();
