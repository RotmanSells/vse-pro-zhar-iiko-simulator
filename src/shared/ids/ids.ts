import { createHash, randomUUID } from 'node:crypto';

export function deterministicUuid(namespace: string, value: string): string {
  const digest = createHash('sha256').update(`${namespace}:${value}`).digest('hex');
  const bytes = digest.slice(0, 32).split('');
  bytes[12] = '5';
  const variant = Number.parseInt(bytes[16] ?? '8', 16);
  bytes[16] = ((variant & 0x3) | 0x8).toString(16);
  return `${bytes.slice(0, 8).join('')}-${bytes.slice(8, 12).join('')}-${bytes.slice(12, 16).join('')}-${bytes.slice(16, 20).join('')}-${bytes.slice(20, 32).join('')}`;
}

export class IdFactory {
  private sequence = 0;

  public constructor(private readonly deterministic: boolean) {}

  next(namespace: string): string {
    this.sequence += 1;
    return this.deterministic ? deterministicUuid(namespace, String(this.sequence)) : randomUUID();
  }

  reset(): void {
    this.sequence = 0;
  }
}
