export interface Clock {
  now(): Date;
  nowMs(): number;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  nowMs(): number {
    return Date.now();
  }
}

export class FixedClock implements Clock {
  public constructor(private currentMs: number) {}

  now(): Date {
    return new Date(this.currentMs);
  }

  nowMs(): number {
    return this.currentMs;
  }

  advance(ms: number): void {
    this.currentMs += ms;
  }
}
