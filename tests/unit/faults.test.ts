import { describe, expect, it } from 'vitest';
import { effectiveFaultDelay, FaultEngine } from '../../src/simulator/faults/faults.js';

describe('fault engine', () => {
  it('supports one-shot and persistent faults', () => {
    const engine = new FaultEngine();
    engine.set({ endpoint: '/api/1/stop_lists', mode: 'timeout', remaining: 1 });
    expect(engine.consume('/api/1/stop_lists')?.mode).toBe('timeout');
    expect(engine.consume('/api/1/stop_lists')).toBeNull();
    engine.set({ endpoint: '/api/1/stop_lists', mode: 'slow-response', remaining: null });
    expect(engine.consume('/api/1/stop_lists')?.mode).toBe('slow-response');
    expect(engine.consume('/api/1/stop_lists')?.mode).toBe('slow-response');
  });

  it('keeps timeout delay configurable and bounded separately from HTTP status faults', () => {
    expect(effectiveFaultDelay({ endpoint: '/api/1/stop_lists', mode: 'timeout', remaining: 1 })).toBe(1000);
    expect(effectiveFaultDelay({ endpoint: '/api/1/stop_lists', mode: 'timeout', delayMs: 200, remaining: 1 })).toBe(200);
    expect(effectiveFaultDelay({ endpoint: '/api/1/stop_lists', mode: 'status', status: 408, remaining: 1 })).toBe(0);
  });
});
