export interface Clock {
  now(): string;
}

export interface IdSource {
  nextId(prefix: string): string;
}

export class DeterministicRuntime implements Clock, IdSource {
  private readonly counters = new Map<string, number>();
  private readonly fixedNow: string;

  constructor(fixedNow: string) {
    this.fixedNow = fixedNow;
  }

  now(): string {
    return this.fixedNow;
  }

  nextId(prefix: string): string {
    const next = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, next);
    return `${prefix}-${String(next).padStart(4, '0')}`;
  }
}
