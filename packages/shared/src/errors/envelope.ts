import type { ApiFailure, ApiSuccess } from '../types/api';
import type { ErrorCode } from './error-codes';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details: Record<string, string[]> | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode = 500,
    details?: Record<string, string[]>
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function createSuccess<T>(data: T): ApiSuccess<T> {
  return {
    ok: true,
    data,
    error: null
  };
}

export function createFailure(
  error: AppError,
  requestId: string
): ApiFailure {
  const base = {
    code: error.code,
    message: error.message,
    requestId
  };

  return {
    ok: false,
    data: null,
    error: error.details ? { ...base, details: error.details } : base
  };
}
