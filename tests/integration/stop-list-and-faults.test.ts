import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, organizationId, productId, startTestApp } from '../helpers.js';

describe('runtime stop-list and fault controls', () => {
  let base = '';
  let token = '';
  let close: () => Promise<void>;
  beforeAll(async () => { const started = await startTestApp(); base = started.base; close = started.close; const auth = await fetch(`${base}/api/v2/access_token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: 'vpzh-test-api-key', appId: '00000000-0000-4000-8000-000000000001', clientSecret: 'vpzh-test-client-secret' }) }); token = (await auth.json() as { token: string }).token; });
  afterAll(async () => { await close(); });

  it('changes stop-list state through control and reads it through iiko API', async () => {
    await fetch(`${base}/__simulator/control/stop-list`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId }) });
    const result = await api(base, '/api/1/stop_lists', { organizationIds: [organizationId] }, token);
    expect(result.body).toMatchObject({ terminalGroupStopLists: [{ items: [{ items: [{ productId, balance: 0 }] }] }] });
  });

  it('supports one-shot status faults', async () => {
    await fetch(`${base}/__simulator/control/reset`, { method: 'POST' });
    const auth = await fetch(`${base}/api/v2/access_token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: 'vpzh-test-api-key', appId: '00000000-0000-4000-8000-000000000001', clientSecret: 'vpzh-test-client-secret' }) });
    token = (await auth.json() as { token: string }).token;
    await fetch(`${base}/__simulator/control/fault`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: '/api/1/stop_lists', mode: 'status', status: 503, remaining: 1 }) });
    const first = await api(base, '/api/1/stop_lists', { organizationIds: [organizationId] }, token);
    expect(first.status).toBe(503);
    const second = await api(base, '/api/1/stop_lists', { organizationIds: [organizationId] }, token);
    expect(second.status).toBe(200);
  });
});
