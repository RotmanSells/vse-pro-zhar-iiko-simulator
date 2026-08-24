import { z } from 'zod';

export const FaultMode = z.enum(['timeout', 'slow-response', 'connection-drop', 'status', 'malformed-json', 'schema-drift-extra-field', 'schema-drift-missing-required-field']);
export const FaultSchema = z.object({
  endpoint: z.string().min(1),
  mode: FaultMode,
  status: z.number().int().min(400).max(599).optional(),
  delayMs: z.number().int().min(0).max(120_000).optional(),
  remaining: z.number().int().positive().nullable().default(1)
});
export type Fault = z.infer<typeof FaultSchema>;

export type FaultAction = Fault & { applied: true };

export function effectiveFaultDelay(fault: Fault): number {
  return fault.delayMs ?? (fault.mode === 'timeout' ? 1_000 : 0);
}

export class FaultEngine {
  private faults = new Map<string, Fault>();

  set(input: unknown): Fault {
    const fault = FaultSchema.parse(input);
    this.faults.set(fault.endpoint, fault);
    return fault;
  }

  clear(): void {
    this.faults.clear();
  }

  consume(endpoint: string): FaultAction | null {
    const fault = this.faults.get(endpoint);
    if (!fault) return null;
    if (fault.remaining !== null) {
      if (fault.remaining <= 1) this.faults.delete(endpoint);
      else this.faults.set(endpoint, { ...fault, remaining: fault.remaining - 1 });
    }
    return { ...fault, applied: true };
  }

  list(): Fault[] {
    return [...this.faults.values()];
  }
}
