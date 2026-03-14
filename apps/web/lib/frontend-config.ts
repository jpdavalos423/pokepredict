const DEFAULT_USER_ID = 'user_1';

export function getFrontendUserId(): string {
  const configuredUserId = process.env.NEXT_PUBLIC_USER_ID?.trim();
  if (configuredUserId) {
    return configuredUserId;
  }

  return DEFAULT_USER_ID;
}
