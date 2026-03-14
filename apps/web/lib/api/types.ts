import type {
  AlertResponse,
  AlertsListResponse,
  ApiErrorShape,
  ApiFailure,
  ApiResponse,
  ApiSuccess,
  CardDetail,
  CardListItem,
  CreateAlertRequest,
  CreateHoldingRequest,
  HoldingResponse,
  LatestPriceResponse,
  PaginatedResult,
  PortfolioResponse,
  PriceHistoryResponse,
  Signal
} from '@pokepredict/shared';

export type BackendApiResponse<T> = ApiResponse<T>;
export type BackendApiSuccess<T> = ApiSuccess<T>;
export type BackendApiFailure = ApiFailure;
export type BackendApiError = ApiErrorShape;

export type CardsListData = PaginatedResult<CardListItem>;
export type CardDetailData = CardDetail;
export type LatestPriceData = LatestPriceResponse;
export type PriceHistoryData = PriceHistoryResponse;
export type LatestSignalData = Signal;
export type PortfolioData = PortfolioResponse;
export type AlertsData = AlertsListResponse;

export type HoldingCreateInput = CreateHoldingRequest;
export type HoldingData = HoldingResponse;
export type AlertCreateInput = CreateAlertRequest;
export type AlertData = AlertResponse;
