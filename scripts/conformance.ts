import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadDataset } from '../src/simulator/dataset/loader.js';
import { UpstreamValidator } from '../src/shared/validation/upstream.js';
import { EmptyIdentifierMapping, IdentifierMappingSchema, collectIdentifiers, compareIdentifierMapping, enumValues, mappingTargetsAreAllowed, missingMappings, normalizeForCompare, remapRequestIdentifiers, shape, type IdentifierMapping, type MappingRole } from '../src/conformance/mapping.js';

const enabled = process.env.IIKO_CONFORMANCE_ENABLED === 'true';
const realBase = process.env.IIKO_REAL_BASE_URL;
const simulatorBase = process.env.IIKO_BASE_URL ?? 'http://127.0.0.1:4010';
const captureRoot = resolve(process.cwd(), 'conformance/captures');
const reportPath = resolve(process.cwd(), 'conformance/report.json');
const mappingPath = resolve(process.env.IIKO_CONFORMANCE_MAPPING ?? resolve(process.cwd(), 'conformance/mapping.json'));
const method = process.argv[2] ?? 'compare';

type Capture = { endpoint?: string; request?: unknown; response?: { status?: number; body?: unknown } };
type Comparison = { endpoint: string; status: 'PASS' | 'DRIFT' | 'MAPPING_REQUIRED'; statusMatch: boolean | null; schemaMatch: boolean | null; shapeMatch: boolean | null; identifierMappingMatch: boolean | null; enumMatch: boolean | null; notes: string[] };
type Report = { status: 'REAL_CAPTURE_PENDING' | 'PASS' | 'DRIFT' | 'MAPPING_REQUIRED'; enabled: boolean; mappingPath: string; comparisons: Comparison[]; notes: string[] };

function redact(value: unknown, key = ''): unknown {
  if (/(authorization|token|secret|credential|apiKey|phone|email|name)/i.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redact(childValue, childKey)]));
  return value;
}

async function jsonRequest(base: string, path: string, body: unknown, token?: string): Promise<{ status: number; body: unknown; headers: Record<string, string> }> {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const text = await response.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text) as unknown; } catch { parsed = text; }
  return { status: response.status, body: parsed, headers: { 'content-type': response.headers.get('content-type') ?? '' } };
}

async function readMapping(): Promise<IdentifierMapping> {
  let raw: string;
  try {
    raw = await readFile(mappingPath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return EmptyIdentifierMapping;
    throw new Error(`Unable to read conformance mapping ${mappingPath}`);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; }
  catch { throw new Error(`Invalid mapping JSON in ${mappingPath}`); }
  const validated = IdentifierMappingSchema.safeParse(parsed);
  if (!validated.success) throw new Error(`Invalid mapping schema in ${mappingPath}: ${validated.error.issues.map((issue) => issue.path.join('.') || 'root').join(', ')}`);
  return validated.data;
}

function allowedSimulatorIds(): Record<MappingRole, Set<string>> {
  const dataset = loadDataset();
  return {
    organizationIds: new Set([dataset.organization.id]),
    terminalGroupIds: new Set(dataset.terminalGroups.map((item) => item.id)),
    orderTypeIds: new Set(dataset.orderTypes.map((item) => item.id)),
    paymentTypeIds: new Set(dataset.paymentTypes.map((item) => item.id)),
    productIds: new Set(dataset.products.map((item) => item.id)),
    modifierIds: new Set(dataset.modifiers.map((item) => item.id))
  };
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
  const orgs = await jsonRequest(realBase, '/api/1/organizations', {}, token);
  await writeFile(resolve(target, 'organizations.json'), JSON.stringify(redact({ endpoint: '/api/1/organizations', request: {}, response: orgs }), null, 2));
  const orgBody = orgs.body as { organizations?: unknown[] };
  const firstOrganization = orgBody.organizations?.[0] as { id?: unknown } | undefined;
  const orgId = typeof firstOrganization?.id === 'string' ? firstOrganization.id : undefined;
  if (!orgId) { console.log('Captured auth and organizations; no organization id was returned, so dictionary capture stops.'); return; }
  for (const [endpoint, request] of [['/api/1/terminal_groups', { organizationIds: [orgId] }], ['/api/1/stop_lists', { organizationIds: [orgId] }], ['/api/1/deliveries/order_types', { organizationIds: [orgId] }], ['/api/1/payment_types', { organizationIds: [orgId] }], ['/api/1/nomenclature', { organizationId: orgId, startRevision: 0 }]] as const) {
    const result = await jsonRequest(realBase, endpoint, request, token);
    await writeFile(resolve(target, `${endpoint.replaceAll('/', '-').replace(/^-/, '')}.json`), JSON.stringify(redact({ endpoint, request, response: result }), null, 2));
  }
  console.log(JSON.stringify({ recorded: true, target, nextStep: `Review ${mappingPath} before compare` }));
}

function validateSchema(validator: UpstreamValidator, endpoint: string, result: { status: number; body: unknown }): boolean {
  try {
    if (result.status === 200) validator.response(endpoint, result.body, '200');
    else validator.responseErrors(endpoint, result.body, result.status);
    return true;
  } catch { return false; }
}

async function compare(): Promise<Report> {
  const report: Report = { enabled: enabled && Boolean(realBase), status: 'REAL_CAPTURE_PENDING', mappingPath, comparisons: [], notes: [] };
  if (!enabled || !realBase) {
    report.notes.push('Set IIKO_CONFORMANCE_ENABLED=true and IIKO_REAL_BASE_URL to enable capture comparison; no network call was made.');
    await writeReport(report);
    console.log(JSON.stringify(report));
    return report;
  }
  const mapping = await readMapping();
  const dates = (await readdir(captureRoot).catch(() => [])).filter((entry) => entry !== '.gitkeep');
  const latest = dates.sort().at(-1);
  if (!latest) {
    report.notes.push('No sanitized real capture found.');
    await writeReport(report);
    console.log(JSON.stringify(report));
    return report;
  }
  const dir = resolve(captureRoot, latest);
  const simulatorAuth = await jsonRequest(simulatorBase, '/api/v2/access_token', { apiKey: process.env.SIMULATOR_V2_API_KEY ?? 'vpzh-test-api-key', appId: process.env.SIMULATOR_V2_APP_ID ?? '00000000-0000-4000-8000-000000000001', clientSecret: process.env.SIMULATOR_V2_CLIENT_SECRET ?? 'vpzh-test-client-secret' });
  const simulatorToken = simulatorAuth.body && typeof simulatorAuth.body === 'object' && 'token' in simulatorAuth.body && typeof simulatorAuth.body.token === 'string' ? simulatorAuth.body.token : undefined;
  if (!simulatorToken) throw new Error('Simulator auth failed during conformance compare');
  const validator = new UpstreamValidator();
  const allowed = allowedSimulatorIds();
  for (const file of await readdir(dir)) {
    const capture = JSON.parse(await readFile(resolve(dir, file), 'utf8')) as Capture;
    if (!capture.endpoint || capture.endpoint.includes('access_token')) continue;
    const endpoint = capture.endpoint;
    const request = capture.request ?? {};
    const realBody = capture.response?.body;
    const refs = [...collectIdentifiers(endpoint, request), ...collectIdentifiers(endpoint, realBody)];
    const missing = missingMappings(refs, mapping);
    const notes: string[] = [];
    if (missing.length) {
      notes.push(`Mapping required for ${missing.map((ref) => `${ref.role}:${ref.value}`).join(', ')}`);
      report.comparisons.push({ endpoint, status: 'MAPPING_REQUIRED', statusMatch: null, schemaMatch: null, shapeMatch: null, identifierMappingMatch: false, enumMatch: null, notes });
      continue;
    }
    const remapped = remapRequestIdentifiers(request, mapping);
    const simulator = await jsonRequest(simulatorBase, endpoint, remapped.value, simulatorToken);
    const realStatus = capture.response?.status ?? 0;
    const statusMatch = realStatus === simulator.status;
    const realSchema = validateSchema(validator, endpoint, { status: realStatus, body: realBody });
    const simulatorSchema = validateSchema(validator, endpoint, simulator);
    const schemaMatch = realSchema && simulatorSchema;
    const normalizedReal = normalizeForCompare(realBody, mapping);
    const normalizedSimulator = normalizeForCompare(simulator.body, mapping);
    const fixedArrayPaths = validator.fixedArrayPaths(endpoint, '200');
    const shapeMatch = JSON.stringify(shape(normalizedReal, '', { fixedArrayPaths })) === JSON.stringify(shape(normalizedSimulator, '', { fixedArrayPaths }));
    const enumMatch = JSON.stringify(enumValues(normalizedReal)) === JSON.stringify(enumValues(normalizedSimulator));
    const targetsAllowed = mappingTargetsAreAllowed(mapping, allowed);
    const identifierMappingMatch = targetsAllowed && compareIdentifierMapping(endpoint, request, realBody, remapped.value, simulator.body, mapping);
    if (!targetsAllowed) notes.push('At least one mapping target is not a valid identifier in the synthetic simulator dataset.');
    notes.push('Volatile normalized: correlationId, token, generated order IDs and timestamps.');
    const comparisonStatus = statusMatch && schemaMatch && shapeMatch && enumMatch && identifierMappingMatch ? 'PASS' : 'DRIFT';
    report.comparisons.push({ endpoint, status: comparisonStatus, statusMatch, schemaMatch, shapeMatch, identifierMappingMatch, enumMatch, notes });
  }
  report.status = report.comparisons.length === 0 ? 'REAL_CAPTURE_PENDING' : report.comparisons.some((item) => item.status === 'MAPPING_REQUIRED') ? 'MAPPING_REQUIRED' : report.comparisons.some((item) => item.status === 'DRIFT') ? 'DRIFT' : 'PASS';
  await writeReport(report);
  console.log(JSON.stringify(report));
  if (method === 'verify' && (report.status === 'DRIFT' || report.status === 'MAPPING_REQUIRED')) process.exitCode = 1;
  return report;
}

async function writeReport(report: Report): Promise<void> {
  await mkdir(resolve(process.cwd(), 'conformance'), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  const lines = ['# Conformance report', '', `Status: **${report.status}**`, '', '| Endpoint | Status | Status match | Schema match | Shape match | ID mapping | Enum match | Notes |', '|---|---|---:|---:|---:|---:|---:|---|'];
  for (const comparison of report.comparisons) lines.push(`| ${comparison.endpoint} | ${comparison.status} | ${String(comparison.statusMatch)} | ${String(comparison.schemaMatch)} | ${String(comparison.shapeMatch)} | ${String(comparison.identifierMappingMatch)} | ${String(comparison.enumMatch)} | ${comparison.notes.join(' ')} |`);
  if (report.notes.length) lines.push('', ...report.notes.map((note) => `- ${note}`));
  lines.push('', 'Real write endpoints are never called by this command.');
  await writeFile(resolve(process.cwd(), 'conformance/report.md'), `${lines.join('\n')}\n`);
}

if (method === 'record') await record();
else if (method === 'compare' || method === 'verify') await compare();
else throw new Error('Usage: conformance.ts record|compare|verify');
