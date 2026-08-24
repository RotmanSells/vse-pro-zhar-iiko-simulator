import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UpstreamValidator } from '../../src/shared/validation/upstream.js';

const fixtures: Array<{ directory: string; path: string; errorStatus?: string; noRequestSchema?: boolean }> = [
  { directory: 'api-2-access-token', path: '/api/v2/access_token' },
  { directory: 'api-1-access-token', path: '/api/1/access_token' },
  { directory: 'api-1-organizations', path: '/api/1/organizations' },
  { directory: 'api-1-terminal-groups', path: '/api/1/terminal_groups' },
  { directory: 'api-1-terminal-groups-is-alive', path: '/api/1/terminal_groups/is_alive' },
  { directory: 'api-1-stop-lists', path: '/api/1/stop_lists' },
  { directory: 'api-1-order-types', path: '/api/1/deliveries/order_types' },
  { directory: 'api-1-payment-types', path: '/api/1/payment_types' },
  { directory: 'api-1-nomenclature', path: '/api/1/nomenclature' },
  { directory: 'api-2-menu', path: '/api/2/menu', noRequestSchema: true },
  { directory: 'api-2-menu-by-id', path: '/api/2/menu/by_id' },
  { directory: 'api-1-deliveries-create', path: '/api/1/deliveries/create' },
  { directory: 'api-1-deliveries-by-id', path: '/api/1/deliveries/by_id' },
  { directory: 'api-1-commands-status', path: '/api/1/commands/status' }
];

function read(directory: string, filename: string): unknown {
  return JSON.parse(readFileSync(`contracts/examples/${directory}/${filename}`, 'utf8')) as unknown;
}

describe('committed JSON fixtures', () => {
  it.each(fixtures)('$directory follows the pinned upstream schemas', ({ directory, path, errorStatus, noRequestSchema }) => {
    const validator = new UpstreamValidator();
    if (!noRequestSchema) expect(() => validator.request(path, read(directory, 'request.valid.json'))).not.toThrow();
    expect(() => validator.response(path, read(directory, 'response.success.json'))).not.toThrow();
    expect(() => validator.responseErrors(path, read(directory, 'response.error.json'), Number(errorStatus ?? '400'))).not.toThrow();
  });
});
