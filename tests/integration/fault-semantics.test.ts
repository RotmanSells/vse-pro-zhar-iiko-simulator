import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, getToken, organizationId, startTestApp } from '../helpers.js';

describe('network fault semantics', () => {
  let base = '';
  let token = '';
  let close: () => Promise<void>;
  beforeAll(async () => { const started = await startTestApp(); base = started.base; close = started.close; token = await getToken(base); });
  afterAll(async () => { await close(); });

  it('slow-response returns 200 after its delay', async () => {
    await api(base, '/__simulator/control/fault', { endpoint: '/api/1/stop_lists', mode: 'slow-response', delayMs: 40, remaining: 1 });
    const startedAt = Date.now();
    const result = await api(base, '/api/1/stop_lists', { organizationIds: [organizationId] }, token);
    expect(result.status).toBe(200);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(30);
  });

  it('timeout lets an earlier client AbortSignal win over the delayed response', async () => {
    await api(base, '/__simulator/control/fault', { endpoint: '/api/1/stop_lists', mode: 'timeout', delayMs: 200, remaining: 1 });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30);
    await expect(fetch(`${base}/api/1/stop_lists`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ organizationIds: [organizationId] }), signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    clearTimeout(timer);
  });

  it('HTTP 408 remains available through the explicit status fault', async () => {
    await api(base, '/__simulator/control/fault', { endpoint: '/api/1/stop_lists', mode: 'status', status: 408, remaining: 1 });
    const result = await api(base, '/api/1/stop_lists', { organizationIds: [organizationId] }, token);
    expect(result.status).toBe(408);
  });
});
