import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, getToken, organizationId, pickupRequest, productId, startTestApp } from '../helpers.js';

describe('order failure boundaries and commands', () => {
  let base = '';
  let token = '';
  let close: () => Promise<void>;
  beforeAll(async () => { const started = await startTestApp(); base = started.base; close = started.close; token = await getToken(base); });
  afterAll(async () => { await close(); });

  it('returns an order creation error when a product is stop-listed', async () => {
    await api(base, '/__simulator/control/stop-list', { productId });
    const result = await api(base, '/api/1/deliveries/create', pickupRequest('90000000-0000-4000-8000-000000000020'), token);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ orderInfo: { creationStatus: 'Error', errorInfo: { code: 'ProductNotFound' } } });
  });

  it('supports pending then successful command status', async () => {
    await api(base, '/__simulator/control/reset', {});
    token = await getToken(base);
    await api(base, '/__simulator/control/scenario', { name: 'command-pending' });
    const created = await api(base, '/api/1/deliveries/create', pickupRequest('90000000-0000-4000-8000-000000000021'), token);
    const correlationId = (created.body as { correlationId: string }).correlationId;
    const pending = await api(base, '/api/1/commands/status', { organizationId, correlationId }, token);
    expect(pending.body).toMatchObject({ state: 'InProgress' });
    await api(base, '/__simulator/control/scenario', { name: 'command-success' });
    const success = await api(base, '/api/1/commands/status', { organizationId, correlationId }, token);
    expect(success.body).toMatchObject({ state: 'Success' });
  });

  it('supports explicit invalid-token scenario without changing product semantics', async () => {
    await api(base, '/__simulator/control/scenario', { name: 'invalid-token' });
    const result = await api(base, '/api/1/organizations', {}, token);
    expect(result.status).toBe(401);
  });
});
