import type { ErrorCode } from '../errors/error-codes';
import type { PriceRange } from '../constants';
import type { AlertType, Card, HoldingCondition, HoldingVariant } from './entities';

export interface ApiErrorShape {
  code: ErrorCode;
  message: string;
  requestId: string;
  details?: Record<string, string[]>;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  error: null;
}

export interface ApiFailure {
  ok: false;
  data: null;
  error: ApiErrorShape;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface CardListItem {
  cardId: string;
  name: string;
  set: {
    id: string;
    name: string;
  };
  number: string;
  rarity?: string | undefined;
  imageUrl?: string | undefined;
}

export type CardDetail = Card;

export interface PaginatedResult<T> {
  items: T[];
  cursor: string | null;
}

export type CursorIndex = 'gsi1' | 'gsi2';

export interface CursorPayloadParams {
  set?: string | undefined;
  query?: string | undefined;
}

export interface CursorPayloadV1 {
  v: 1;
  route: string;
  index: CursorIndex;
  params: CursorPayloadParams;
  limit: number;
  lek: Record<string, unknown>;
}

export interface CursorValidationContext {
  route: string;
  index: CursorIndex;
  params: CursorPayloadParams;
  limit: number;
}

export interface LatestPriceResponse {
  cardId: string;
  asOf: string;
  marketCents: number;
  marketPrice: number;
  lowCents?: number | undefined;
  highCents?: number | undefined;
  currency: 'USD';
  source: string;
}

export interface PriceHistoryPoint {
  ts: string;
  marketCents: number;
  marketPrice: number;
  lowCents?: number | undefined;
  highCents?: number | undefined;
  currency: 'USD';
  source: string;
}

export interface PriceHistoryResponse {
  cardId: string;
  range: PriceRange;
  from: string;
  to: string;
  points: PriceHistoryPoint[];
}

export interface CreateHoldingRequest {
  cardId: string;
  qty: number;
  variant: HoldingVariant;
  grade: string | null;
  condition: HoldingCondition;
  buyPriceCents: number;
  buyDate: string;
  notes?: string | undefined;
}

export interface HoldingResponse extends CreateHoldingRequest {
  holdingId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  requestHash?: string | undefined;
}

export interface PortfolioHoldingValuation extends HoldingResponse {
  costBasisCents: number;
  marketValueCents: number;
  unrealizedPnLCents: number;
  unrealizedPnLBps: number;
  latestPrice: LatestPriceResponse | null;
}

export interface PortfolioSummary {
  totalCostBasisCents: number;
  totalMarketValueCents: number;
  unrealizedPnLCents: number;
  unrealizedPnLBps: number;
}

export interface PortfolioResponse {
  summary: PortfolioSummary;
  holdings: PortfolioHoldingValuation[];
}

export interface CreateAlertRequest {
  cardId: string;
  type: AlertType;
  thresholdCents: number;
  cooldownHours: number;
  notifyEmail: string;
}

export interface AlertResponse extends CreateAlertRequest {
  alertId: string;
  userId: string;
  enabled: boolean;
  lastTriggeredAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
  version: number;
  requestHash?: string | undefined;
}

export interface AlertsListResponse {
  alerts: AlertResponse[];
}
