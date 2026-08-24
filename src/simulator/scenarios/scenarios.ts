import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const ScenarioDefinition = z.object({
  description: z.string(), terminalAlive: z.boolean(), organizationEnabled: z.boolean(), orderCreationStatus: z.enum(['Success', 'InProgress', 'Error']),
  stopProductId: z.string().uuid().optional(), stopAllProducts: z.boolean().optional()
});
export type ScenarioDefinition = z.infer<typeof ScenarioDefinition>;

export function loadScenarios(): Record<string, ScenarioDefinition> {
  const raw = JSON.parse(readFileSync(resolve(process.cwd(), 'datasets/vse-pro-zhar/scenarios.json'), 'utf8')) as unknown;
  return z.record(ScenarioDefinition).parse(raw);
}
