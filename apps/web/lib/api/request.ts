import type { BackendApiError, BackendApiResponse } from './types';

const DEFAULT_API_BASE = '/api';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRequestOptions extends Omit<RequestInit, 'method' | 'body' | 'headers'> {
  method?: HttpMethod;
  headers?: HeadersInit;
  json?: unknown;
  userId?: string | undefined;
  idempotencyKey?: string | undefined;
}

interface ApiClientErrorOptions {
  status: number;
  code?: string | undefined;
  requestId?: string | undefined;
  details?: Record<string, string[]> | undefined;
  cause?: unknown;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly requestId: string | undefined;
  readonly details: Record<string, string[]> | undefined;

  constructor(message: string, options: ApiClientErrorOptions) {
    super(message);
    this.name = 'ApiClientError';
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.details = options.details;
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!configured) {
    return DEFAULT_API_BASE;
  }

  if (configured === '/') {
    return '';
  }

  return configured.endsWith('/') ? configured.slice(0, -1) : configured;
}

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}

function isBackendResponse<T>(value: unknown): value is BackendApiResponse<T> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const maybeResponse = value as {
    ok?: unknown;
    data?: unknown;
    error?: unknown;
  };

  if (typeof maybeResponse.ok !== 'boolean') {
    return false;
  }

  if (maybeResponse.ok) {
    return maybeResponse.error === null;
  }

  if (maybeResponse.data !== null) {
    return false;
  }

  if (!maybeResponse.error || typeof maybeResponse.error !== 'object') {
    return false;
  }

  const maybeError = maybeResponse.error as { code?: unknown; message?: unknown; requestId?: unknown };
  return (
    typeof maybeError.code === 'string' &&
    typeof maybeError.message === 'string' &&
    typeof maybeError.requestId === 'string'
  );
}

function toClientError(error: BackendApiError, status: number): ApiClientError {
  return new ApiClientError(error.message, {
    status,
    code: error.code,
    requestId: error.requestId,
    details: error.details
  });
}

async function tryParseJson(response: Response): Promise<unknown | null> {
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return null;
  }

  return (await response.json()) as unknown;
}

function toRequestInit(options: ApiRequestOptions): RequestInit {
  const headers = new Headers(options.headers);
  headers.set('accept', 'application/json');

  if (options.userId) {
    headers.set('x-user-id', options.userId);
  }

  if (options.idempotencyKey) {
    headers.set('idempotency-key', options.idempotencyKey);
  }

  const init: RequestInit = {
    ...options,
    method: options.method ?? 'GET',
    headers
  };

  if (options.json !== undefined) {
    headers.set('content-type', 'application/json');
    init.body = JSON.stringify(options.json);
  }

  return init;
}

export async function requestApi<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<BackendApiResponse<T>> {
  let response: Response;
  try {
    response = await fetch(buildApiUrl(path), toRequestInit(options));
  } catch (error) {
    throw new ApiClientError('Network request failed.', {
      status: 0,
      cause: error
    });
  }

  if (response.status === 204) {
    return {
      ok: true,
      data: null as unknown as T,
      error: null
    };
  }

  const payload = await tryParseJson(response);
  if (!isBackendResponse<T>(payload)) {
    throw new ApiClientError('API response was not a valid backend envelope.', {
      status: response.status
    });
  }

  return payload;
}

export async function requestApiNoContent(
  path: string,
  options: ApiRequestOptions = {}
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(buildApiUrl(path), toRequestInit(options));
  } catch (error) {
    throw new ApiClientError('Network request failed.', {
      status: 0,
      cause: error
    });
  }

  if (response.status === 204) {
    return;
  }

  const payload = await tryParseJson(response);
  if (isBackendResponse<unknown>(payload)) {
    if (!payload.ok) {
      throw toClientError(payload.error, response.status);
    }

    return;
  }

  if (!response.ok) {
    throw new ApiClientError('API request failed with non-JSON response.', {
      status: response.status
    });
  }
}

export function unwrapApiResponse<T>(response: BackendApiResponse<T>, status = 400): T {
  if (response.ok) {
    return response.data;
  }

  throw toClientError(response.error, status);
}
