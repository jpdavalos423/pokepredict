import { afterEach, describe, expect, it } from 'vitest';
import { apiClient, apiEndpoints, buildApiUrl, getApiBaseUrl } from '../lib/api-client';

const ORIGINAL_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

describe('web api client structure', () => {
  afterEach(() => {
    if (ORIGINAL_API_BASE_URL === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
      return;
    }

    process.env.NEXT_PUBLIC_API_BASE_URL = ORIGINAL_API_BASE_URL;
  });

  it('uses same-origin API base by default', () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    expect(getApiBaseUrl()).toBe('/api');
  });

  it('builds URLs from configured base and relative path', () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.pokepredict.dev/';
    expect(buildApiUrl('/cards')).toBe('https://api.pokepredict.dev/cards');
  });

  it('exposes contract-backed endpoint helpers', () => {
    expect(apiEndpoints.cards).toBe('/cards');
    expect(apiEndpoints.cardLatestSignal('sv3-198')).toBe('/cards/sv3-198/signals/latest');
    expect(typeof apiClient.getPortfolio).toBe('function');
  });
});
