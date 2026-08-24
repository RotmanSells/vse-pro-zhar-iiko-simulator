import { mkdir, writeFile } from 'node:fs/promises';
import { createApp } from '../src/app/server.js';
import { loadConfig } from '../src/app/config.js';
import { FixedClock } from '../src/shared/clock/clock.js';
import { organizationId, terminalGroupId, pickupRequest } from '../tests/helpers.js';

const app = createApp(loadConfig({ ...process.env, PORT: '4010', SIMULATOR_DETERMINISTIC_IDS: 'true' }), new FixedClock(Date.parse('2026-08-24T00:00:00.000Z')));
await new Promise<void>((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
const address = app.server.address();
if (!address || typeof address === 'string') throw new Error('Could not start fixture server');
const base = `http://127.0.0.1:${address.port}`;
const root = `${process.cwd()}/contracts/examples`;

async function request(path: string, body: unknown, token?: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as unknown };
}
async function save(endpoint: string, requestBody: unknown, success: unknown, error: unknown): Promise<void> {
  const directory = `${root}/${endpoint}`;
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/request.valid.json`, `${JSON.stringify(requestBody, null, 2)}\n`);
  await writeFile(`${directory}/response.success.json`, `${JSON.stringify(success, null, 2)}\n`);
  await writeFile(`${directory}/response.error.json`, `${JSON.stringify(error, null, 2)}\n`);
}
const authRequest = { apiKey: 'vpzh-test-api-key', appId: '00000000-0000-4000-8000-000000000001', clientSecret: 'vpzh-test-client-secret' };
const auth = await request('/api/v2/access_token', authRequest);
const token = (auth.body as { token: string }).token;
await save('api-2-access-token', authRequest, { correlationId: '00000000-0000-4000-8000-000000000101', token: 'fixture-token' }, { correlationId: '00000000-0000-4000-8000-000000000102', errorDescription: 'Invalid credentials', error: null });
await save('api-1-access-token', { apiLogin: 'vpzh-test-api-login' }, { correlationId: '00000000-0000-4000-8000-000000000103', token: 'fixture-token' }, { correlationId: '00000000-0000-4000-8000-000000000104', errorDescription: 'Invalid credentials', error: null });
await save('api-1-organizations', {}, (await request('/api/1/organizations', {}, token)).body, { correlationId: '00000000-0000-4000-8000-000000000105', errorDescription: 'Invalid request', error: 'Common' });
await save('api-1-terminal-groups', { organizationIds: [organizationId] }, (await request('/api/1/terminal_groups', { organizationIds: [organizationId] }, token)).body, { correlationId: '00000000-0000-4000-8000-000000000106', errorDescription: 'Invalid request', error: 'Common' });
await save('api-1-terminal-groups-is-alive', { organizationIds: [organizationId], terminalGroupIds: [terminalGroupId] }, (await request('/api/1/terminal_groups/is_alive', { organizationIds: [organizationId], terminalGroupIds: [terminalGroupId] }, token)).body, { correlationId: '00000000-0000-4000-8000-000000000107', errorDescription: 'Invalid request', error: 'Common' });
await save('api-1-stop-lists', { organizationIds: [organizationId], terminalGroupsIds: [terminalGroupId] }, (await request('/api/1/stop_lists', { organizationIds: [organizationId], terminalGroupsIds: [terminalGroupId] }, token)).body, { correlationId: '00000000-0000-4000-8000-000000000108', errorDescription: 'Invalid request', error: 'Common' });
await save('api-1-order-types', { organizationIds: [organizationId] }, (await request('/api/1/deliveries/order_types', { organizationIds: [organizationId] }, token)).body, { correlationId: '00000000-0000-4000-8000-000000000109', errorDescription: 'Invalid request', error: 'Common' });
await save('api-1-payment-types', { organizationIds: [organizationId] }, (await request('/api/1/payment_types', { organizationIds: [organizationId] }, token)).body, { correlationId: '00000000-0000-4000-8000-000000000110', errorDescription: 'Invalid request', error: 'Common' });
await save('api-1-nomenclature', { organizationId, startRevision: 0 }, (await request('/api/1/nomenclature', { organizationId, startRevision: 0 }, token)).body, { correlationId: '00000000-0000-4000-8000-000000000111', errorDescription: 'Invalid request', error: 'Common' });
await save('api-2-menu', {}, (await request('/api/2/menu', {}, token)).body, { correlationId: '00000000-0000-4000-8000-000000000112', errorDescription: 'Invalid request', error: 'Common' });
await save('api-2-menu-by-id', { externalMenuId: 'vpzh-simulator-external-menu', organizationIds: [organizationId], version: 2 }, (await request('/api/2/menu/by_id', { externalMenuId: 'vpzh-simulator-external-menu', organizationIds: [organizationId], version: 2 }, token)).body, { correlationId: '00000000-0000-4000-8000-000000000113', errorDescription: 'Invalid request', error: 'Common' });
const created = await request('/api/1/deliveries/create', pickupRequest(), token);
await save('api-1-deliveries-create', pickupRequest(), created.body, { correlationId: '00000000-0000-4000-8000-000000000114', errorDescription: 'Invalid order', error: 'Common' });
await save('api-1-deliveries-by-id', { organizationId, orderIds: ['90000000-0000-4000-8000-000000000010'] }, (await request('/api/1/deliveries/by_id', { organizationId, orderIds: ['90000000-0000-4000-8000-000000000010'] }, token)).body, { correlationId: '00000000-0000-4000-8000-000000000115', errorDescription: 'Invalid request', error: 'Common' });
await save('api-1-commands-status', { organizationId, correlationId: '00000000-0000-4000-8000-000000000116' }, { state: 'InProgress' }, { correlationId: '00000000-0000-4000-8000-000000000117', errorDescription: 'Command is not available', error: 'Common' });
await app.server.close();
console.log(JSON.stringify({ generated: true, endpointFixtures: 14 }));
