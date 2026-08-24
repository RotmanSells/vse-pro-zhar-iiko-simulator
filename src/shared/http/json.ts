import type { IncomingMessage, ServerResponse } from 'node:http';
import { SimulatorHttpError } from '../errors/errors.js';

const MAX_BODY_BYTES = 256 * 1024;

export async function readJson(request: IncomingMessage): Promise<unknown> {
  let total = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      throw new SimulatorHttpError(413, 'Request body is too large', 'Common');
    }
    chunks.push(buffer);
  }
  if (total === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new SimulatorHttpError(400, 'Invalid JSON', 'Common');
  }
}

export function sendJson(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const serialized = JSON.stringify(body);
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  response.end(serialized);
}

export function sendEmpty(response: ServerResponse, status: number): void {
  response.writeHead(status);
  response.end();
}
