// Landing page: the live demo window and the self-host configurator.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ================= Live demo =================
     Desktop: the real app (/demo/, in-browser fake API) loads in the window
     once the page is idle. The screenshot stays underneath until it is ready.
     Small screens: the screenshot plus a button that opens the demo. */
  const live = $('[data-live]');
  if (live) {
    const body = $('.win-body', live);
    const startBtn = $('[data-live-start]', live);
    const wide = matchMedia('(min-width: 900px)');
    const saveData = navigator.connection && navigator.connection.saveData;
    let loaded = false;
    const load = () => {
      if (loaded) return;
      loaded = true;
      const f = document.createElement('iframe');
      f.src = '/demo/?theme=black';
      f.title = 'DumpStation live demo';
      f.setAttribute('allow', 'clipboard-write');
      f.addEventListener('load', () => setTimeout(() => f.setAttribute('data-ready', ''), 350), { once: true });
      body.appendChild(f);
      const fit = () => body.style.setProperty('--s', String(body.clientWidth / 1440));
      fit();
      new ResizeObserver(fit).observe(body);
      startBtn.hidden = true;
    };
    const decide = () => {
      if (loaded) return;
      if (wide.matches && !saveData) {
        startBtn.hidden = true;
        const go = () => ('requestIdleCallback' in window ? requestIdleCallback(load, { timeout: 2500 }) : setTimeout(load, 800));
        document.readyState === 'complete' ? go() : addEventListener('load', go, { once: true });
      } else {
        startBtn.hidden = false;
      }
    };
    startBtn.addEventListener('click', () => {
      if (wide.matches) load();
      else location.href = '/demo/';
    });
    wide.addEventListener('change', decide);
    decide();
  }

  /* ================= Self-host configurator ================= */
  const paneHost = $('[data-deploy-panes]');
  if (paneHost) {
    const domainIn = $('[data-domain]');
    const b64 = (n) => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n))));
    const secrets = { pg: b64(24).replace(/[+/=]/g, ''), jwt: b64(64), key: b64(32) };
    const clean = (v) => (v || 'backups.example.com').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/[^a-zA-Z0-9.:-]/g, '') || 'backups.example.com';

    const FILES = (d) => [
      ['install.sh', 'bash', `git clone https://github.com/monzim/DumpStation.git
cd DumpStation/configs
cp .env.example .env      # paste the values from the .env tab

docker compose up -d
docker compose logs -f dumpstation

# No Discord webhook yet? Your sign-in code is in the log:
docker compose logs dumpstation | grep "OTP not sent"`],
      ['.env', 'env', `# Generated in your browser. Keep DUMPSTATION_SECRET_KEY safe:
# it decrypts every stored secret.
POSTGRES_PASSWORD=${secrets.pg}
JWT_SECRET=${secrets.jwt}
DUMPSTATION_SECRET_KEY=${secrets.key}
PUBLIC_URL=https://${d}
SYSTEM_USERNAME=admin
APP_ENV=production
# Optional: post sign-in codes to Discord instead of the log
DISCORD_WEBHOOK_URL=`],
      ['Caddyfile', 'caddy', `${d} {
    reverse_proxy 127.0.0.1:8080 {
        flush_interval -1
        transport http {
            read_timeout 6h
            write_timeout 6h
        }
    }
}`],
      ['agent.sh', 'bash', `# On a host next to a private database.
# Get the token from Backup Agents → Add agent.
docker run -d --name dumpstation-agent --restart unless-stopped \\
  -e DUMPSTATION_SERVER_URL=https://${d} \\
  -e DUMPSTATION_ENROLLMENT_TOKEN=dse_… \\
  -e DUMPSTATION_CONN_ORDERS='postgres://backup:secret@10.0.0.12:5432/orders' \\
  -v dumpstation-agent-state:/var/lib/dumpstation-agent \\
  ghcr.io/monzim/dumpstation-agent:latest`],
    ];

    const tabsHost = $('[data-deploy-tabs]');
    let tab = 0;
    const render = () => {
      const files = FILES(clean(domainIn.value));
      tabsHost.innerHTML = files.map(([n], i) => `<button role="tab" type="button" aria-selected="${i === tab}" tabindex="${i === tab ? 0 : -1}" data-dtab="${i}">${esc(n)}</button>`).join('');
      const [, lang, body] = files[tab];
      paneHost.innerHTML = '<pre><code></code></pre>';
      const code = $('code', paneHost);
      code.setAttribute('data-lang', lang);
      code.textContent = body;
      window.dsHighlight(code);
    };
    tabsHost.addEventListener('click', (e) => { const b = e.target.closest('[data-dtab]'); if (b) { tab = +b.dataset.dtab; render(); } });
    tabsHost.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      tab = (tab + (e.key === 'ArrowRight' ? 1 : 3)) % 4;
      render();
      $(`[data-dtab="${tab}"]`, tabsHost).focus();
    });
    domainIn.addEventListener('input', render);
    $('[data-copy-active]').addEventListener('click', (e) => window.dsCopy($('pre', paneHost).innerText, e.currentTarget));
    render();
  }
})();
