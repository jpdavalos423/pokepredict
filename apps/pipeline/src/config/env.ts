export interface PipelineConfig {
  awsRegion: string;
  rawBucket: string;
  sourceName: string;
  scheduleCron: string;
  sesFromEmail: string;
  tables: {
    cards: string;
    prices: string;
    latestPrices: string;
    signals: string;
    alertsByUser: string;
    alertsByCard: string;
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function readOrDefault(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export function loadPipelineConfig(): PipelineConfig {
  return {
    awsRegion: readOrDefault('AWS_REGION', 'us-west-2'),
    rawBucket: required('RAW_BUCKET'),
    sourceName: required('SOURCE_NAME'),
    scheduleCron: readOrDefault('INGEST_SCHEDULE_CRON', 'cron(0 6 * * ? *)'),
    sesFromEmail: required('SES_FROM_EMAIL'),
    tables: {
      cards: required('TABLE_CARDS'),
      prices: required('TABLE_PRICES'),
      latestPrices: required('TABLE_LATEST_PRICES'),
      signals: required('TABLE_SIGNALS'),
      alertsByUser: required('TABLE_ALERTS_BY_USER'),
      alertsByCard: required('TABLE_ALERTS_BY_CARD')
    }
  };
}
