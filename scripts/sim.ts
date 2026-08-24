const base = process.env.IIKO_BASE_URL ?? 'http://127.0.0.1:4010';
const controlToken = process.env.SIMULATOR_CONTROL_TOKEN;
const args = process.argv.slice(2);
const command = args[0] ?? 'status';

async function call(path: string, method: 'GET' | 'POST', body?: unknown): Promise<void> {
  const init: RequestInit = { method, headers: { 'content-type': 'application/json', ...(controlToken ? { 'x-simulator-control-token': controlToken } : {}) } };
  if (method === 'POST') init.body = JSON.stringify(body ?? {});
  const response = await fetch(`${base}${path}`, init);
  const text = await response.text();
  console.log(text);
  if (!response.ok) process.exitCode = 1;
}

if (command === 'status') await call('/__simulator/control/status', 'GET');
else if (command === 'reset') await call('/__simulator/control/reset', 'POST');
else if (command === 'scenario') await call('/__simulator/control/scenario', 'POST', { name: args[1] ?? 'happy' });
else if (command === 'stop' && args[1] === 'product') await call('/__simulator/control/stop-list', 'POST', { productId: args[2], balance: 0 });
else if (command === 'unstop' && args[1] === 'product') await call('/__simulator/control/unstop-list', 'POST', { productId: args[2] });
else if (command === 'order') await call('/__simulator/control/order-status', 'POST', { orderId: args[1], status: args[2] });
else if (command === 'fault') await call('/__simulator/control/fault', 'POST', { endpoint: args[1], mode: args[2], delayMs: Number(args[3] ?? 0), remaining: 1 });
else if (command === 'clear-faults') await call('/__simulator/control/clear-faults', 'POST');
else { console.error('Usage: sim status|reset|scenario <name>|stop product <uuid>|unstop product <uuid>|order <id> <status>|fault <path> <mode> [delayMs]|clear-faults'); process.exitCode = 2; }
