import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), 'conformance/captures');
const output = resolve(process.cwd(), 'datasets/vse-pro-zhar-real-template');
const dates = (await readdir(root).catch(() => [])).filter((entry) => entry !== '.gitkeep').sort();
if (!dates.at(-1)) throw new Error('No sanitized conformance capture found');
const latest = resolve(root, dates.at(-1) as string);
const captures: Record<string, unknown> = {};
for (const file of await readdir(latest)) captures[file] = JSON.parse(await readFile(resolve(latest, file), 'utf8')) as unknown;
await mkdir(output, { recursive: true });
const organizations = captures['organizations.json'] as { response?: { body?: { organizations?: Array<{ id?: string; name?: string }> } } } | undefined;
const firstOrganization = organizations?.response?.body?.organizations?.[0];
await writeFile(resolve(output, 'identifiers.json'), JSON.stringify({ sourceCaptureDate: dates.at(-1), organizationId: firstOrganization?.id ?? null, organizationName: firstOrganization?.name ?? null, terminalGroupIds: [], orderTypeIds: [], paymentTypeIds: [], productIds: [], notes: 'Sanitized import template only. Add mappings after review; no credentials are copied.' }, null, 2));
console.log(JSON.stringify({ imported: true, output }));
