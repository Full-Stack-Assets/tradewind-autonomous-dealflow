import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { SourceHealth } from '../../../packages/ingestion/src/source-runner.ts';
import type { TransactionalDealFlowStore } from '../../../packages/persistence/src/contracts.ts';
import type { MetricsRegistry } from '../../../packages/telemetry/src/metrics.ts';
import { operatorHtml } from './operator-html.ts';

export interface ReadinessResult {
  ready: boolean;
  checks: Record<string, string>;
}

export interface ApiDependencies {
  store: TransactionalDealFlowStore;
  metrics: MetricsRegistry;
  createSimulation(input: Record<string, unknown>): Promise<unknown>;
  readiness?: () => Promise<ReadinessResult>;
  listSourceHealth?: () => Promise<SourceHealth[]>;
  apiToken?: string;
  maxRequestBytes?: number;
}

export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string) {
    super(400, 'bad_request', message);
    this.name = 'BadRequestError';
  }
}

class PayloadTooLargeError extends HttpError {
  constructor() {
    super(413, 'payload_too_large', 'Request body exceeds the configured limit');
  }
}

function setCommonHeaders(response: ServerResponse): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
}

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  setCommonHeaders(response);
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(`${JSON.stringify(value)}\n`);
}

function sendHtml(response: ServerResponse, statusCode: number, value: string): void {
  setCommonHeaders(response);
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(value);
}

async function readJsonBody(request: IncomingMessage, maxBytes: number): Promise<Record<string, unknown>> {
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  let oversized = false;
  for await (const chunk of request) {
    size += chunk.byteLength;
    if (size > maxBytes) {
      oversized = true;
      continue;
    }
    text += decoder.decode(chunk, { stream: true });
  }
  if (oversized) throw new PayloadTooLargeError();
  text += decoder.decode();
  if (text.trim().length === 0) throw new BadRequestError('Request body is required');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BadRequestError('Request body must be valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new BadRequestError('Request body must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function authorized(request: IncomingMessage, token: string | undefined): boolean {
  if (token === undefined) return true;
  return request.headers.authorization === `Bearer ${token}`;
}

function errorResponse(response: ServerResponse, error: unknown): void {
  if (error instanceof HttpError) {
    sendJson(response, error.statusCode, { error: { code: error.code, message: error.message } });
    return;
  }
  sendJson(response, 500, { error: { code: 'internal_error', message: 'Internal server error' } });
}

export interface ApiServer {
  listen(port?: number, host?: string): Promise<{ url: string; port: number }>;
  close(): Promise<void>;
}

export function createApiServer(dependencies: ApiDependencies): ApiServer {
  const maxRequestBytes = dependencies.maxRequestBytes ?? 1_048_576;
  if (!Number.isSafeInteger(maxRequestBytes) || maxRequestBytes <= 0) throw new Error('maxRequestBytes must be a positive integer');

  const server: Server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => errorResponse(response, error));
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const method = request.method ?? 'GET';
    const url = new URL(request.url ?? '/', 'http://localhost');
    const path = url.pathname;

    if (method === 'GET' && path === '/health') {
      sendJson(response, 200, { status: 'ok', service: 'tradewind-autonomous-dealflow' });
      return;
    }
    if (method === 'GET' && path === '/ready') {
      const readiness = dependencies.readiness
        ? await dependencies.readiness()
        : { ready: true, checks: { persistence: 'ok' } };
      sendJson(response, readiness.ready ? 200 : 503, readiness);
      return;
    }
    if (method === 'GET' && path === '/') {
      sendHtml(response, 200, operatorHtml());
      return;
    }

    if (path.startsWith('/v1/') && !authorized(request, dependencies.apiToken)) {
      sendJson(response, 401, { error: { code: 'unauthorized', message: 'Bearer token is required' } });
      return;
    }

    if (method === 'GET' && path === '/v1/workflows') {
      sendJson(response, 200, { workflows: await dependencies.store.listCheckpoints() });
      return;
    }
    if (method === 'GET' && path.startsWith('/v1/workflows/')) {
      const workflowId = decodeURIComponent(path.slice('/v1/workflows/'.length));
      const workflow = await dependencies.store.loadCheckpoint(workflowId);
      if (!workflow) {
        sendJson(response, 404, { error: { code: 'not_found', message: 'Workflow not found' } });
        return;
      }
      const completedTransaction = await dependencies.store.loadCompletedTransaction(workflowId);
      sendJson(response, 200, { workflow, ...(completedTransaction ? { completedTransaction } : {}) });
      return;
    }
    if (method === 'GET' && path === '/v1/events') {
      const workflowId = url.searchParams.get('workflowId') ?? undefined;
      sendJson(response, 200, { events: await dependencies.store.listEvents(workflowId) });
      return;
    }
    if (method === 'GET' && path === '/v1/sources') {
      const sources = dependencies.listSourceHealth ? await dependencies.listSourceHealth() : [];
      sendJson(response, 200, { sources });
      return;
    }
    if (method === 'GET' && path === '/v1/metrics') {
      sendJson(response, 200, { metrics: dependencies.metrics.snapshot() });
      return;
    }
    if (method === 'POST' && path === '/v1/simulations') {
      const contentType = request.headers['content-type'];
      if (typeof contentType !== 'string' || !contentType.toLowerCase().startsWith('application/json')) {
        throw new HttpError(415, 'unsupported_media_type', 'Content-Type must be application/json');
      }
      const input = await readJsonBody(request, maxRequestBytes);
      const result = await dependencies.createSimulation(input);
      sendJson(response, 201, result);
      return;
    }

    sendJson(response, 404, { error: { code: 'not_found', message: 'Route not found' } });
  }

  return {
    listen(port = 0, host = '127.0.0.1'): Promise<{ url: string; port: number }> {
      return new Promise((resolve) => {
        server.listen(port, host, () => {
          const address = server.address();
          if (typeof address !== 'object' || address === null) throw new Error('API server address is unavailable');
          resolve({ url: `http://${host}:${address.port}`, port: address.port });
        });
      });
    },
    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close((error?: Error) => error ? reject(error) : resolve());
      });
    },
  };
}
