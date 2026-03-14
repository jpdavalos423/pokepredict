import { ApiClientError } from './api-client';

export function getRequestErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof ApiClientError) {
    if (error.status === 0) {
      return 'Network request failed. Check your connection and API URL.';
    }

    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}
