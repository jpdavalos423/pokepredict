import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  CursorValidationError,
  decodeAndValidateCursor,
  encodeCursor
} from '../src/cursor';
import type { CursorPayloadV1 } from '../src/types';

const SECRET = 'test-cursor-secret';

function createPayload(overrides: Partial<CursorPayloadV1> = {}): CursorPayloadV1 {
  return {
    v: 1,
    route: '/cards',
    index: 'gsi1',
    params: {
      set: 'sv3',
      query: 'char'
    },
    limit: 25,
    lek: {
      pk: 'CARD#sv3-169',
      sk: 'META'
    },
    ...overrides
  };
}

describe('cursor utility', () => {
  it('encodes and decodes payload with signature validation', () => {
    const payload = createPayload();
    const token = encodeCursor(payload, SECRET);

    const decoded = decodeAndValidateCursor(token, SECRET, {
      route: '/cards',
      index: 'gsi1',
      params: { set: 'sv3', query: 'char' },
      limit: 25
    });

    expect(decoded).toEqual(payload);
  });

  it('rejects invalid signature', () => {
    const payload = createPayload();
    const token = encodeCursor(payload, SECRET);
    const tampered = `${token.slice(0, -1)}x`;

    expect(() =>
      decodeAndValidateCursor(tampered, SECRET, {
        route: '/cards',
        index: 'gsi1',
        params: { set: 'sv3', query: 'char' },
        limit: 25
      })
    ).toThrowError(CursorValidationError);
  });

  it('rejects unsupported version', () => {
    const payload = createPayload({ v: 1 });
    const token = encodeCursor(payload, SECRET);
    const [payloadPart] = token.split('.');
    const payloadJson = Buffer.from(payloadPart, 'base64url').toString('utf-8');
    const parsed = JSON.parse(payloadJson) as CursorPayloadV1 & { v: number };
    parsed.v = 2;
    const badPayloadPart = Buffer.from(JSON.stringify(parsed), 'utf-8').toString('base64url');
    const badSignature = createHmac('sha256', SECRET)
      .update(badPayloadPart)
      .digest('base64url');
    const unsupported = `${badPayloadPart}.${badSignature}`;

    expect(() =>
      decodeAndValidateCursor(unsupported, SECRET, {
        route: '/cards',
        index: 'gsi1',
        params: { set: 'sv3', query: 'char' },
        limit: 25
      })
    ).toThrowError(CursorValidationError);
  });

  it('rejects context mismatch', () => {
    const token = encodeCursor(createPayload(), SECRET);

    expect(() =>
      decodeAndValidateCursor(token, SECRET, {
        route: '/cards',
        index: 'gsi2',
        params: { query: 'char' },
        limit: 25
      })
    ).toThrowError(CursorValidationError);
  });
});
