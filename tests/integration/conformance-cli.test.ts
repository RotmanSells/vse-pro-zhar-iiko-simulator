import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { organizationId, startTestApp } from '../helpers.js';

const captureDirectory = resolve(process.cwd(), 'conformance/captures/9999-synthetic-test');
const cardinalityCapturePath = resolve(captureDirectory, 'organizations-cardinality.json');
const mappingPath = resolve(process.cwd(), 'conformance/mapping.local.json');
const realOrganizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const execFileAsync = promisify(execFile);

const capture = {
  endpoint: '/api/1/organizations',
  request: { organizationIds: [realOrganizationId] },
  response: { status: 200, body: { correlationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', organizations: [{ responseType: 'Simple', id: realOrganizationId, name: '[REDACTED]', code: 'REAL-CODE' }] } }
};
const emptyMapping = { version: 1, organizationIds: {}, terminalGroupIds: {}, orderTypeIds: {}, paymentTypeIds: {}, productIds: {}, modifierIds: {} };
const mapped = { ...emptyMapping, organizationIds: { [realOrganizationId]: organizationId } };
const cardinalityCapture = { endpoint: '/api/1/organizations', request: { organizationIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] }, response: { status: 200, body: { correlationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', organizations: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'].map((id, index) => ({ responseType: 'Simple', id, name: `[REDACTED-${index}]`, code: 'REAL-CODE' })) } } };

async function runCompare(base: string): Promise<{ status: string; comparisons: Array<{ status: string }> }> {
  try {
    const result = await execFileAsync(process.execPath, ['--import', 'tsx/esm', 'scripts/conformance.ts', 'compare'], { cwd: process.cwd(), env: { ...process.env, IIKO_CONFORMANCE_ENABLED: 'true', IIKO_REAL_BASE_URL: 'http://127.0.0.1:9', IIKO_BASE_URL: base, IIKO_CONFORMANCE_MAPPING: mappingPath }, encoding: 'utf8' });
    return JSON.parse(result.stdout.trim()) as { status: string; comparisons: Array<{ status: string }> };
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error && typeof error.stderr === 'string' ? error.stderr : '';
    throw new Error(`${error instanceof Error ? error.message : 'conformance command failed'} ${stderr}`);
  }
}

describe('conformance CLI mapping regression', () => {
  let base = '';
  let close: () => Promise<void>;
  beforeAll(async () => {
    const started = await startTestApp();
    base = started.base;
    close = started.close;
    await mkdir(captureDirectory, { recursive: true });
    await writeFile(resolve(captureDirectory, 'organizations.json'), `${JSON.stringify(capture, null, 2)}\n`);
  });
  afterAll(async () => { await close(); await rm(captureDirectory, { recursive: true, force: true }); await rm(mappingPath, { force: true }); });

  it('reports PASS after remapping the synthetic real organization ID', async () => {
    await writeFile(mappingPath, `${JSON.stringify(mapped, null, 2)}\n`);
    const report = await runCompare(base);
    expect(report.status).toBe('PASS');
    expect(report.comparisons[0]?.status).toBe('PASS');
  });

  it('does not report DRIFT when a real collection has more same-shape entities', async () => {
    await writeFile(cardinalityCapturePath, `${JSON.stringify(cardinalityCapture, null, 2)}\n`);
    await writeFile(mappingPath, `${JSON.stringify({ ...emptyMapping, organizationIds: { 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa': organizationId, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd': organizationId, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee': organizationId } }, null, 2)}\n`);
    const report = await runCompare(base);
    expect(report.status).toBe('PASS');
    expect(report.comparisons.every((comparison) => comparison.status === 'PASS')).toBe(true);
    await rm(cardinalityCapturePath, { force: true });
  });

  it('reports MAPPING_REQUIRED without calling the simulator with a real ID', async () => {
    await writeFile(mappingPath, `${JSON.stringify(emptyMapping, null, 2)}\n`);
    const report = await runCompare(base);
    expect(report.status).toBe('MAPPING_REQUIRED');
    expect(report.comparisons[0]?.status).toBe('MAPPING_REQUIRED');
  });

  it('reports DRIFT for an incorrect simulator target', async () => {
    await writeFile(mappingPath, `${JSON.stringify({ ...emptyMapping, organizationIds: { [realOrganizationId]: 'wrong-org' } }, null, 2)}\n`);
    const report = await runCompare(base);
    expect(report.status).toBe('DRIFT');
    expect(report.comparisons[0]?.status).toBe('DRIFT');
  });

  it('fails explicitly for malformed mapping JSON and schema', async () => {
    await rm(mappingPath, { force: true });
    const missingFileReport = await runCompare(base);
    expect(missingFileReport.status).toBe('MAPPING_REQUIRED');
    await writeFile(mappingPath, '{ broken');
    await expect(runCompare(base)).rejects.toThrow(/Invalid mapping JSON/);
    await writeFile(mappingPath, '{}');
    await expect(runCompare(base)).rejects.toThrow(/Invalid mapping schema/);
  });
});
