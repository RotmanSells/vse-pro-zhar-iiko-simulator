import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type JsonObject = Record<string, unknown>;

export function buildSimulatorOpenApi(): JsonObject {
  const upstream = JSON.parse(readFileSync(resolve(process.cwd(), 'contracts/upstream/iiko-openapi.json'), 'utf8')) as JsonObject;
  const paths = upstream.paths as Record<string, JsonObject>;
  const implemented = ['/api/1/access_token', '/api/v2/access_token', '/api/1/organizations', '/api/1/terminal_groups', '/api/1/terminal_groups/is_alive', '/api/1/stop_lists', '/api/1/deliveries/order_types', '/api/1/payment_types', '/api/1/deliveries/create', '/api/1/deliveries/by_id', '/api/1/commands/status', '/api/1/nomenclature', '/api/2/menu', '/api/2/menu/by_id'];
  const subset: Record<string, JsonObject> = {};
  for (const path of implemented) {
    if (!paths[path]) continue;
    subset[path] = JSON.parse(JSON.stringify(paths[path])) as JsonObject;
    for (const operation of Object.values(subset[path] ?? {})) {
      if (typeof operation === 'object' && operation !== null) (operation as JsonObject).tags = ['iiko-compatible'];
    }
  }
  subset['/__simulator/health'] = { get: { tags: ['simulator-control'], responses: { '200': { description: 'Simulator health' } } } };
  subset['/__simulator/openapi.json'] = { get: { tags: ['simulator-control'], responses: { '200': { description: 'This compatibility subset' } } } };
  for (const path of ['/__simulator/control/reset', '/__simulator/control/scenario', '/__simulator/control/stop-list', '/__simulator/control/order-status', '/__simulator/control/fault', '/__simulator/control/clear-faults']) {
    subset[path] = { post: { tags: ['simulator-control'], requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { '200': { description: 'Control operation' } } } };
  }
  return { openapi: upstream.openapi, info: { title: 'Vse Pro Zhar iikoCloud contract simulator', version: '0.1.0', description: 'Implemented iiko-compatible subset copied from the pinned upstream OpenAPI document plus simulator-only control endpoints.' }, servers: [{ url: 'http://127.0.0.1:4010' }], tags: [{ name: 'iiko-compatible' }, { name: 'simulator-control' }], paths: subset, components: upstream.components };
}
