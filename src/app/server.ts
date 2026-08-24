import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig, type Config } from './config.js';
import { SystemClock, type Clock } from '../shared/clock/clock.js';
import { readJson, sendJson } from '../shared/http/json.js';
import { SimulatorHttpError, errorBody } from '../shared/errors/errors.js';
import { UpstreamValidator } from '../shared/validation/upstream.js';
import { loadDataset } from '../simulator/dataset/loader.js';
import { SimulatorState } from '../simulator/state/state.js';
import { AuthService } from '../features/auth/auth-service.js';
import { DictionaryService } from '../features/dictionaries/dictionary-service.js';
import { OrderService } from '../features/orders/order-service.js';
import { CommandService } from '../features/commands/command-service.js';
import { ControlService } from '../features/control/control-service.js';
import { buildSimulatorOpenApi } from '../features/control/openapi.js';
import type { FaultAction } from '../simulator/faults/faults.js';

export interface SimulatorApp {
  server: Server;
  state: SimulatorState;
  config: Config;
}

export function createApp(config: Config = loadConfig(), clock: Clock = new SystemClock()): SimulatorApp {
  const state = new SimulatorState(loadDataset(), clock, config.deterministicIds);
  const validator = new UpstreamValidator();
  const auth = new AuthService(state, config, validator);
  const dictionaries = new DictionaryService(state, validator);
  const orders = new OrderService(state, validator);
  const commands = new CommandService(state, validator);
  const control = new ControlService(state);
  const server = createHttpServer((request, response) => {
    void handleRequest(request, response).catch((error: unknown) => handleError(error, request, response));
  });

  async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const started = performance.now();
    const requestId = request.headers['x-request-id'] ?? state.ids.next('request');
    const url = new URL(request.url ?? '/', `http://${config.host}:${config.port}`);
    const method = request.method ?? 'GET';
    let status = 200;
    let correlationId: unknown = null;
    let errorMessage: string | null = null;
    try {
      if (url.pathname === '/__simulator/health' && method === 'GET') {
        sendJson(response, 200, { status: 'ok', service: 'vse-pro-zhar-iiko-simulator', scenario: state.currentScenario, upstreamSchema: 'contracts/upstream/iiko-openapi.json' });
        return;
      }
      if (url.pathname === '/__simulator/ui' || url.pathname === '/__simulator/ui/' || url.pathname === '/__simulator/ui/app.css' || url.pathname === '/__simulator/ui/app.js') {
        serveUi(url.pathname, response);
        return;
      }
      if (url.pathname === '/__simulator/openapi.json' && method === 'GET') {
        sendJson(response, 200, buildSimulatorOpenApi());
        return;
      }
      if (url.pathname.startsWith('/__simulator/control/')) {
        assertControlToken(request, config);
        const result = await handleControl(url.pathname, method, request, response);
        if (result !== null) sendJson(response, 200, result);
        return;
      }
      if (!url.pathname.startsWith('/api/')) {
        sendJson(response, 404, { error: 'not_found' });
        return;
      }
      const fault = state.faults.consume(url.pathname);
      const faultStatus = await applyFault(fault, response, url.pathname, validator);
      if (faultStatus !== null) { status = faultStatus; return; }
      if (config.rateLimit.enabled && state.isRateLimited(config.rateLimit.requests, config.rateLimit.windowMs)) {
        const body = errorBody(state.ids.next('correlation'), 'Rate limit exceeded', 'Common');
        sendJson(response, 429, body);
        return;
      }
      if (url.pathname !== '/api/1/access_token' && url.pathname !== '/api/v2/access_token') auth.requireAuth(request.headers);
      const body = await readJson(request);
      const result = await dispatchApi(url.pathname, method, body);
      const drifted = applySchemaDrift(result, fault);
      correlationId = typeof drifted === 'object' && drifted !== null && 'correlationId' in drifted ? drifted.correlationId : null;
      sendJson(response, 200, drifted);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Unknown error';
      status = error instanceof SimulatorHttpError ? error.status : 500;
      const body = error instanceof SimulatorHttpError ? errorBody(state.ids.next('correlation'), error.message, error.code) : errorBody(state.ids.next('correlation'), 'Internal simulator error', 'InternalServerError');
      if (url.pathname.startsWith('/api/')) {
        if ([400, 401, 408, 410, 500].includes(status)) validator.responseErrors(url.pathname, body, status);
        sendJson(response, status, body);
      } else {
        sendJson(response, status, { error: error instanceof Error ? error.message : 'Control error' });
      }
    } finally {
      console.log(JSON.stringify({ timestamp: new Date().toISOString(), method, path: url.pathname, scenario: state.currentScenario, status, correlationId, error: errorMessage, latencyMs: Math.round((performance.now() - started) * 100) / 100, requestId }));
    }
  }

  async function dispatchApi(path: string, method: string, body: unknown): Promise<Record<string, unknown>> {
    if (path === '/api/1/access_token' && method === 'POST') return auth.accessToken('legacy', body);
    if (path === '/api/v2/access_token' && method === 'POST') return auth.accessToken('current', body);
    if (path === '/api/1/organizations' && method === 'GET') return dictionaries.simpleOrganizations();
    if (path === '/api/1/organizations' && method === 'POST') return dictionaries.organizations(body);
    if (path === '/api/1/terminal_groups' && method === 'POST') return dictionaries.terminalGroups(body);
    if (path === '/api/1/terminal_groups/is_alive' && method === 'POST') return dictionaries.terminalGroupsAlive(body);
    if (path === '/api/1/stop_lists' && method === 'POST') return dictionaries.stopLists(body);
    if (path === '/api/1/deliveries/order_types' && method === 'POST') return dictionaries.orderTypes(body);
    if (path === '/api/1/payment_types' && method === 'POST') return dictionaries.paymentTypes(body);
    if (path === '/api/1/deliveries/create' && method === 'POST') return orders.create(body);
    if (path === '/api/1/deliveries/by_id' && method === 'POST') return orders.byId(body);
    if (path === '/api/1/commands/status' && method === 'POST') return commands.status(body);
    if (path === '/api/1/nomenclature' && method === 'POST') return dictionaries.nomenclature(body);
    if (path === '/api/2/menu' && method === 'POST') return dictionaries.menus();
    if (path === '/api/2/menu/by_id' && method === 'POST') return dictionaries.menuById(body);
    throw new SimulatorHttpError(404, 'Endpoint is not implemented', 'Common');
  }

  async function handleControl(path: string, method: string, request: IncomingMessage, response: ServerResponse): Promise<Record<string, unknown> | null> {
    if (method === 'GET' && path === '/__simulator/control/status') return control.status();
    if (method !== 'POST') throw new SimulatorHttpError(405, 'Method not allowed', 'Common');
    const body = await readJson(request);
    if (path === '/__simulator/control/reset') return control.reset();
    if (path === '/__simulator/control/scenario') return control.scenario(body);
    if (path === '/__simulator/control/stop-list') return control.stop(body);
    if (path === '/__simulator/control/unstop-list') return control.unstop(body);
    if (path === '/__simulator/control/order-status') return control.orderStatus(body);
    if (path === '/__simulator/control/fault') return state.faults.set(body);
    if (path === '/__simulator/control/clear-faults') { state.faults.clear(); return { cleared: true }; }
    void response;
    throw new SimulatorHttpError(404, 'Control endpoint is not implemented', 'Common');
  }

  return { server, state, config };
}

function assertControlToken(request: IncomingMessage, config: Config): void {
  if (config.controlToken && request.headers['x-simulator-control-token'] !== config.controlToken) throw new SimulatorHttpError(401, 'Simulator control token required', null);
}

async function applyFault(fault: FaultAction | null, response: ServerResponse, path: string, validator: UpstreamValidator): Promise<number | null> {
  if (!fault) return null;
  if (fault.delayMs) await new Promise<void>((resolve) => setTimeout(resolve, fault.delayMs));
  if (fault.mode === 'connection-drop') { response.destroy(); return 0; }
  if (fault.mode === 'malformed-json') { response.writeHead(200, { 'content-type': 'application/json' }); response.end('{ malformed'); return 200; }
  if (fault.mode === 'timeout') { const body = errorBody('00000000-0000-4000-8000-000000000408', `Simulated timeout for ${path}`, 'Common'); validator.responseErrors(path, body, 408); sendJson(response, 408, body); return 408; }
  if (fault.mode === 'status') { const status = fault.status ?? 500; const body = errorBody('00000000-0000-4000-8000-000000000500', `Simulated ${status}`, 'Common'); if ([500].includes(status)) validator.responseErrors(path, body, status); sendJson(response, status, body); return status; }
  return null;
}

function applySchemaDrift(payload: Record<string, unknown>, fault: FaultAction | null): Record<string, unknown> {
  if (fault?.mode === 'schema-drift-extra-field') return { ...payload, simulatorDriftExtraField: true };
  if (fault?.mode === 'schema-drift-missing-required-field') {
    const copy = { ...payload };
    delete copy.correlationId;
    return copy;
  }
  return payload;
}

function serveUi(pathname: string, response: ServerResponse): void {
  const asset = pathname.endsWith('app.css') ? { file: 'app.css', contentType: 'text/css; charset=utf-8' } : pathname.endsWith('app.js') ? { file: 'app.js', contentType: 'application/javascript; charset=utf-8' } : { file: 'index.html', contentType: 'text/html; charset=utf-8' };
  try {
    const body = readFileSync(resolve(process.cwd(), 'public', asset.file));
    response.writeHead(200, { 'content-type': asset.contentType, 'cache-control': 'no-store' });
    response.end(body);
  } catch {
    sendJson(response, 404, { error: 'ui_asset_not_found' });
  }
}

function handleError(error: unknown, request: IncomingMessage, response: ServerResponse): void {
  const status = error instanceof SimulatorHttpError ? error.status : 500;
  const body = { error: error instanceof Error ? error.message : 'Unhandled server error', path: request.url ?? '/' };
  if (!response.headersSent) sendJson(response, status, body);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = createApp();
  app.server.listen(app.config.port, app.config.host, () => console.log(JSON.stringify({ service: 'vse-pro-zhar-iiko-simulator', host: app.config.host, port: app.config.port })));
}
