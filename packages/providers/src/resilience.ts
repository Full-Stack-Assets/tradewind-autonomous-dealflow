import { ProviderFailure } from './contracts.ts';

export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier?: number;
  shouldRetry?: (error: unknown) => boolean;
  sleep?: (milliseconds: number) => Promise<void>;
}

function defaultShouldRetry(error: unknown): boolean {
  return error instanceof ProviderFailure ? error.retryable : true;
}

async function defaultSleep(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export async function withRetry<T>(operation: () => Promise<T>, policy: RetryPolicy): Promise<T> {
  const attempts = Math.max(1, policy.maxAttempts);
  const shouldRetry = policy.shouldRetry ?? defaultShouldRetry;
  const sleep = policy.sleep ?? defaultSleep;
  let delay = Math.max(0, policy.initialDelayMs);
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !shouldRetry(error)) throw error;
      await sleep(Math.min(Math.max(0, policy.maxDelayMs), delay));
      delay = Math.max(0, delay * (policy.multiplier ?? 2));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Retry operation failed');
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetAfterMs: number;
  now?: () => number;
}

export interface CircuitBreakerSnapshot {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt?: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt: number | undefined;
  private probeInFlight = false;
  private readonly failureThreshold: number;
  private readonly resetAfterMs: number;
  private readonly now: () => number;

  constructor(options: CircuitBreakerOptions) {
    this.failureThreshold = Math.max(1, options.failureThreshold);
    this.resetAfterMs = Math.max(0, options.resetAfterMs);
    this.now = options.now ?? Date.now;
  }

  snapshot(): CircuitBreakerSnapshot {
    return {
      state: this.currentState(),
      consecutiveFailures: this.consecutiveFailures,
      ...(this.openedAt === undefined ? {} : { openedAt: this.openedAt }),
    };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const state = this.currentState();
    if (state === 'open') throw new Error('Circuit is open');
    if (state === 'half-open') {
      if (this.probeInFlight) throw new Error('Circuit half-open probe already in flight');
      this.probeInFlight = true;
    }
    try {
      const result = await operation();
      this.state = 'closed';
      this.consecutiveFailures = 0;
      this.openedAt = undefined;
      return result;
    } catch (error) {
      this.consecutiveFailures += 1;
      if (state === 'half-open' || this.consecutiveFailures >= this.failureThreshold) {
        this.state = 'open';
        this.openedAt = this.now();
      }
      throw error;
    } finally {
      if (state === 'half-open') this.probeInFlight = false;
    }
  }

  private currentState(): CircuitState {
    if (this.state === 'open' && this.openedAt !== undefined && this.now() - this.openedAt >= this.resetAfterMs) {
      this.state = 'half-open';
    }
    return this.state;
  }
}

export interface IdempotencyStore {
  execute<T>(key: string, operation: () => Promise<T>): Promise<T>;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly results = new Map<string, Promise<unknown>>();

  async execute<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.results.get(key);
    if (existing) return existing as Promise<T>;
    const pending = operation();
    this.results.set(key, pending);
    try {
      return await pending;
    } catch (error) {
      this.results.delete(key);
      throw error;
    }
  }
}
