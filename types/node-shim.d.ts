declare module 'node:test' {
  interface TestFn { (name: string, fn: () => void | Promise<void>): void; }
  const test: TestFn;
  export default test;
}

declare module 'node:assert/strict' {
  interface Assert {
    equal(actual: unknown, expected: unknown, message?: string): void;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    match(actual: string, expected: RegExp, message?: string): void;
    ok(value: unknown, message?: string): asserts value;
    rejects(block: () => Promise<unknown>, error?: RegExp | ((error: unknown) => boolean)): Promise<void>;
    throws(block: () => unknown, error?: RegExp | ((error: unknown) => boolean)): void;
  }
  const assert: Assert;
  export default assert;
}

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exitCode?: number;
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
  pid: number;
  cwd(): string;
  exit(code?: number): never;
  on(signal: string, listener: () => void): void;
};

declare module 'node:fs/promises' {
  export function access(path: string | URL): Promise<void>;
  export function readFile(path: string | URL, encoding: 'utf8'): Promise<string>;
  export function writeFile(path: string | URL, data: string, encoding?: 'utf8'): Promise<void>;
  export function mkdir(path: string | URL, options?: { recursive?: boolean }): Promise<string | undefined>;
}

declare module 'node:crypto' {
  interface Hash {
    update(data: string): Hash;
    digest(encoding: 'hex'): string;
  }
  export function createHash(algorithm: string): Hash;
  export function randomUUID(): string;
}

declare module 'node:http' {
  export interface IncomingHttpHeaders {
    [key: string]: string | string[] | undefined;
    authorization?: string;
  }
  export interface IncomingMessage extends AsyncIterable<Uint8Array> {
    method?: string;
    url?: string;
    headers: IncomingHttpHeaders;
  }
  export interface ServerResponse {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(data?: string): void;
  }
  export interface AddressInfo {
    address: string;
    family: string;
    port: number;
  }
  export interface Server {
    listen(port: number, host: string, callback: () => void): this;
    close(callback: (error?: Error) => void): this;
    address(): AddressInfo | string | null;
  }
  export function createServer(
    listener: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
  ): Server;
}


declare module 'node:child_process' {
  export interface SpawnSyncOptions {
    cwd?: string;
    env?: Record<string, string | undefined>;
    encoding?: 'utf8';
  }
  export interface SpawnSyncResult {
    status: number | null;
    stdout?: string;
    stderr?: string;
    error?: Error;
  }
  export function spawnSync(command: string, args?: readonly string[], options?: SpawnSyncOptions): SpawnSyncResult;
}
