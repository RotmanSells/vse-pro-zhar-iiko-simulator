import type { Server } from 'node:http';
import { createApp, type SimulatorApp } from '../src/app/server.js';
import { loadConfig } from '../src/app/config.js';
import { FixedClock } from '../src/shared/clock/clock.js';

export const organizationId = '3e41b6b4-9f43-4f65-8e5d-0c1c4c2f9a10';
export const terminalGroupId = '4c6d5f37-bda2-4ed1-b48e-1b4fa7028f21';
export const orderTypeId = '5c4d5e86-5f6c-46ae-8dd7-8e27b4ab1f31';
export const paymentTypeId = '6a0d7c48-8f9e-4a12-9b33-4c5d6e7f8a41';
export const productId = '10000000-0000-4000-8000-000000000001';
export const modifierId = '20000000-0000-4000-8000-000000000001';

export async function startTestApp(): Promise<{ app: SimulatorApp; base: string; close: () => Promise<void> }> {
  const config = loadConfig({ ...process.env, PORT: '4010', SIMULATOR_DETERMINISTIC_IDS: 'true' });
  const app = createApp(config, new FixedClock(Date.parse('2026-08-24T00:00:00.000Z')));
  await new Promise<void>((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', () => resolve()); });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not expose a port');
  const base = `http://127.0.0.1:${address.port}`;
  return { app, base, close: () => closeServer(app.server) };
}

export async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

export async function getToken(base: string): Promise<string> {
  const response = await fetch(`${base}/api/v2/access_token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: 'vpzh-test-api-key', appId: '00000000-0000-4000-8000-000000000001', clientSecret: 'vpzh-test-client-secret' }) });
  const body = await response.json() as { token: string };
  return body.token;
}

export async function api(base: string, path: string, body: unknown, token?: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as unknown };
}

export function pickupRequest(orderId = '90000000-0000-4000-8000-000000000010'): Record<string, unknown> {
  return { organizationId, terminalGroupId, order: { id: orderId, externalNumber: `VPZH-${orderId.slice(-4)}`, sourceKey: `vpzh-${orderId}`, phone: '+79991234567', orderTypeId, orderServiceType: 'DeliveryByClient', customer: { type: 'regular', name: 'Demo customer' }, items: [{ type: 'Product', productId, amount: 1, price: 490, modifiers: [{ productId: modifierId, amount: 1, price: 120 }] }], payments: [{ paymentTypeKind: 'External', sum: 610, paymentTypeId, isProcessedExternally: true }] } };
}
