import { describe, expect, it } from 'vitest';
import { AppError, createFailure, createSuccess } from '../src/errors';

describe('API envelope helpers', () => {
  it('creates success payload', () => {
    const payload = createSuccess({ health: 'ok' });
    expect(payload).toEqual({
      ok: true,
      data: { health: 'ok' },
      error: null
    });
  });

  it('creates failure payload', () => {
    const err = new AppError('BAD_REQUEST', 'Invalid request', 400, {
      field: ['required']
    });
    const payload = createFailure(err, 'req_123');
    expect(payload.ok).toBe(false);
    if (!payload.error) {
      throw new Error('Expected error payload');
    }
    expect(payload.error.code).toBe('BAD_REQUEST');
    expect(payload.error.requestId).toBe('req_123');
    expect(payload.error.details?.field).toEqual(['required']);
  });
});
