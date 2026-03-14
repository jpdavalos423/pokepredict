'use client';

import type { PriceRange } from '@pokepredict/shared';
import Link from 'next/link';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../../lib/api-client';
import { formatIsoDate, formatIsoDateTime, formatPercentFromBps, formatUsdFromCents } from '../../../lib/format';
import { getRequestErrorMessage } from '../../../lib/request-error';
import { PriceHistoryChart } from '../../components/charts/price-history-chart';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  LoadingSkeleton,
  PageContainer,
  SectionHeader
} from '../../components/ui';
import type {
  CardDetailData,
  LatestPriceData,
  LatestSignalData,
  PriceHistoryData
} from '../../../lib/api/types';

interface CardDetailPageProps {
  params: Promise<{
    cardId: string;
  }>;
}

interface CardDetailState {
  card: CardDetailData;
  latestPrice: LatestPriceData | null;
  priceHistory: PriceHistoryData;
  latestSignal: LatestSignalData | null;
}

const PRICE_RANGES: PriceRange[] = ['30d', '90d', '1y'];

function getTrendTone(
  trend: LatestSignalData['trend'] | undefined
): 'neutral' | 'success' | 'danger' {
  if (trend === 'UPTREND') {
    return 'success';
  }

  if (trend === 'DOWNTREND') {
    return 'danger';
  }

  return 'neutral';
}

export default function CardDetailPage({ params }: CardDetailPageProps) {
  const { cardId: rawCardId } = use(params);
  const cardId = decodeURIComponent(rawCardId);
  const [range, setRange] = useState<PriceRange>('90d');
  const [data, setData] = useState<CardDetailState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isNotFound, setIsNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadCardData = useCallback(
    async (nextRange: PriceRange, mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'refresh') {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
        setData(null);
        setIsNotFound(false);
      }
      setErrorMessage(null);

      try {
        const cardResponse = await apiClient.getCardById(cardId);
        if (!cardResponse.ok) {
          if (cardResponse.error.code === 'CARD_NOT_FOUND' || cardResponse.error.code === 'NOT_FOUND') {
            setIsNotFound(true);
            setData(null);
            return;
          }

          throw new Error(cardResponse.error.message);
        }

        const [latestPriceResponse, priceHistoryResponse, latestSignalResponse] = await Promise.all([
          apiClient.getCardLatestPrice(cardId),
          apiClient.getCardPrices(cardId, nextRange),
          apiClient.getCardLatestSignal(cardId)
        ]);

        let latestPrice: LatestPriceData | null = null;
        if (latestPriceResponse.ok) {
          latestPrice = latestPriceResponse.data;
        } else if (latestPriceResponse.error.code !== 'PRICE_NOT_FOUND') {
          throw new Error(latestPriceResponse.error.message);
        }

        if (!priceHistoryResponse.ok) {
          throw new Error(priceHistoryResponse.error.message);
        }

        let latestSignal: LatestSignalData | null = null;
        if (latestSignalResponse.ok) {
          latestSignal = latestSignalResponse.data;
        } else if (latestSignalResponse.error.code !== 'SIGNALS_NOT_FOUND') {
          throw new Error(latestSignalResponse.error.message);
        }

        setData({
          card: cardResponse.data,
          latestPrice,
          priceHistory: priceHistoryResponse.data,
          latestSignal
        });
        setIsNotFound(false);
      } catch (error) {
        setErrorMessage(
          getRequestErrorMessage(error, 'Card detail data could not be loaded.')
        );
      } finally {
        if (mode === 'refresh') {
          setIsRefreshing(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [cardId]
  );

  useEffect(() => {
    setRange('90d');
    void loadCardData('90d', 'initial');
  }, [cardId, loadCardData]);

  const changeRange = (nextRange: PriceRange) => {
    if (nextRange === range || isLoading || isRefreshing) {
      return;
    }

    setRange(nextRange);
    void loadCardData(nextRange, 'refresh');
  };

  const rangeSummaryLabel = useMemo(() => {
    if (!data) {
      return '';
    }

    return `${data.priceHistory.points.length} points from ${formatIsoDate(data.priceHistory.from)} to ${formatIsoDate(data.priceHistory.to)}`;
  }, [data]);

  if (isNotFound) {
    return (
      <PageContainer>
        <SectionHeader title="Card Detail" subtitle={`Card ID: ${cardId}`} />
        <EmptyState
          title="Card not found"
          description="The requested card does not exist in the current catalog."
          action={
            <Link href="/market">
              <Button variant="secondary">Back to Market</Button>
            </Link>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <SectionHeader
        title={data ? data.card.name : 'Card Detail'}
        subtitle={
          data
            ? `${data.card.set.name} (${data.card.set.id}) · #${data.card.number}`
            : `Card ID: ${cardId}`
        }
        action={
          <Link href="/market">
            <Button variant="secondary">Back to Market</Button>
          </Link>
        }
      />

      {errorMessage ? (
        <ErrorBanner
          message={errorMessage}
          action={
            <Button
              variant="secondary"
              onClick={() => void loadCardData(range, data ? 'refresh' : 'initial')}
            >
              Retry
            </Button>
          }
        />
      ) : null}

      {isLoading && !data ? (
        <>
          <Card variant="elevated">
            <div className="card-detail-chart-header">
              <LoadingSkeleton className="ui-skeleton-text-short" />
              <LoadingSkeleton className="ui-skeleton-pill" />
            </div>
            <LoadingSkeleton className="card-detail-chart-skeleton" />
          </Card>
          <section className="card-detail-secondary-grid" aria-label="Loading card detail metadata">
            <Card>
              <div className="phase-stack">
                <LoadingSkeleton className="ui-skeleton-text-short" />
                <LoadingSkeleton className="ui-skeleton-text-large" />
                <LoadingSkeleton className="ui-skeleton-text-large" />
              </div>
            </Card>
            <Card>
              <div className="phase-stack">
                <LoadingSkeleton className="ui-skeleton-text-short" />
                <LoadingSkeleton className="ui-skeleton-text-large" />
                <LoadingSkeleton className="ui-skeleton-text-large" />
              </div>
            </Card>
            <Card>
              <div className="phase-stack">
                <LoadingSkeleton className="ui-skeleton-text-short" />
                <LoadingSkeleton className="ui-skeleton-text-large" />
                <LoadingSkeleton className="ui-skeleton-text-short" />
              </div>
            </Card>
          </section>
        </>
      ) : null}

      {data ? (
        <>
          <Card className="card-detail-chart-card" variant="elevated">
            <div className="card-detail-chart-header">
              <div>
                <h2>Market Price History</h2>
                <p className="card-detail-meta-copy">
                  {rangeSummaryLabel}
                </p>
              </div>

              <div className="card-detail-range-group" role="group" aria-label="Price range selector">
                {PRICE_RANGES.map((priceRange) => (
                  <button
                    key={priceRange}
                    type="button"
                    className={
                      priceRange === range
                        ? 'card-detail-range-button is-active'
                        : 'card-detail-range-button'
                    }
                    onClick={() => changeRange(priceRange)}
                    disabled={isRefreshing}
                  >
                    {priceRange}
                  </button>
                ))}
              </div>
            </div>

            <PriceHistoryChart points={data.priceHistory.points} />

            {isRefreshing ? (
              <p className="card-detail-meta-copy card-detail-refresh-copy">Refreshing range...</p>
            ) : null}
          </Card>

          <section className="card-detail-secondary-grid" aria-label="Card detail metadata">
            <Card>
              <h2>Latest Snapshot</h2>
              {data.latestPrice ? (
                <div className="card-detail-stat-stack">
                  <p className="card-detail-price-value">
                    {formatUsdFromCents(data.latestPrice.marketCents)}
                  </p>
                  <p className="card-detail-meta-copy">
                    Low {formatUsdFromCents(data.latestPrice.lowCents ?? data.latestPrice.marketCents)} · High {formatUsdFromCents(data.latestPrice.highCents ?? data.latestPrice.marketCents)}
                  </p>
                  <p className="card-detail-meta-copy">
                    As of {formatIsoDateTime(data.latestPrice.asOf)}
                  </p>
                </div>
              ) : (
                <p className="card-detail-meta-copy">Latest price is not available yet.</p>
              )}
            </Card>

            <Card>
              <h2>Latest Signal</h2>
              {data.latestSignal ? (
                <div className="card-detail-stat-stack">
                  <div>
                    <Badge tone={getTrendTone(data.latestSignal.trend)}>
                      {data.latestSignal.trend.replace('_', ' ')}
                    </Badge>
                  </div>
                  <p className="card-detail-meta-copy">
                    7d return: {formatPercentFromBps(data.latestSignal.ret7dBps)}
                  </p>
                  <p className="card-detail-meta-copy">
                    30d return: {formatPercentFromBps(data.latestSignal.ret30dBps)}
                  </p>
                  <p className="card-detail-meta-copy">
                    30d volatility: {formatPercentFromBps(data.latestSignal.vol30dBps)}
                  </p>
                  <p className="card-detail-meta-copy">
                    As of {formatIsoDate(data.latestSignal.asOfDate)}
                  </p>
                </div>
              ) : (
                <p className="card-detail-meta-copy">Signals are not available yet.</p>
              )}
            </Card>

            <Card>
              <h2>Card Metadata</h2>
              <div className="card-detail-meta-grid">
                {data.card.imageUrl ? (
                  <img
                    className="card-detail-thumb"
                    src={data.card.imageUrl}
                    alt={`${data.card.name} thumbnail`}
                  />
                ) : (
                  <div className="card-detail-thumb card-detail-thumb-fallback">No image</div>
                )}
                <div className="card-detail-stat-stack">
                  <p className="card-detail-meta-copy">Card ID: {data.card.cardId}</p>
                  <p className="card-detail-meta-copy">
                    Set: {data.card.set.name} ({data.card.set.id})
                  </p>
                  <p className="card-detail-meta-copy">Number: {data.card.number}</p>
                  <p className="card-detail-meta-copy">
                    Rarity: {data.card.rarity ?? 'Unspecified'}
                  </p>
                </div>
              </div>
            </Card>
          </section>
        </>
      ) : null}
    </PageContainer>
  );
}
