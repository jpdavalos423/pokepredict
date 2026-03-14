export interface Card {
  cardId: string;
  name: string;
  set: {
    id: string;
    name: string;
  };
  number: string;
  rarity?: string;
  imageUrl?: string;
}

export interface PricePoint {
  cardId: string;
  ts: string;
  marketCents: number;
  lowCents?: number | undefined;
  highCents?: number | undefined;
  currency: 'USD';
  source: string;
}

export interface LatestPrice {
  cardId: string;
  asOf: string;
  marketCents: number;
  lowCents?: number | undefined;
  highCents?: number | undefined;
  currency: 'USD';
  source: string;
}

export type TrendLabel = 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';

export interface Signal {
  cardId: string;
  asOfDate: string;
  ret7dBps: number;
  ret30dBps: number;
  vol30dBps: number;
  trend: TrendLabel;
  pred7dLowBps?: number;
  pred7dHighBps?: number;
}

export type HoldingVariant = 'raw' | 'holo' | 'reverse_holo' | 'first_edition' | 'other';
export type HoldingCondition = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';

export interface Holding {
  holdingId: string;
  userId: string;
  cardId: string;
  qty: number;
  variant: HoldingVariant;
  grade: string | null;
  condition: HoldingCondition;
  buyPriceCents: number;
  buyDate: string;
  notes?: string;
}

export type AlertType = 'PRICE_ABOVE' | 'PRICE_BELOW';

export interface Alert {
  alertId: string;
  userId: string;
  cardId: string;
  type: AlertType;
  thresholdCents: number;
  cooldownHours: number;
  notifyEmail: string;
  enabled: boolean;
  lastTriggeredAt?: string;
}

export type PipelineMode = 'scheduled' | 'manual';

export interface StartRunInput {
  source: string;
  mode: PipelineMode;
  runId?: string;
  asOf?: string;
}

export interface StartRunResult {
  runId: string;
  asOf: string;
  source: string;
  mode: PipelineMode;
  startedAt: string;
}

export interface RawPriceRecord {
  sourceCardId: string;
  recordedAt: string;
  marketPrice: number;
  lowPrice?: number | undefined;
  highPrice?: number | undefined;
  currency: 'USD';
}

export interface RawFetchPayload {
  runId: string;
  asOf: string;
  source: string;
  mode: PipelineMode;
  records: RawPriceRecord[];
}

export interface FetchRawResult extends StartRunResult {
  rawS3Key: string;
  rawRecordCount: number;
  fetchedAt: string;
}

export interface NormalizedPriceRecord {
  cardId: string;
  ts: string;
  marketCents: number;
  lowCents?: number | undefined;
  highCents?: number | undefined;
  currency: 'USD';
  source: string;
  runId: string;
}

export interface NormalizeResult extends StartRunResult {
  processedCount: number;
  updatedCardIds: string[];
}

export interface ComputeSignalsResult extends StartRunResult {
  processedCount: number;
  updatedCardIds: string[];
}

export interface AlertsEvalResult extends StartRunResult {
  processedCardCount: number;
  triggeredAlertCount: number;
  sentNotificationCount: number;
}

export type PipelineEventContext = StartRunResult;
