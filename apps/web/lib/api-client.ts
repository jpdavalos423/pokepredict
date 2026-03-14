import type { PriceRange } from '@pokepredict/shared';
import { apiEndpoints } from './api/endpoints';
import {
  buildApiUrl,
  getApiBaseUrl,
  requestApi,
  requestApiNoContent,
  unwrapApiResponse
} from './api/request';
import type {
  AlertCreateInput,
  AlertData,
  AlertsData,
  BackendApiResponse,
  CardDetailData,
  CardsListData,
  HoldingCreateInput,
  HoldingData,
  LatestPriceData,
  LatestSignalData,
  PortfolioData,
  PriceHistoryData
} from './api/types';

export type { ApiClientError } from './api/request';
export { apiEndpoints, buildApiUrl, getApiBaseUrl, unwrapApiResponse };
export type * from './api/types';

export interface ListCardsParams {
  query?: string | undefined;
  set?: string | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  });

  const serialized = query.toString();
  if (!serialized) {
    return path;
  }

  return `${path}?${serialized}`;
}

export const apiClient = {
  listCards: (params: ListCardsParams): Promise<BackendApiResponse<CardsListData>> =>
    requestApi<CardsListData>(
      withQuery(apiEndpoints.cards, {
        query: params.query,
        set: params.set,
        limit: params.limit,
        cursor: params.cursor
      })
    ),

  getCardById: (cardId: string): Promise<BackendApiResponse<CardDetailData>> =>
    requestApi<CardDetailData>(apiEndpoints.cardById(cardId)),

  getCardLatestPrice: (cardId: string): Promise<BackendApiResponse<LatestPriceData>> =>
    requestApi<LatestPriceData>(apiEndpoints.cardLatestPrice(cardId)),

  getCardPrices: (
    cardId: string,
    range: PriceRange
  ): Promise<BackendApiResponse<PriceHistoryData>> =>
    requestApi<PriceHistoryData>(withQuery(apiEndpoints.cardPrices(cardId), { range })),

  getCardLatestSignal: (cardId: string): Promise<BackendApiResponse<LatestSignalData>> =>
    requestApi<LatestSignalData>(apiEndpoints.cardLatestSignal(cardId)),

  getPortfolio: (userId: string): Promise<BackendApiResponse<PortfolioData>> =>
    requestApi<PortfolioData>(apiEndpoints.portfolio, { userId }),

  createHolding: (
    userId: string,
    payload: HoldingCreateInput,
    idempotencyKey?: string
  ): Promise<BackendApiResponse<HoldingData>> =>
    requestApi<HoldingData>(apiEndpoints.portfolioHoldings, {
      method: 'POST',
      userId,
      idempotencyKey,
      json: payload
    }),

  deleteHolding: (userId: string, holdingId: string): Promise<void> =>
    requestApiNoContent(apiEndpoints.portfolioHoldingById(holdingId), {
      method: 'DELETE',
      userId
    }),

  getAlerts: (userId: string): Promise<BackendApiResponse<AlertsData>> =>
    requestApi<AlertsData>(apiEndpoints.alerts, { userId }),

  createAlert: (
    userId: string,
    payload: AlertCreateInput,
    idempotencyKey?: string
  ): Promise<BackendApiResponse<AlertData>> =>
    requestApi<AlertData>(apiEndpoints.alerts, {
      method: 'POST',
      userId,
      idempotencyKey,
      json: payload
    }),

  deleteAlert: (userId: string, alertId: string): Promise<void> =>
    requestApiNoContent(apiEndpoints.alertById(alertId), {
      method: 'DELETE',
      userId
    })
};
