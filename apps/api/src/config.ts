export interface ApiConfig {
  awsRegion: string;
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
  return {
    awsRegion: required('AWS_REGION'),
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
