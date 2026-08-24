import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../src/shared/clock/clock.js';
import { loadDataset } from '../../src/simulator/dataset/loader.js';
import { SimulatorState, type SimOrder } from '../../src/simulator/state/state.js';

describe('order state machine', () => {
  it('allows the pickup lifecycle and rejects skipped transitions', () => {
    const state = new SimulatorState(loadDataset(), new FixedClock(Date.parse('2026-08-24T00:00:00Z')), true);
    const order: SimOrder = { id: '90000000-0000-4000-8000-000000000010', externalNumber: null, sourceKey: null, organizationId: '3e41b6b4-9f43-4f65-8e5d-0c1c4c2f9a10', terminalGroupId: '4c6d5f37-bda2-4ed1-b48e-1b4fa7028f21', orderTypeId: '5c4d5e86-5f6c-46ae-8dd7-8e27b4ab1f31', phone: '+79991234567', customerName: 'Demo', items: [], sum: 0, paymentTypeId: null, paymentKind: null, createdAt: '2026-08-24 03:00:00.000', timestamp: Date.parse('2026-08-24T00:00:00Z'), status: 'Unconfirmed', creationStatus: 'Success', history: [] };
    state.orders.set(order.id, order);
    expect(state.transitionOrder(order.id, 'accepted').status).toBe('WaitCooking');
    expect(state.transitionOrder(order.id, 'cooking').status).toBe('CookingStarted');
    expect(state.transitionOrder(order.id, 'ready').status).toBe('CookingCompleted');
    expect(state.transitionOrder(order.id, 'completed').status).toBe('Closed');
    expect(() => state.transitionOrder(order.id, 'cancelled')).toThrow('Invalid order transition');
  });
});
