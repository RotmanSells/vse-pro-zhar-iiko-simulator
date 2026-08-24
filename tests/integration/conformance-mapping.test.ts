import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, getToken, organizationId, startTestApp } from '../helpers.js';
import { IdentifierMappingSchema, missingMappings, remapRequestIdentifiers } from '../../src/conformance/mapping.js';

describe('synthetic real-id conformance mapping', () => {
  let base = '';
  let token = '';
  let close: () => Promise<void>;
  beforeAll(async () => { const started = await startTestApp(); base = started.base; close = started.close; token = await getToken(base); });
  afterAll(async () => { await close(); });

  it('maps real organizationId to the simulator organization before the request', async () => {
    const mapping = IdentifierMappingSchema.parse({ version: 1, organizationIds: { 'real-org-A': organizationId }, terminalGroupIds: {}, orderTypeIds: {}, paymentTypeIds: {}, productIds: {}, modifierIds: {} });
    const captureRequest = { organizationIds: ['real-org-A'] };
    const remapped = remapRequestIdentifiers(captureRequest, mapping);
    expect(remapped.value).toEqual({ organizationIds: [organizationId] });
    const result = await api(base, '/api/1/organizations', remapped.value, token);
    expect(result.status).toBe(200);
  });

  it('returns MAPPING_REQUIRED semantics before a simulator call when mapping is absent', () => {
    const request = { organizationIds: ['real-org-A'] };
    const missing = missingMappings([{ role: 'organizationIds', value: 'real-org-A', path: '/organizationIds/0' }], IdentifierMappingSchema.parse({ version: 1, organizationIds: {}, terminalGroupIds: {}, orderTypeIds: {}, paymentTypeIds: {}, productIds: {}, modifierIds: {} }));
    expect(missing).toHaveLength(1);
    expect(remapRequestIdentifiers(request, IdentifierMappingSchema.parse({ version: 1, organizationIds: {}, terminalGroupIds: {}, orderTypeIds: {}, paymentTypeIds: {}, productIds: {}, modifierIds: {} })).value).toEqual(request);
  });

  it('makes an incorrect mapping observable as simulator drift, not a false pass', async () => {
    const wrongRequest = { organizationIds: ['wrong-org'] };
    const result = await api(base, '/api/1/terminal_groups', wrongRequest, token);
    expect(result.status).toBe(400);
  });
});
