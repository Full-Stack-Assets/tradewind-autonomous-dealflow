import { randomUUID } from 'node:crypto';
import type { Clock, IdSource } from '../../domain/src/clock.ts';

export class SystemRuntime implements Clock, IdSource {
  now(): string {
    return new Date().toISOString();
  }

  nextId(prefix: string): string {
    const normalized = prefix.trim();
    if (normalized.length === 0) throw new Error('ID prefix is required');
    return `${normalized}-${randomUUID()}`;
  }
}
