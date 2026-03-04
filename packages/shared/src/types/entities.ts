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
  lowCents?: number;
  highCents?: number;
  currency: 'USD';
  source: string;
}

export interface LatestPrice {
  cardId: string;
  asOf: string;
  marketCents: number;
  lowCents?: number;
  highCents?: number;
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

export interface PipelineEventContext {
  runId: string;
  source: string;
  mode: 'scheduled' | 'manual';
}
