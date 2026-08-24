import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, organizationId, pickupRequest, startTestApp } from '../helpers.js';

describe('pickup happy path', () => {
  let base = '';
  let token = '';
  let close: () => Promise<void>;
  let clock: { advance: (ms: number) => void };
  const orderId = '90000000-0000-4000-8000-000000000099';
  beforeAll(async () => { const started = await startTestApp(); base = started.base; close = started.close; clock = started.clock; token = (await (async () => { const response = await fetch(`${base}/api/v2/access_token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: 'vpzh-test-api-key', appId: '00000000-0000-4000-8000-000000000001', clientSecret: 'vpzh-test-client-secret' }) }); return (await response.json() as { token: string }).token; })()); });
  afterAll(async () => { await close(); });

  it('auth → dictionaries → paid pickup create → lifecycle → completed', async () => {
    expect((await api(base, '/api/1/organizations', {}, token)).status).toBe(200);
    expect((await api(base, '/api/1/terminal_groups', { organizationIds: [organizationId] }, token)).status).toBe(200);
    expect((await api(base, '/api/1/stop_lists', { organizationIds: [organizationId] }, token)).status).toBe(200);
    const created = await api(base, '/api/1/deliveries/create', pickupRequest(orderId), token);
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ orderInfo: { id: orderId, creationStatus: 'Success', order: { status: 'Unconfirmed' } } });
    const createdOrder = (created.body as { orderInfo: { order: { whenCreated: string; whenConfirmed: string | null; whenCookingCompleted: string | null; whenClosed: string | null; cookingStartTime: string } } }).orderInfo.order;
    expect(createdOrder.whenConfirmed).toBeNull();
    expect(createdOrder.whenCookingCompleted).toBeNull();
    expect(createdOrder.whenClosed).toBeNull();
    for (const [status, wire] of [['accepted', 'WaitCooking'], ['cooking', 'CookingStarted'], ['ready', 'CookingCompleted'], ['completed', 'Closed']] as const) {
      clock.advance(1_000);
      const control = await api(base, '/__simulator/control/order-status', { orderId, status });
      expect(control.body).toMatchObject({ orderId, status: wire });
      const current = await api(base, '/api/1/deliveries/by_id', { organizationId, orderIds: [orderId] }, token);
      const order = (current.body as { orders: Array<{ order: { whenConfirmed: string | null; whenCookingCompleted: string | null; whenClosed: string | null; cookingStartTime: string } }> }).orders[0]?.order;
      if (status === 'accepted') expect(order?.whenConfirmed).not.toBeNull();
      if (status === 'cooking') expect(order?.cookingStartTime).not.toBe(createdOrder.whenCreated);
      if (status === 'ready') expect(order?.whenCookingCompleted).not.toBeNull();
      if (status === 'completed') expect(order?.whenClosed).not.toBeNull();
    }
    const found = await api(base, '/api/1/deliveries/by_id', { organizationId, orderIds: [orderId] }, token);
    expect(found.body).toMatchObject({ orders: [{ id: orderId, order: { status: 'Closed' } }] });
  });
});
