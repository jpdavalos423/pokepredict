import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CursorPayloadParams, CursorPayloadV1, CursorValidationContext } from './types';
import { cursorPayloadV1Schema } from './schemas';

export class CursorValidationError extends Error {
  readonly reason:
    | 'INVALID_FORMAT'
    | 'INVALID_SIGNATURE'
    | 'INVALID_PAYLOAD'
    | 'UNSUPPORTED_VERSION'
    | 'CONTEXT_MISMATCH';

  constructor(
    reason:
      | 'INVALID_FORMAT'
      | 'INVALID_SIGNATURE'
      | 'INVALID_PAYLOAD'
      | 'UNSUPPORTED_VERSION'
      | 'CONTEXT_MISMATCH',
    message: string
  ) {
    super(message);
    this.reason = reason;
  }
}

function normalizeParams(params: CursorPayloadParams): Record<string, string> {
  const normalized: Record<string, string> = {};
  if (params.set) {
    normalized.set = params.set;
  }
  if (params.query) {
    normalized.query = params.query;
  }
  return normalized;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf-8').toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf-8');
}

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function signaturesMatch(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

function assertContext(payload: CursorPayloadV1, expected: CursorValidationContext): void {
  const expectedParams = normalizeParams(expected.params);
  const payloadParams = normalizeParams(payload.params);

  if (
    payload.route !== expected.route ||
    payload.index !== expected.index ||
    payload.limit !== expected.limit ||
    JSON.stringify(payloadParams) !== JSON.stringify(expectedParams)
  ) {
    throw new CursorValidationError(
      'CONTEXT_MISMATCH',
      'Cursor does not match this request context.'
    );
  }
}

export function encodeCursor(
  payload: CursorPayloadV1,
  secret: string
): string {
  if (!secret) {
    throw new CursorValidationError('INVALID_SIGNATURE', 'Cursor signing secret is required.');
  }

  const parsedPayload = cursorPayloadV1Schema.parse(payload);
  const payloadB64 = base64UrlEncode(JSON.stringify(parsedPayload));
  const signature = signPayload(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

export function decodeAndValidateCursor(
  token: string,
  secret: string,
  expected: CursorValidationContext
): CursorPayloadV1 {
  if (!secret) {
    throw new CursorValidationError('INVALID_SIGNATURE', 'Cursor signing secret is required.');
  }

  const [payloadPart, signaturePart, extraPart] = token.split('.');
  if (!payloadPart || !signaturePart || extraPart) {
    throw new CursorValidationError('INVALID_FORMAT', 'Cursor token format is invalid.');
  }

  const expectedSignature = signPayload(payloadPart, secret);
  if (!signaturesMatch(signaturePart, expectedSignature)) {
    throw new CursorValidationError('INVALID_SIGNATURE', 'Cursor signature is invalid.');
  }

  let parsed: unknown;
  try {
    const payloadJson = base64UrlDecode(payloadPart);
    parsed = JSON.parse(payloadJson);
  } catch {
    throw new CursorValidationError('INVALID_PAYLOAD', 'Cursor payload could not be decoded.');
  }

  const candidate = parsed as { v?: unknown } | null;
  if (!candidate || candidate.v !== 1) {
    throw new CursorValidationError('UNSUPPORTED_VERSION', 'Unsupported cursor version.');
  }

  const payloadResult = cursorPayloadV1Schema.safeParse(parsed);
  if (!payloadResult.success) {
    throw new CursorValidationError('INVALID_PAYLOAD', 'Cursor payload shape is invalid.');
  }

  const payload = payloadResult.data;
  assertContext(payload, expected);
  return payload;
}
