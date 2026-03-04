import { describe, expect, it } from 'vitest';
import { buildHealthResponse, getApiBaseUrl } from '../lib/api-client';

describe('web api client placeholder', () => {
  it('returns a default API URL when env is not set', () => {
    expect(getApiBaseUrl()).toBe('http://localhost:3001');
  });

  it('uses shared envelope helpers', () => {
    const payload = buildHealthResponse();
    expect(payload.ok).toBe(true);
    expect(payload.data.service).toBe('pokepredict-web-client');
  });
});
