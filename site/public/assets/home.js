// Landing page: the in-browser demo app and the deploy configurator.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (id) => `<svg><use href="#i-${id}"/></svg>`;
  const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ================= Demo app ================= */
  const app = $('[data-app]');
  if (app) {
    const view = $('[data-view]', app);
    const modal = $('[data-modal]', app);
    const toasts = $('[data-app-toasts]', app);
    const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
    const now = () => Date.now();

    const fmtBytes = (b) => (b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b >= 1e3 ? (b / 1e3).toFixed(0) + ' KB' : b + ' B');
    const ago = (t) => {
      const s = Math.max(0, Math.round((now() - t) / 1000));
      if (s < 5) return 'just now';
      if (s < 60) return s + 's ago';
      if (s < 3600) return Math.round(s / 60) + 'm ago';
      if (s < 86400) return Math.round(s / 3600) + 'h ago';
      return Math.round(s / 86400) + 'd ago';
    };
    const clock = (t) => new Date(t).toTimeString().slice(0, 8);
    const dur = (ms) => (ms < 60e3 ? (ms / 1000).toFixed(1) + 's' : Math.floor(ms / 60e3) + 'm ' + Math.round((ms % 60e3) / 1000) + 's');

    const agents = [
      { name: 'eu-private-vpc', host: 'ip-10-0-3-41', version: 'v2.0.0', clients: '12 – 18', conns: 'ORDERS, ANALYTICS', seen: now() - 4000, online: true },
    ];
    const dbs = [
      { id: 'orders', host: '10.0.0.12:5432', pg: '16.4', exec: 'agent', agent: 'eu-private-vpc', sched: 'Daily 02:00', tz: 'UTC', size: 1.84e9 },
      { id: 'analytics', host: 'analytics.c9x.eu-west-1.rds.amazonaws.com', pg: '17.2', exec: 'direct', sched: 'Every 6 hours', tz: 'Europe/Berlin', size: 6.2e8 },
      { id: 'billing', host: 'db.internal:5432', pg: '15.8', exec: 'direct', sched: 'Hourly', tz: 'America/New_York', size: 2.4e8 },
    ];
    const byId = (id) => dbs.find((d) => d.id === id);

    // Seed history: a fortnight of mostly-green backups, newest first.
    const jobs = [];
    const seedLog = (j) => [[j.start, 'server', 'job created · trigger ' + j.trigger], [j.start + 800, j.db.exec === 'agent' ? j.db.agent : 'server', 'pg_dump --format=custom ' + j.db.id], [j.end, 'server', j.status === 'ok' ? 'verified sha256 ' + j.sha.slice(0, 12) + '… · ' + fmtBytes(j.size) : 'failed · ' + j.code]];
    [
      ['billing', 'fail', 0.6 * HOUR, 'host_unreachable'], ['orders', 'ok', 2.1 * HOUR], ['analytics', 'ok', 3.4 * HOUR],
      ['billing', 'ok', 1.6 * HOUR + DAY], ['analytics', 'ok', 9.4 * HOUR], ['orders', 'ok', DAY + 2.1 * HOUR], ['analytics', 'ok', 15.4 * HOUR],
    ].forEach(([id, status, back, code]) => {
      const db = byId(id); const end = now() - back; const ms = 20e3 + Math.random() * 40e3;
      const j = { id: hex(4), kind: 'backup', db, status, trigger: 'schedule', start: end - ms, end, size: status === 'ok' ? Math.round(db.size * (0.97 + Math.random() * 0.03)) : 0, sha: hex(32), code };
      j.log = seedLog(j); jobs.push(j);
    });
    jobs.sort((a, b) => b.end - a.end);
    const hist = [9, 11, 10, 12, 11, 12, 10, 12, 12, 11, 12, 12, 11, 6].map((n, i) => ({ ok: n, fail: i === 4 || i === 13 ? 1 : 0 }));

    let route = 'databases', jobRef = null, firstRun = true;

    function toast(msg) {
      const el = document.createElement('div');
      el.className = 'a-toast';
      el.innerHTML = icon('check') + '<span>' + esc(msg) + '</span>';
      toasts.appendChild(el);
      setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, 3000);
    }

    const statusEl = (j) => j.status === 'ok' ? '<span class="st ok">Succeeded</span>' : j.status === 'fail' ? '<span class="st fail">Failed</span>' : '<span class="st run">' + (j.kind === 'restore' ? 'Restoring' : 'Running') + '</span>';
    const execTag = (db) => db.exec === 'agent' ? `<span class="tag">${icon('server')}${esc(db.agent)}</span>` : `<span class="tag">Direct</span>`;
    const lastOf = (db) => jobs.find((j) => j.db === db && j.kind === 'backup');

    /* ---------- views ---------- */
    const V = {
      overview() {
        const ok = jobs.filter((j) => j.status === 'ok').length, all = jobs.filter((j) => j.status !== 'run').length;
        const max = Math.max(...hist.map((h) => h.ok + h.fail));
        const used = jobs.filter((j) => j.status === 'ok').reduce((a, j) => a + j.size, 0) + 38.6e9;
        return `
          <div class="v-hd"><div><h3>Overview</h3><p>Last 14 days</p></div><button class="a-btn pri" data-act="run" data-db="orders">${icon('play')}Back up orders</button></div>
          <div class="tiles">
            <div class="card tile"><small>Databases</small><b>${dbs.length}</b></div>
            <div class="card tile"><small>Success rate</small><b>${(98 + (ok / Math.max(all, 1)) * 1.6).toFixed(1)}%</b></div>
            <div class="card tile"><small>Agents online</small><b>${agents.filter((a) => a.online).length}/${agents.length}</b></div>
            <div class="card tile"><small>Storage used</small><b>${fmtBytes(used)}</b></div>
          </div>
          <div class="ov">
            <div class="card"><div class="card-hd">Backups per day<span>14 days</span></div>
              <div class="bars">${hist.map((h) => `<div title="${h.ok} ok, ${h.fail} failed"><i style="height:${(h.ok / max) * 100}%"></i>${h.fail ? `<i class="f" style="height:${(h.fail / max) * 100}%"></i>` : ''}</div>`).join('')}</div>
            </div>
            <div class="card"><div class="card-hd">Recent jobs</div>
              <ul class="feed">${jobs.slice(0, 5).map((j) => `<li data-job="${j.id}" style="cursor:pointer"><span>${statusEl(j).replace(/>(\w+)</, '>' + esc(j.db.id) + (j.kind === 'restore' ? ' · restore' : '') + '<')}</span><span class="mut3">${j.status === 'run' ? 'now' : ago(j.end)}</span></li>`).join('')}</ul>
            </div>
          </div>`;
      },
      databases() {
        return `
          <div class="v-hd"><div><h3>Databases</h3><p>${dbs.length} databases · 1 agent</p></div><button class="a-btn" tabindex="-1">${icon('plus')}Add database</button></div>
          <div class="card" style="overflow-x:auto"><table class="tbl-a">
            <thead><tr><th>Name</th><th class="hide-sm">Executor</th><th class="hide-sm">Schedule</th><th>Last backup</th><th></th></tr></thead>
            <tbody>${dbs.map((db) => {
              const l = lastOf(db);
              return `<tr>
                <td class="nm"><b>${esc(db.id)}</b><small>pg ${db.pg}</small></td>
                <td class="hide-sm">${execTag(db)}</td>
                <td class="hide-sm"><span>${db.sched}</span><div class="mut3" style="font-size:12px">${db.tz}</div></td>
                <td>${l ? (l.status === 'run' ? statusEl(l) : `<span class="st ${l.status}">${ago(l.end)}</span>`) : '<span class="mut3">Never</span>'}</td>
                <td class="r"><button class="a-btn${firstRun && db.id === 'orders' ? ' hint' : ''}" data-act="run" data-db="${db.id}" ${l && l.status === 'run' ? 'disabled' : ''}>${icon('play')}<span class="hide-sm">Back up now</span><span class="sr">Back up ${db.id} now</span></button></td>
              </tr>`;
            }).join('')}</tbody>
          </table></div>
          <div class="card" style="margin-top:12px"><div class="card-hd">Upcoming runs<span>next 24 hours</span></div>
            <ul class="feed" data-upcoming>${upcoming()}</ul></div>`;
      },
      backups() {
        return `
          <div class="v-hd"><div><h3>Backups</h3><p>Every backup and restore, newest first</p></div></div>
          <div class="card" style="overflow-x:auto"><table class="tbl-a">
            <thead><tr><th>Database</th><th>Status</th><th class="hide-sm">Size</th><th class="hide-sm">Trigger</th><th class="r">When</th></tr></thead>
            <tbody>${jobs.map((j) => `<tr data-row data-job="${j.id}">
              <td class="nm"><b>${esc(j.db.id)}</b><small>${j.kind}${j.db.exec === 'agent' ? ' · agent' : ''}</small></td>
              <td>${statusEl(j)}${j.code ? ` <span class="mut3" style="font:11.5px var(--font-mono)">${j.code}</span>` : ''}</td>
              <td class="hide-sm mut">${j.size ? fmtBytes(j.size) : '—'}</td>
              <td class="hide-sm mut">${j.trigger}</td>
              <td class="r mut3">${j.status === 'run' ? 'now' : ago(j.end)}</td>
            </tr>`).join('')}</tbody>
          </table></div>`;
      },
      job() {
        const j = jobs.find((x) => x.id === jobRef);
        if (!j) return V.backups();
        const stages = j.stages || (j.kind === 'restore' ? RESTORE_ST : BACKUP_ST).map((s) => ({ name: s[0], p: 1 }));
        return `
          <button class="v-back" data-nav-to="backups">${icon('back')}Backups</button>
          <div class="v-hd">
            <div><h3>${esc(j.db.id)} · ${j.kind}</h3><p class="mono">job ${j.id} · ${j.db.exec === 'agent' ? 'via agent ' + esc(j.db.agent) : 'direct'}</p></div>
            <div style="display:flex;gap:8px;align-items:center"><span data-j-status>${statusEl(j)}</span>
            ${j.kind === 'backup' ? `<button class="a-btn" data-act="restore" data-job="${j.id}" ${j.status !== 'ok' ? 'disabled' : ''}>${icon('undo')}Restore…</button>` : ''}</div>
          </div>
          <div class="stages" style="--n:${stages.length}" data-j-stages>${stages.map((s) => `<div class="stage" data-s="${s.p >= 1 ? 'done' : s.p > 0 ? 'active' : ''}"><div class="bar"><i style="width:${Math.round(s.p * 100)}%"></i></div><span>${s.name}</span></div>`).join('')}</div>
          <div class="card kv">
            <div><small>${j.kind === 'restore' ? 'Restored' : 'Size'}</small><b data-j-size>${fmtBytes(j.size)}</b></div>
            <div><small>Duration</small><b data-j-dur>${dur((j.end || now()) - j.start)}</b></div>
            <div><small>SHA-256</small><b data-j-sha>${j.status === 'ok' ? j.sha.slice(0, 16) + '…' : '—'}</b></div>
            <div><small>Storage</small><b>r2://acme-backups</b></div>
          </div>
          <div class="card"><div class="card-hd">Execution log<span data-j-lines>${j.log.length} lines</span></div>
            <div class="log" data-j-log>${j.log.map(logLine).join('')}</div></div>`;
      },
      agents() {
        return `
          <div class="v-hd"><div><h3>Agents</h3><p>Workers inside private networks. Outbound HTTPS only.</p></div><button class="a-btn pri" data-act="add-agent">${icon('plus')}Add agent</button></div>
          <div class="agents">${agents.map((a, i) => `
            <div class="card agent${a.fresh ? ' new' : ''}">
              <div class="agent-top"><div><b>${esc(a.name)}</b><div class="mut3" style="font-size:12px;margin-top:2px">${a.version}</div></div>
                <span class="st live" data-seen="${i}">${ago(a.seen)}</span></div>
              <dl><dt>Host</dt><dd>${esc(a.host)}</dd><dt>pg_dump</dt><dd>${a.clients}</dd><dt>Connections</dt><dd>${esc(a.conns)}</dd><dt>Restores</dt><dd>${a.fresh ? 'disabled' : 'enabled'}</dd></dl>
            </div>`).join('')}</div>`;
      },
      storage() {
        return `
          <div class="v-hd"><div><h3>Storage</h3><p>Each backup stays pinned to the bucket it was written to.</p></div></div>
          <div class="card bucket">
            <div class="agent-top"><div class="nm"><b>acme-backups</b><small>Cloudflare R2 · auto</small></div><span class="tag">Default</span></div>
            <ul class="checks" data-checks>
              <li><i>${icon('check')}</i>Write probe object<small></small></li>
              <li><i>${icon('check')}</i>Read it back<small></small></li>
              <li><i>${icon('check')}</i>Delete it<small></small></li>
            </ul>
            <div><button class="a-btn pri" data-act="test-storage">Test connection</button></div>
          </div>
          <div class="card" style="margin-top:12px;max-width:560px"><div class="card-hd">Usage by database<span>${fmtBytes(dbs.reduce((a, d) => a + d.size * 14, 0))}</span></div>
            <ul class="feed">${dbs.map((d) => `<li><span>${esc(d.id)}</span><span class="mut3 mono" style="font-size:12px">14 backups · ${fmtBytes(d.size * 14)}</span></li>`).join('')}</ul></div>`;
      },
    };

    // Next scheduled runs, computed from each database's schedule and time zone.
    const STEP = { orders: [24 * HOUR, 2 * HOUR], analytics: [6 * HOUR, 0], billing: [HOUR, 0] };
    const nextRun = (db) => { const [every, off] = STEP[db.id] || [DAY, 0]; const t = now(); return Math.ceil((t - off) / every) * every + off; };
    const inFmt = (t) => { const s = Math.max(0, Math.round((t - now()) / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return 'in ' + (h ? h + 'h ' + String(m).padStart(2, '0') + 'm' : m + 'm ' + String(x).padStart(2, '0') + 's'); };
    const upcoming = () => dbs.map((db) => [db, nextRun(db)]).sort((a, b) => a[1] - b[1]).map(([db, t]) =>
      `<li><span><b style="font-weight:560">${esc(db.id)}</b> <span class="mut3">· ${new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: db.tz })} ${db.tz.split('/').pop().replace('_', ' ')}</span></span><span class="mut3 mono" style="font-size:12px">${inFmt(t)}</span></li>`).join('');

    const logLine = ([t, src, msg]) => `<div><span class="t">${clock(t)}</span><span class="k">${esc(src)}</span><span class="${/^(verified|restore complete|connected)/.test(msg) ? 'g' : /failed/.test(msg) ? 'e' : ''}">${esc(msg)}</span></div>`;

    function render(r) {
      if (r) route = r;
      const nav = route === 'job' ? 'backups' : route;
      $$('[data-nav]', app).forEach((b) => (b.dataset.nav === nav ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
      view.innerHTML = V[route]();
      view.style.animation = 'none'; void view.offsetWidth; view.style.animation = '';
      const log = $('[data-j-log]', view); if (log) log.scrollTop = log.scrollHeight;
    }

    /* ---------- job simulation ---------- */
    const BACKUP_ST = [['queued', 500], ['connect', 700], ['dump', 2600], ['upload', 1600], ['verify', 700], ['retention', 500]];
    const RESTORE_ST = [['queued', 500], ['download', 1500], ['checksum', 700], ['pg_restore', 2600], ['analyze', 600]];
    const LINES = {
      backup: (j, s) => {
        const who = j.db.exec === 'agent' ? j.db.agent : 'server';
        return ({
          queued: [['server', j.db.exec === 'agent' ? 'queued for agent ' + j.db.agent : 'queued · 1 of 4 slots']],
          connect: [[who, j.db.exec === 'agent' ? 'claimed job via long-poll' : 'connecting ' + j.db.host], [who, 'server version ' + j.db.pg + ' · using pg_dump ' + j.db.pg.split('.')[0]]],
          dump: [[who, 'pg_dump --format=custom --no-owner ' + j.db.id], [who, 'dumping 48 tables, 3 schemas']],
          upload: [[who, j.db.exec === 'agent' ? 'PUT presigned URL · multipart 8 × 64 MB' : 'multipart upload · 8 parts']],
          verify: [['server', 'HEAD object · size matches']],
          retention: [['server', 'retention keep 14 · pruned 1 old backup']],
        })[s] || [];
      },
      restore: (j, s) => ({
        queued: [['server', 'restore target ' + j.target + (j.clean ? ' · --clean' : '')]],
        download: [[j.db.exec === 'agent' ? j.db.agent : 'server', 'GET presigned URL · ' + fmtBytes(j.size)]],
        checksum: [['server', 'sha256 matches ' + j.sha.slice(0, 12) + '…']],
        pg_restore: [[j.db.exec === 'agent' ? j.db.agent : 'server', 'pg_restore --no-owner' + (j.clean ? ' --clean --if-exists' : '') + ' -d ' + j.target]],
        analyze: [['server', 'ANALYZE · 48 tables']],
      })[s] || [],
    };

    function startJob(j, plan) {
      j.stages = plan.map(([name]) => ({ name, p: 0 }));
      j.log = [[now(), 'server', j.kind === 'restore' ? 'restore requested by admin' : 'job created · trigger manual']];
      j.status = 'run'; j.start = now(); j.end = 0;
      jobs.unshift(j);
      let i = -1, t0 = 0;
      const target = j.kind === 'backup' ? Math.round(j.db.size * (0.98 + Math.random() * 0.04)) : j.size;
      if (j.kind === 'backup') j.size = 0;
      const scale = reduced ? 0.3 : 1;
      const tick = () => {
        const tnow = now();
        if (i < 0 || tnow - t0 >= plan[i][1] * scale) {
          if (i >= 0) j.stages[i].p = 1;
          i++; t0 = tnow;
          if (i >= plan.length) return finish();
          LINES[j.kind](j, plan[i][0]).forEach(([src, msg]) => j.log.push([tnow, src, msg]));
        }
        const p = Math.min(1, (tnow - t0) / (plan[i][1] * scale));
        j.stages[i].p = Math.max(p, 0.02);
        if (j.kind === 'backup' && plan[i][0] === 'dump') j.size = Math.round(target * p);
        patch(j);
        setTimeout(tick, 90);
      };
      const finish = () => {
        j.status = 'ok'; j.end = now();
        if (j.kind === 'backup') {
          j.size = target;
          j.log.push([j.end, 'server', 'verified sha256 ' + j.sha.slice(0, 12) + '… · ' + fmtBytes(j.size)]);
          hist[hist.length - 1].ok++;
          toast(`${j.db.id} backed up · ${fmtBytes(j.size)}`);
        } else {
          j.log.push([j.end, 'server', 'restore complete · ' + j.target]);
          toast(`Restored ${j.target} from ${j.db.id}`);
        }
        if (route === 'job' && jobRef === j.id) render(); else if (route !== 'job') render();
      };
      tick();
    }

    // Update the open job view in place so the log doesn't flicker.
    function patch(j) {
      if (route !== 'job' || jobRef !== j.id) return;
      const st = $('[data-j-stages]', view);
      if (!st) return;
      $$('.stage', st).forEach((el, k) => {
        const s = j.stages[k];
        el.dataset.s = s.p >= 1 ? 'done' : s.p > 0 ? 'active' : '';
        $('i', el).style.width = Math.round(s.p * 100) + '%';
      });
      $('[data-j-size]', view).textContent = fmtBytes(j.size);
      $('[data-j-dur]', view).textContent = dur(now() - j.start);
      const log = $('[data-j-log]', view);
      if (log.childElementCount !== j.log.length) {
        log.innerHTML = j.log.map(logLine).join('');
        log.scrollTop = log.scrollHeight;
        $('[data-j-lines]', view).textContent = j.log.length + ' lines';
      }
    }

    function runBackup(dbId) {
      const db = byId(dbId);
      const l = lastOf(db);
      if (l && l.status === 'run') return;
      firstRun = false;
      const j = { id: hex(4), kind: 'backup', db, trigger: 'manual', sha: hex(32), size: 0 };
      jobRef = j.id;
      startJob(j, BACKUP_ST);
      render('job');
    }

    /* ---------- dialogs ---------- */
    function openModal(html, onMount) {
      modal.innerHTML = html; modal.hidden = false;
      const first = $('input, select, button', modal); if (first) first.focus();
      onMount && onMount();
    }
    const closeModal = () => { modal.hidden = true; modal.innerHTML = ''; };
    modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) closeModal(); });
    app.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

    function restoreDialog(j) {
      openModal(`<div class="dlg" role="dialog" aria-modal="true" aria-label="Restore backup">
        <div class="dlg-bd">
          <h4>Restore ${esc(j.db.id)}</h4>
          <p>From the backup taken ${ago(j.end)} · ${fmtBytes(j.size)}</p>
          <label class="fld">Target<select data-r-target><option value="${j.db.id}">${j.db.id} (original)</option><option value="${j.db.id}_staging">${j.db.id}_staging</option></select></label>
          <label class="chk"><input type="checkbox" data-r-clean checked />Drop existing objects first (--clean)</label>
          <label class="fld" data-r-confirm-wrap><span>Type <b style="color:var(--a-fg);font-family:var(--font-mono)" data-r-name>${esc(j.db.id)}</b> to confirm</span><input data-r-confirm autocomplete="off" spellcheck="false" placeholder="${esc(j.db.id)}" /></label>
        </div>
        <div class="dlg-ft"><button class="a-btn" data-close>Cancel</button><button class="a-btn danger" data-r-go disabled>Restore</button></div>
      </div>`, () => {
        const tgt = $('[data-r-target]', modal), clean = $('[data-r-clean]', modal), inp = $('[data-r-confirm]', modal), go = $('[data-r-go]', modal), wrap = $('[data-r-confirm-wrap]', modal);
        const sync = () => {
          const destructive = clean.checked || tgt.value === j.db.id;
          wrap.hidden = !destructive;
          $('[data-r-name]', modal).textContent = tgt.value; inp.placeholder = tgt.value;
          go.disabled = destructive && inp.value.trim() !== tgt.value;
          go.className = 'a-btn ' + (destructive ? 'danger' : 'pri');
        };
        [tgt, clean, inp].forEach((el) => el.addEventListener('input', sync));
        sync();
        go.addEventListener('click', () => {
          const r = { id: hex(4), kind: 'restore', db: j.db, trigger: 'manual', sha: j.sha, size: j.size, target: tgt.value, clean: clean.checked };
          closeModal(); jobRef = r.id; startJob(r, RESTORE_ST); render('job');
        });
      });
    }

    function addAgentDialog() {
      const name = 'us-east-office';
      openModal(`<div class="dlg" role="dialog" aria-modal="true" aria-label="Add agent">
        <div class="dlg-bd">
          <h4>Add agent</h4>
          <label class="fld">Name<input data-a-name value="${name}" autocomplete="off" spellcheck="false" /></label>
          <p>Run this on a host that can reach the database. The token is single-use and expires in an hour.</p>
          <pre class="snip" data-a-snip></pre>
          <div class="wait" data-a-wait><i></i><span>Waiting for the agent to connect…</span></div>
        </div>
        <div class="dlg-ft"><button class="a-btn" data-close>Close</button></div>
      </div>`, () => {
        const inp = $('[data-a-name]', modal), snip = $('[data-a-snip]', modal), wait = $('[data-a-wait]', modal);
        const draw = () => (snip.textContent = `docker run -d --name ${inp.value.replace(/[^a-z0-9-]/gi, '') || 'agent'} \\\n  -e DUMPSTATION_SERVER_URL=https://backups.example.com \\\n  -e DUMPSTATION_ENROLLMENT_TOKEN=dse_${hex(6)}… \\\n  ghcr.io/monzim/dumpstation-agent:latest`);
        inp.addEventListener('input', draw); draw();
        setTimeout(() => {
          if (modal.hidden || !wait.isConnected) return;
          const n = (inp.value.replace(/[^a-z0-9-]/gi, '') || 'agent').slice(0, 32);
          wait.classList.add('ok'); $('span', wait).textContent = `Connected · ${n} is online`;
          agents.push({ name: n, host: 'office-nas', version: 'v2.0.0', clients: '12 – 18', conns: 'CRM', seen: now(), online: true, fresh: true });
          toast(`Agent ${n} connected`);
          if (route === 'agents') render();
        }, reduced ? 800 : 2600);
      });
    }

    function testStorage(btn) {
      const items = $$('[data-checks] li', view);
      btn.disabled = true;
      items.forEach((li) => { li.dataset.s = ''; $('small', li).textContent = ''; });
      let k = 0;
      const step = () => {
        if (k > 0) { items[k - 1].dataset.s = 'ok'; $('small', items[k - 1]).textContent = 60 + Math.round(Math.random() * 140) + ' ms'; }
        if (k === items.length) { btn.disabled = false; toast('Storage test passed'); return; }
        items[k].dataset.s = 'run'; k++;
        setTimeout(step, reduced ? 150 : 550);
      };
      step();
    }

    /* ---------- events ---------- */
    app.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav], [data-nav-to]');
      if (nav) return render(nav.dataset.nav || nav.dataset.navTo);
      const act = e.target.closest('[data-act]');
      if (act) {
        const a = act.dataset.act;
        if (a === 'run') return runBackup(act.dataset.db);
        if (a === 'restore') return restoreDialog(jobs.find((j) => j.id === act.dataset.job));
        if (a === 'add-agent') return addAgentDialog();
        if (a === 'test-storage') return testStorage(act);
      }
      const row = e.target.closest('[data-job]');
      if (row) { jobRef = row.dataset.job; render('job'); }
    });

    // Heartbeats tick while the agents view is open.
    setInterval(() => {
      agents.forEach((a) => { if (now() - a.seen > 15e3) a.seen = now() - Math.random() * 1500; });
      if (route === 'databases') { const u = $('[data-upcoming]', view); if (u) u.innerHTML = upcoming(); }
      if (route === 'agents') $$('[data-seen]', view).forEach((el) => (el.textContent = ago(agents[+el.dataset.seen].seen)));
    }, 1000);

    render();
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
APP_ENV=production`],
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
    secrets: [orders_password]
    volumes:
      - agent_state:/var/lib/dumpstation-agent
secrets:
  orders_password:
    file: ./orders_password.txt
volumes:
  agent_state:`],
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
