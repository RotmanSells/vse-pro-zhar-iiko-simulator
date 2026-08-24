import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const enabled = process.env.IIKO_CONFORMANCE_ENABLED === 'true';
const realBase = process.env.IIKO_REAL_BASE_URL;
const simulatorBase = process.env.IIKO_BASE_URL ?? 'http://127.0.0.1:4010';
const captureRoot = resolve(process.cwd(), 'conformance/captures');
const reportPath = resolve(process.cwd(), 'conformance/report.json');
const method = process.argv[2] ?? 'compare';

function redact(value: unknown, key = ''): unknown {
  if (/(authorization|token|secret|credential|apiKey|phone|email|name)/i.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redact(childValue, childKey)]));
  return value;
}

function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, shape(child)]));
  return typeof value;
}

async function jsonRequest(base: string, path: string, body: unknown, token?: string): Promise<{ status: number; body: unknown; headers: Record<string, string> }> {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const text = await response.text();
  let parsed: unknown; try { parsed = JSON.parse(text) as unknown; } catch { parsed = text; }
  return { status: response.status, body: parsed, headers: { 'content-type': response.headers.get('content-type') ?? '' } };
}

async function record(): Promise<void> {
  if (!enabled || !realBase) { console.log('Conformance record disabled: set IIKO_CONFORMANCE_ENABLED=true and IIKO_REAL_BASE_URL to enable network access.'); return; }
  if (process.argv.includes('--write') && !(process.env.IIKO_ALLOW_REAL_WRITE_TESTS === 'true' && process.env.IIKO_REAL_WRITE_CONFIRMATION === 'I_UNDERSTAND_THIS_CREATES_A_REAL_IIKO_OPERATION')) throw new Error('Real write tests require both explicit confirmation flags.');
  const date = new Date().toISOString().slice(0, 10);
  const target = resolve(captureRoot, date);
  await mkdir(target, { recursive: true });
  const currentCredentials = process.env.IIKO_REAL_API_KEY && process.env.IIKO_REAL_APP_ID && process.env.IIKO_REAL_CLIENT_SECRET;
  const authPath = currentCredentials ? '/api/v2/access_token' : '/api/1/access_token';
  const authRequest = currentCredentials ? { apiKey: process.env.IIKO_REAL_API_KEY, appId: process.env.IIKO_REAL_APP_ID, clientSecret: process.env.IIKO_REAL_CLIENT_SECRET } : { apiLogin: process.env.IIKO_REAL_API_LOGIN };
  const auth = await jsonRequest(realBase, authPath, authRequest);
  await writeFile(resolve(target, 'auth.json'), JSON.stringify(redact({ endpoint: authPath, request: authRequest, response: auth }), null, 2));
  if (auth.status !== 200 || !auth.body || typeof auth.body !== 'object' || !('token' in auth.body)) throw new Error('Real auth capture failed');
  const token = auth.body.token;
  if (typeof token !== 'string') throw new Error('Real auth response token is not a string');
  const orgs = await jsonRequest(realBase, '/api/1/organizations', {} , token);
  await writeFile(resolve(target, 'organizations.json'), JSON.stringify(redact({ endpoint: '/api/1/organizations', request: {}, response: orgs }), null, 2));
  const orgBody = orgs.body as { organizations?: unknown[] };
  const firstOrganization = orgBody.organizations?.[0] as { id?: unknown } | undefined;
  const orgId = typeof firstOrganization?.id === 'string' ? firstOrganization.id : undefined;
  if (!orgId) { console.log('Captured auth and organizations; no organization id was returned, so dictionary capture stops.'); return; }
  for (const [endpoint, request] of [['/api/1/terminal_groups', { organizationIds: [orgId] }], ['/api/1/stop_lists', { organizationIds: [orgId] }], ['/api/1/deliveries/order_types', { organizationIds: [orgId] }], ['/api/1/payment_types', { organizationIds: [orgId] }], ['/api/1/nomenclature', { organizationId: orgId, startRevision: 0 }]] as const) {
    const result = await jsonRequest(realBase, endpoint, request, token);
    await writeFile(resolve(target, `${endpoint.replaceAll('/', '-').replace(/^-/, '')}.json`), JSON.stringify(redact({ endpoint, request, response: result }), null, 2));
  }
  console.log(JSON.stringify({ recorded: true, target }));
}

async function compare(): Promise<void> {
  const report: { enabled: boolean; status: string; comparisons: Array<Record<string, unknown>> } = { enabled, status: enabled ? 'pending' : 'real_capture_pending', comparisons: [] };
  if (!enabled) { await writeReport(report); console.log(JSON.stringify(report)); return; }
  const dates = (await readdir(captureRoot).catch(() => [])).filter((entry) => entry !== '.gitkeep');
  const latest = dates.sort().at(-1);
  if (!latest) { await writeReport(report); console.log(JSON.stringify(report)); return; }
  const dir = resolve(captureRoot, latest);
  const simulatorAuth = await jsonRequest(simulatorBase, '/api/v2/access_token', { apiKey: 'vpzh-test-api-key', appId: '00000000-0000-4000-8000-000000000001', clientSecret: 'vpzh-test-client-secret' });
  const simulatorToken = simulatorAuth.body && typeof simulatorAuth.body === 'object' && 'token' in simulatorAuth.body && typeof simulatorAuth.body.token === 'string' ? simulatorAuth.body.token : undefined;
  for (const file of await readdir(dir)) {
    const capture = JSON.parse(await readFile(resolve(dir, file), 'utf8')) as { endpoint?: string; request?: unknown; response?: { status?: number; body?: unknown } };
    if (!capture.endpoint || capture.endpoint.includes('access_token')) continue;
    const simulator = await jsonRequest(simulatorBase, capture.endpoint, capture.request ?? {}, simulatorToken);
    const realStatus = capture.response?.status;
    const realBody = capture.response?.body;
    const match = realStatus === simulator.status && JSON.stringify(shape(realBody)) === JSON.stringify(shape(simulator.body));
    report.comparisons.push({ endpoint: capture.endpoint, realStatus, simulatorStatus: simulator.status, shapeMatch: match, semantic: 'manual review pending for values' });
  }
  report.status = report.comparisons.every((comparison) => comparison.shapeMatch === true) ? 'shape_match' : 'drift_detected';
  await writeReport(report);
  console.log(JSON.stringify(report));
  if (report.status === 'drift_detected') process.exitCode = 1;
}

async function writeReport(report: unknown): Promise<void> {
  await mkdir(resolve(process.cwd(), 'conformance'), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  const data = report as { status: string; comparisons?: Array<Record<string, unknown>> };
  const lines = ['# Conformance report', '', `Status: **${data.status}**`, '', '| Endpoint | Status | Shape match |', '|---|---:|---:|'];
  for (const comparison of data.comparisons ?? []) lines.push(`| ${String(comparison.endpoint)} | ${String(comparison.realStatus)} / ${String(comparison.simulatorStatus)} | ${String(comparison.shapeMatch)} |`);
  lines.push('', 'Real write endpoints are never called by this command.');
  await writeFile(resolve(process.cwd(), 'conformance/report.md'), `${lines.join('\n')}\n`);
}

if (method === 'record') await record();
else if (method === 'compare' || method === 'verify') await compare();
else throw new Error('Usage: conformance.ts record|compare|verify');
