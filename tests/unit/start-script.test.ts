import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('compiled start command', () => {
  it('points at the actual tsconfig.build output', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: { start: string } };
    expect(packageJson.scripts.start).toBe('node dist/src/app/server.js');
  });
});
