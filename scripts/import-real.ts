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
const responseBody = (file: string): Record<string, unknown> => ((captures[file] as { response?: { body?: unknown } } | undefined)?.response?.body ?? {}) as Record<string, unknown>;
const wrapperItems = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.flatMap((wrapper) => wrapper && typeof wrapper === 'object' && Array.isArray((wrapper as Record<string, unknown>).items) ? ((wrapper as Record<string, unknown>).items as unknown[]).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')) : []) : [];
const terminalGroups = wrapperItems(responseBody('api-1-terminal_groups.json').terminalGroups);
const orderTypes = wrapperItems(responseBody('api-1-deliveries-order_types.json').orderTypes);
const paymentTypes = Array.isArray(responseBody('api-1-payment_types.json').paymentTypes) ? responseBody('api-1-payment_types.json').paymentTypes as Record<string, unknown>[] : [];
const nomenclatureProducts = Array.isArray(responseBody('api-1-nomenclature.json').products) ? responseBody('api-1-nomenclature.json').products as Record<string, unknown>[] : [];
const modifierIds = nomenclatureProducts.flatMap((product) => {
  const direct = Array.isArray(product.modifiers) ? product.modifiers as Record<string, unknown>[] : [];
  const groups = Array.isArray(product.groupModifiers) ? product.groupModifiers as Record<string, unknown>[] : [];
  return [...direct, ...groups.flatMap((group) => Array.isArray(group.childModifiers) ? group.childModifiers as Record<string, unknown>[] : [])].map((item) => item.id).filter((id): id is string => typeof id === 'string');
});
const identifiers = {
  sourceCaptureDate: dates.at(-1),
  organizationId: firstOrganization?.id ?? null,
  organizationName: firstOrganization?.name ?? null,
  terminalGroupIds: terminalGroups.map((item) => item.id).filter((id): id is string => typeof id === 'string'),
  orderTypeIds: orderTypes.map((item) => item.id).filter((id): id is string => typeof id === 'string'),
  paymentTypeIds: paymentTypes.map((item) => item.id).filter((id): id is string => typeof id === 'string'),
  productIds: nomenclatureProducts.map((item) => item.id).filter((id): id is string => typeof id === 'string'),
  modifierIds: [...new Set(modifierIds)],
  notes: 'Sanitized non-secret identifier inventory. Mapping values are intentionally not guessed by array position.'
};
await writeFile(resolve(output, 'identifiers.json'), `${JSON.stringify(identifiers, null, 2)}\n`);
const mappingTemplate = {
  version: 1,
  organizationIds: firstOrganization?.id ? { [firstOrganization.id]: '' } : {},
  terminalGroupIds: Object.fromEntries(identifiers.terminalGroupIds.map((id) => [id, ''])),
  orderTypeIds: Object.fromEntries(identifiers.orderTypeIds.map((id) => [id, ''])),
  paymentTypeIds: Object.fromEntries(identifiers.paymentTypeIds.map((id) => [id, ''])),
  productIds: Object.fromEntries(identifiers.productIds.map((id) => [id, ''])),
  modifierIds: Object.fromEntries(identifiers.modifierIds.map((id) => [id, '']))
};
const mappingTemplatePath = resolve(process.cwd(), 'conformance/mapping.template.json');
await writeFile(mappingTemplatePath, `${JSON.stringify(mappingTemplate, null, 2)}\n`);
console.log(JSON.stringify({ imported: true, output, mappingTemplatePath }));
