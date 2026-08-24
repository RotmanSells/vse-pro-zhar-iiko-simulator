import { describe, expect, it } from 'vitest';
import { FaultEngine } from '../../src/simulator/faults/faults.js';

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
});
