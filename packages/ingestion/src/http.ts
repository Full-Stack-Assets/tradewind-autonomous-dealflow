export interface HttpRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxAttempts?: number;
}

export interface HttpResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  body: T;
}

export interface HttpTransport {
  request(request: HttpRequest): Promise<HttpResponse>;
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function retryAfterMs(headers: Headers): number {
  const raw = headers.get('retry-after');
  if (!raw) return 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : 0;
}

async function delay(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export class HttpStatusError extends Error {
  readonly status: number;
  readonly response: HttpResponse;

  constructor(response: HttpResponse) {
    super(`HTTP ${response.status}`);
    this.name = 'HttpStatusError';
    this.status = response.status;
    this.response = response;
  }
}

export class FetchHttpTransport implements HttpTransport {
  async request(request: HttpRequest): Promise<HttpResponse> {
    const maxAttempts = Math.max(1, request.maxAttempts ?? 3);
    const timeoutMs = Math.max(1, request.timeoutMs ?? 15_000);
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const init: RequestInit = {
          method: request.method ?? 'GET',
          signal: AbortSignal.timeout(timeoutMs),
          ...(request.headers === undefined ? {} : { headers: request.headers }),
          ...(request.body === undefined ? {} : { body: request.body }),
        };
        const response = await fetch(request.url, init);
        const text = await response.text();
        let body: unknown = text;
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('json') || text.startsWith('{') || text.startsWith('[')) {
          try { body = text.length === 0 ? null : JSON.parse(text); } catch { body = text; }
        }
        const headers = Object.fromEntries(response.headers.entries());
        const result: HttpResponse = { status: response.status, headers, body };
        if (response.ok) return result;
        if (!retryableStatus(response.status) || attempt === maxAttempts) throw new HttpStatusError(result);
        await delay(Math.max(retryAfterMs(response.headers), attempt * 100));
      } catch (error) {
        lastError = error;
        if (error instanceof HttpStatusError && !retryableStatus(error.status)) throw error;
        if (attempt === maxAttempts) throw error;
        await delay(attempt * 100);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('HTTP request failed');
  }
}
