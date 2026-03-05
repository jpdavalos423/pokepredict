export interface ApiConfig {
  awsRegion: string;
  cursorSigningSecret?: string;
  cursorSigningSecretParam?: string;
  tables: {
    cards: string;
    prices: string;
    latestPrices: string;
    holdings: string;
    alertsByUser: string;
    alertsByCard: string;
    signals: string;
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function loadApiConfig(): ApiConfig {
  const cursorSigningSecret = process.env.CURSOR_SIGNING_SECRET;
  const cursorSigningSecretParam = process.env.CURSOR_SIGNING_SECRET_PARAM;

  if (!cursorSigningSecret && !cursorSigningSecretParam) {
    throw new Error(
      'Missing cursor signing secret configuration. Set CURSOR_SIGNING_SECRET or CURSOR_SIGNING_SECRET_PARAM.'
    );
  }

  return {
    awsRegion: required('AWS_REGION'),
    ...(cursorSigningSecret ? { cursorSigningSecret } : {}),
    ...(cursorSigningSecretParam ? { cursorSigningSecretParam } : {}),
    tables: {
      cards: required('TABLE_CARDS'),
      prices: required('TABLE_PRICES'),
      latestPrices: required('TABLE_LATEST_PRICES'),
      holdings: required('TABLE_HOLDINGS'),
      alertsByUser: required('TABLE_ALERTS_BY_USER'),
      alertsByCard: required('TABLE_ALERTS_BY_CARD'),
      signals: required('TABLE_SIGNALS')
    }
  };
}
