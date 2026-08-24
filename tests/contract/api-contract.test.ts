import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, closeServer, getToken, organizationId, startTestApp, terminalGroupId } from '../helpers.js';

describe('iiko-compatible contract boundary', () => {
  let base = '';
  let token = '';
  let close: () => Promise<void>;
  beforeAll(async () => { const started = await startTestApp(); base = started.base; close = started.close; token = await getToken(base); });
  afterAll(async () => { await close(); });

  it('supports current and legacy auth contracts', async () => {
    const legacy = await api(base, '/api/1/access_token', { apiLogin: 'vpzh-test-api-login' });
    expect(legacy.status).toBe(200);
    expect(legacy.body).toMatchObject({ correlationId: expect.any(String), token: expect.any(String) });
  });

  it('rejects missing and malformed authorization', async () => {
    expect((await api(base, '/api/1/organizations', {})).status).toBe(401);
    const invalid = await api(base, '/api/1/organizations', {}, 'not-issued');
    expect(invalid.status).toBe(401);
  });

  it('validates organizations, terminals and stop lists against the pinned schema', async () => {
    expect((await api(base, '/api/1/organizations', {}, token)).status).toBe(200);
    expect((await api(base, '/api/1/terminal_groups', { organizationIds: [organizationId] }, token)).status).toBe(200);
    const stopLists = await api(base, '/api/1/stop_lists', { organizationIds: [organizationId], terminalGroupsIds: [terminalGroupId] }, token);
    expect(stopLists.status).toBe(200);
    expect(stopLists.body).toMatchObject({ terminalGroupStopLists: [{ items: [{ terminalGroupId }] }] });
  });

  it('rejects unknown request properties at a strict upstream boundary', async () => {
    const response = await api(base, '/api/1/organizations', { unknownField: true }, token);
    expect(response.status).toBe(400);
  });

  it('exposes menu completeness endpoints without making them product truth', async () => {
    expect((await api(base, '/api/1/nomenclature', { organizationId, startRevision: 0 }, token)).status).toBe(200);
    expect((await api(base, '/api/2/menu', {}, token)).status).toBe(200);
    expect((await api(base, '/api/2/menu/by_id', { externalMenuId: 'vpzh-simulator-external-menu', organizationIds: [organizationId], version: 2 }, token)).status).toBe(200);
  });
});
