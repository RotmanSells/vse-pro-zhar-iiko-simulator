import { describe, expect, it } from 'vitest';
import { IdentifierMappingSchema, collectIdentifiers, mappingTargetsAreAllowed, missingMappings, normalizeForCompare, remapRequestIdentifiers } from '../../src/conformance/mapping.js';

const mapping = IdentifierMappingSchema.parse({
  version: 1,
  organizationIds: { 'real-org-A': { simulatorId: 'sim-org-B', label: 'main-restaurant' } },
  terminalGroupIds: { 'real-terminal-A': 'sim-terminal-B' },
  orderTypeIds: {}, paymentTypeIds: {}, productIds: {}, modifierIds: {}
});

describe('conformance identifier mapping', () => {
  it('remaps known request fields and reports missing roles', () => {
    const request = { organizationIds: ['real-org-A'], terminalGroupId: 'real-terminal-A' };
    const remapped = remapRequestIdentifiers(request, mapping);
    expect(remapped.value).toEqual({ organizationIds: ['sim-org-B'], terminalGroupId: 'sim-terminal-B' });
    expect(remapped.missing).toEqual([]);
    expect(missingMappings(collectIdentifiers('/api/1/terminal_groups', request), mapping)).toEqual([]);
    expect(missingMappings(collectIdentifiers('/api/1/terminal_groups', { organizationIds: ['real-org-A'], terminalGroupIds: ['real-terminal-missing'] }), mapping)).toHaveLength(1);
  });

  it('normalizes dynamic IDs without deleting fields', () => {
    const real = { correlationId: 'real-correlation', organizations: [{ id: 'real-org-A' }], timestamp: 100 };
    const simulator = { correlationId: 'sim-correlation', organizations: [{ id: 'sim-org-B' }], timestamp: 200 };
    expect(normalizeForCompare(real, mapping)).toEqual({ correlationId: '<CORRELATION_ID>', organizations: [{ id: '<ORGANIZATION_ID:main-restaurant>' }], timestamp: '<TIMESTAMP>' });
    expect(normalizeForCompare(real, mapping)).toEqual(normalizeForCompare(simulator, mapping));
  });

  it('rejects a mapping target outside the simulator identifier inventory', () => {
    expect(mappingTargetsAreAllowed(mapping, { organizationIds: new Set(['sim-org-B']), terminalGroupIds: new Set(['sim-terminal-B']), orderTypeIds: new Set(), paymentTypeIds: new Set(), productIds: new Set(), modifierIds: new Set() })).toBe(true);
    expect(mappingTargetsAreAllowed({ ...mapping, organizationIds: { 'real-org-A': 'wrong-org' } }, { organizationIds: new Set(['sim-org-B']), terminalGroupIds: new Set(['sim-terminal-B']), orderTypeIds: new Set(), paymentTypeIds: new Set(), productIds: new Set(), modifierIds: new Set() })).toBe(false);
  });
});
