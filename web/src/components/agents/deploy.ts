// Deployment snippets for the DumpStation Agent. Mirrors the agent's
// environment surface (server/internal/agent/config.go, server/Dockerfile.agent).

export const AGENT_IMAGE = 'ghcr.io/monzim/dumpstation-agent:latest'
export const STATE_DIR = '/var/lib/dumpstation-agent'
export const TOKEN_PLACEHOLDER = '<enrollment-token>'

export interface SnippetInput {
  serverUrl: string
  /** One-time enrollment token. Omit to render a placeholder. */
  token?: string
  allowRestore?: boolean
  /** Slug used for container / resource names. */
  name?: string
}

/** Kubernetes / Docker friendly resource name derived from the agent name. */
export function slug(name?: string): string {
  const s = (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return s ? `dumpstation-agent-${s}`.replace(/-+$/, '') : 'dumpstation-agent'
}

const EXAMPLE_CONN = 'postgres://backup:CHANGE_ME@db.internal:5432/app'

export function dockerRun({ serverUrl, token, allowRestore, name }: SnippetInput): string {
  const n = slug(name)
  const lines = [
    `docker volume create ${n}-state`,
    '',
    `docker run -d --name ${n} --restart unless-stopped \\`,
    `  -e DUMPSTATION_SERVER_URL=${serverUrl} \\`,
    `  -e DUMPSTATION_ENROLLMENT_TOKEN=${token ?? TOKEN_PLACEHOLDER} \\`,
    `  -e DUMPSTATION_CONN_MAIN='${EXAMPLE_CONN}' \\`,
  ]
  if (allowRestore) lines.push('  -e DUMPSTATION_ALLOW_RESTORE=true \\')
  lines.push(`  -v ${n}-state:${STATE_DIR} \\`, `  ${AGENT_IMAGE}`)
  return lines.join('\n')
}

export function dockerCompose({ serverUrl, token, allowRestore, name }: SnippetInput): string {
  const n = slug(name)
  return [
    'services:',
    `  ${n}:`,
    `    image: ${AGENT_IMAGE}`,
    '    restart: unless-stopped',
    '    environment:',
    `      DUMPSTATION_SERVER_URL: ${serverUrl}`,
    '      # Single-use. Safe to remove once the agent shows as online.',
    `      DUMPSTATION_ENROLLMENT_TOKEN: ${token ?? TOKEN_PLACEHOLDER}`,
    '      # One variable per database the agent may back up; this one is named "main".',
    '      # Credentials stay on this host and are never sent to DumpStation.',
    '      DUMPSTATION_CONN_MAIN: postgres://backup:CHANGE_ME@postgres:5432/app',
    ...(allowRestore ? ['      DUMPSTATION_ALLOW_RESTORE: "true"'] : []),
    '    volumes:',
    '      # Holds the agent credential. Must persist across restarts.',
    `      - agent-state:${STATE_DIR}`,
    '    networks:',
    '      - db',
    '',
    'volumes:',
    '  agent-state:',
    '',
    'networks:',
    '  db:',
    '    # The existing network your PostgreSQL container is attached to.',
    '    external: true',
    '    name: your-database-network',
  ].join('\n')
}

export function kubernetes({ serverUrl, token, allowRestore, name }: SnippetInput): string {
  const n = slug(name)
  return [
    'apiVersion: v1',
    'kind: Secret',
    'metadata:',
    `  name: ${n}`,
    'type: Opaque',
    'stringData:',
    `  DUMPSTATION_ENROLLMENT_TOKEN: ${token ?? TOKEN_PLACEHOLDER}`,
    '  DUMPSTATION_CONN_MAIN: postgres://backup:CHANGE_ME@postgres.default.svc:5432/app',
    '---',
    'apiVersion: apps/v1',
    'kind: StatefulSet',
    'metadata:',
    `  name: ${n}`,
    'spec:',
    `  serviceName: ${n}`,
    '  replicas: 1 # one agent identity per credential; do not scale',
    '  selector:',
    '    matchLabels:',
    `      app: ${n}`,
    '  template:',
    '    metadata:',
    '      labels:',
    `        app: ${n}`,
    '    spec:',
    '      securityContext:',
    '        runAsUser: 10001',
    '        runAsGroup: 10001',
    '        fsGroup: 10001',
    '      containers:',
    '        - name: agent',
    `          image: ${AGENT_IMAGE}`,
    '          env:',
    '            - name: DUMPSTATION_SERVER_URL',
    `              value: ${serverUrl}`,
    ...(allowRestore ? ['            - name: DUMPSTATION_ALLOW_RESTORE', '              value: "true"'] : []),
    '          envFrom:',
    '            - secretRef:',
    `                name: ${n}`,
    '          volumeMounts:',
    '            - name: state',
    `              mountPath: ${STATE_DIR}`,
    '  volumeClaimTemplates:',
    '    - metadata:',
    '        name: state',
    '      spec:',
    '        accessModes: [ReadWriteOnce]',
    '        resources:',
    '          requests:',
    '            storage: 1Gi',
  ].join('\n')
}

export function binaryEnv({ serverUrl, token, allowRestore }: SnippetInput): string {
  return [
    '# Copy the binary out of the image (or build it: go build ./cmd/agent).',
    '# pg_dump, pg_restore and psql must be on PATH.',
    `docker cp "$(docker create ${AGENT_IMAGE})":/usr/local/bin/dumpstation-agent /usr/local/bin/`,
    '',
    `sudo mkdir -p /etc/dumpstation-agent ${STATE_DIR}`,
    "sudo tee /etc/dumpstation-agent/agent.env >/dev/null <<'EOF'",
    `DUMPSTATION_SERVER_URL=${serverUrl}`,
    `DUMPSTATION_ENROLLMENT_TOKEN=${token ?? TOKEN_PLACEHOLDER}`,
    `DUMPSTATION_STATE_DIR=${STATE_DIR}`,
    `DUMPSTATION_CONN_MAIN=${EXAMPLE_CONN}`,
    ...(allowRestore ? ['DUMPSTATION_ALLOW_RESTORE=true'] : []),
    'EOF',
    'sudo chmod 600 /etc/dumpstation-agent/agent.env',
    '',
    'set -a; . /etc/dumpstation-agent/agent.env; set +a',
    'dumpstation-agent run',
  ].join('\n')
}

export function systemdUnit(): string {
  return [
    '# /etc/systemd/system/dumpstation-agent.service',
    '[Unit]',
    'Description=DumpStation Agent',
    'After=network-online.target',
    'Wants=network-online.target',
    '',
    '[Service]',
    'EnvironmentFile=/etc/dumpstation-agent/agent.env',
    'ExecStart=/usr/local/bin/dumpstation-agent run',
    'Restart=always',
    'RestartSec=5',
    '',
    '[Install]',
    'WantedBy=multi-user.target',
  ].join('\n')
}

export function connectionsFileExample(): string {
  return [
    '# DUMPSTATION_CONNECTIONS_FILE (default /etc/dumpstation-agent/connections.yaml)',
    'connections:',
    '  main:',
    '    url: postgres://backup@db.internal:5432/app',
    '    password_file: /run/secrets/app-db-password',
    '  analytics:',
    '    host: analytics.internal',
    '    port: 5432',
    '    database: analytics',
    '    user: backup',
    '    password_env: ANALYTICS_DB_PASSWORD',
    '    sslmode: require',
  ].join('\n')
}

/** Problems with the server URL an agent would connect to. */
export function serverUrlWarnings(url: string): string[] {
  const out: string[] = []
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    return ['The server URL is not a valid URL. Set PUBLIC_URL on the DumpStation server.']
  }
  if (/^(localhost|127\.|0\.0\.0\.0|\[?::1\]?$)/.test(host) || host.endsWith('.localhost')) {
    out.push(
      `The server URL points at ${host}, which only resolves on the DumpStation host itself. Set PUBLIC_URL on the server to the address agents can reach, or edit DUMPSTATION_SERVER_URL in the snippet.`,
    )
  }
  if (url.startsWith('http://')) {
    out.push('The server URL uses plain HTTP. Agent credentials and backup traffic should travel over HTTPS outside a trusted network.')
  }
  return out
}

export interface EnvVar {
  name: string
  required?: boolean
  default?: string
  description: string
}

export const ENV_REFERENCE: EnvVar[] = [
  { name: 'DUMPSTATION_SERVER_URL', required: true, description: 'Public URL of this DumpStation server (http or https). The agent only makes outbound requests to it.' },
  { name: 'DUMPSTATION_ENROLLMENT_TOKEN', description: 'Single-use token used on first start to obtain the agent credential. Supports _FILE.' },
  { name: 'DUMPSTATION_AGENT_CREDENTIAL', description: 'Provide an existing credential directly instead of enrolling. Supports _FILE.' },
  { name: 'DUMPSTATION_STATE_DIR', default: STATE_DIR, description: 'Where the credential is stored. Mount a persistent volume here, or the agent must re-enroll after every restart.' },
  { name: 'DUMPSTATION_CONN_<NAME>', description: 'A database connection as postgres://user:pass@host:5432/db. NAME is lower-cased and _ becomes -, so DUMPSTATION_CONN_SHOP_EU is "shop-eu".' },
  { name: 'DUMPSTATION_CONN_<NAME>_PASSWORD_FILE', description: 'Read the password for that connection from a file (Docker/Kubernetes secrets).' },
  { name: 'DUMPSTATION_CONNECTIONS_FILE', default: '/etc/dumpstation-agent/connections.yaml', description: 'YAML file with named connections: url or host/port/database/user, password_file or password_env, sslmode.' },
  { name: 'DUMPSTATION_ALLOW_RESTORE', default: 'false', description: 'Allow this agent to run restores. Restores also need to be allowed on the server side for the agent.' },
  { name: 'DUMPSTATION_MAX_CONCURRENCY', default: '1', description: 'Jobs the agent runs at the same time.' },
  { name: 'DUMPSTATION_TRANSFER_MODE', default: 'auto', description: 'auto, direct (upload straight to object storage with presigned URLs) or proxy (stream through the DumpStation server).' },
  { name: 'DUMPSTATION_CA_FILE', description: 'PEM bundle to trust when the server uses a private certificate authority.' },
  { name: 'DUMPSTATION_INSECURE_SKIP_VERIFY', default: 'false', description: 'Skip TLS verification. Testing only.' },
  { name: 'DUMPSTATION_TEMP_DIR', default: '/tmp/dumpstation', description: 'Scratch space for dump files before upload.' },
  { name: 'DUMPSTATION_MIN_FREE_MB', default: '0', description: 'Refuse to start a job when the temp directory has less free space.' },
  { name: 'DUMPSTATION_SHUTDOWN_GRACE_SECONDS', default: '30', description: 'How long running jobs may finish after SIGTERM.' },
]

export const TTL_OPTIONS = [
  { value: '15', label: '15 minutes' },
  { value: '60', label: '1 hour' },
  { value: '1440', label: '24 hours' },
]
