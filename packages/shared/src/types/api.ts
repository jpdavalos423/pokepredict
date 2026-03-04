import type { ErrorCode } from '../errors/error-codes';

export interface ApiErrorShape {
  code: ErrorCode;
  message: string;
  requestId: string;
  details?: Record<string, string[]>;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  error: null;
}

export interface ApiFailure {
  ok: false;
  data: null;
  error: ApiErrorShape;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
