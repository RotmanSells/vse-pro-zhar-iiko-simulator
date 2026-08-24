import { describe, expect, it } from 'vitest';
import { deterministicUuid, IdFactory } from '../../src/shared/ids/ids.js';

describe('deterministic IDs', () => {
  it('returns stable valid UUIDs', () => {
    expect(deterministicUuid('product', 'one')).toBe(deterministicUuid('product', 'one'));
    expect(deterministicUuid('product', 'one')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('resets deterministic sequences', () => {
    const ids = new IdFactory(true);
    const first = ids.next('test');
    ids.reset();
    expect(ids.next('test')).toBe(first);
  });
});
