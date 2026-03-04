import { createSuccess, type ApiSuccess } from '@pokepredict/shared';

export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
}

export function buildHealthResponse(): ApiSuccess<{ service: string }> {
  return createSuccess({ service: 'pokepredict-web-client' });
}
