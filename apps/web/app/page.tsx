'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiClient, unwrapApiResponse } from '../lib/api-client';
import { getFrontendUserId } from '../lib/frontend-config';
import {
  formatCompactUsdFromCents,
  formatPercentFromBps,
  formatUsdFromCents
} from '../lib/format';
import { getRequestErrorMessage } from '../lib/request-error';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  LoadingSkeleton,
  PageContainer,
  SectionHeader,
  StatCard,
  StatCardSkeleton
} from './components/ui';
import type { AlertsData, PortfolioData } from '../lib/api/types';

interface DashboardData {
  portfolio: PortfolioData;
  alerts: AlertsData;
}

function getPnLTone(
  value: number
): 'neutral' | 'success' | 'danger' {
  if (value > 0) {
    return 'success';
  }

  if (value < 0) {
    return 'danger';
  }

  return 'neutral';
}

function formatPnL(value: number): string {
  if (value === 0) {
    return formatUsdFromCents(0);
  }

  const sign = value > 0 ? '+' : '-';
  return `${sign}${formatUsdFromCents(Math.abs(value))}`;
}

export default function HomePage() {
  const userId = getFrontendUserId();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [portfolioResponse, alertsResponse] = await Promise.all([
        apiClient.getPortfolio(userId),
        apiClient.getAlerts(userId)
      ]);

      setData({
        portfolio: unwrapApiResponse(portfolioResponse),
        alerts: unwrapApiResponse(alertsResponse)
      });
    } catch (error) {
      setErrorMessage(
        getRequestErrorMessage(error, 'Dashboard data could not be loaded.')
      );
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const topHoldings = useMemo(() => {
    if (!data) {
      return [];
    }

    return [...data.portfolio.holdings]
      .sort((first, second) => second.marketValueCents - first.marketValueCents)
      .slice(0, 5);
  }, [data]);

  const recentAlerts = useMemo(() => data?.alerts.alerts.slice(0, 5) ?? [], [data]);

  const summary = data?.portfolio.summary;
  const dashboardIsEmpty =
    (data?.portfolio.holdings.length ?? 0) === 0 && (data?.alerts.alerts.length ?? 0) === 0;
  const pnlTone = getPnLTone(summary?.unrealizedPnLCents ?? 0);

  return (
    <PageContainer>
      <SectionHeader
        title="Dashboard"
        subtitle="Compact portfolio valuation and alert visibility for quick daily checks."
        action={
          <Badge tone="primary">
            User: {userId}
          </Badge>
        }
      />

      {errorMessage ? (
        <ErrorBanner
          message={errorMessage}
          action={
            <Button variant="secondary" onClick={() => void loadDashboard()}>
              Retry
            </Button>
          }
        />
      ) : null}

      {isLoading && !data ? (
        <>
          <section className="phase-grid phase-grid-stats" aria-label="Loading dashboard summary">
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </section>

          <section className="dashboard-secondary-grid" aria-label="Loading dashboard details">
            <Card>
              <div className="phase-stack">
                <LoadingSkeleton className="ui-skeleton-text-short" />
                <LoadingSkeleton className="ui-skeleton-text-large" />
                <LoadingSkeleton className="ui-skeleton-text-large" />
                <LoadingSkeleton className="ui-skeleton-text-large" />
              </div>
            </Card>
            <Card>
              <div className="phase-stack">
                <LoadingSkeleton className="ui-skeleton-text-short" />
                <LoadingSkeleton className="ui-skeleton-text-large" />
                <LoadingSkeleton className="ui-skeleton-text-large" />
                <LoadingSkeleton className="ui-skeleton-text-large" />
              </div>
            </Card>
          </section>
        </>
      ) : null}

      {summary ? (
        <>
          <section className="phase-grid phase-grid-stats" aria-label="Dashboard summary">
            <StatCard
              label="Market Value"
              value={formatCompactUsdFromCents(summary.totalMarketValueCents)}
              trend="Portfolio"
              tone="neutral"
              hint={`${data?.portfolio.holdings.length ?? 0} holding(s)`}
            />
            <StatCard
              label="Unrealized P/L"
              value={formatPnL(summary.unrealizedPnLCents)}
              trend={formatPercentFromBps(summary.unrealizedPnLBps)}
              tone={pnlTone}
              hint={`Cost basis ${formatCompactUsdFromCents(summary.totalCostBasisCents)}`}
            />
            <StatCard
              label="Active Alerts"
              value={String(data?.alerts.alerts.length ?? 0)}
              trend="Thresholds"
              tone="signal"
              hint="Read-only in Phase 2"
            />
          </section>

          {dashboardIsEmpty ? (
            <EmptyState
              title="No dashboard data yet"
              description="Portfolio holdings and alerts are empty for this user. Add positions and alert rules in Phase 3 to populate this view."
              action={
                <Link href="/market">
                  <Button variant="secondary">Browse Market</Button>
                </Link>
              }
            />
          ) : (
            <section className="dashboard-secondary-grid" aria-label="Dashboard detail cards">
              <Card variant="elevated">
                <div className="dashboard-card-header">
                  <h2>Top Holdings</h2>
                  <Badge tone="neutral">
                    {data?.portfolio.holdings.length ?? 0} total
                  </Badge>
                </div>
                {topHoldings.length ? (
                  <ul className="dashboard-list">
                    {topHoldings.map((holding) => (
                      <li className="dashboard-list-row" key={holding.holdingId}>
                        <div className="dashboard-list-main">
                          <p className="dashboard-list-title">
                            {holding.cardId}
                          </p>
                          <p className="dashboard-list-subtitle">
                            Qty {holding.qty} · {holding.condition}
                          </p>
                        </div>
                        <p className="dashboard-list-value">
                          {formatCompactUsdFromCents(holding.marketValueCents)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dashboard-muted-copy">
                    No holdings yet.
                  </p>
                )}
              </Card>

              <Card variant="elevated">
                <div className="dashboard-card-header">
                  <h2>Recent Alerts</h2>
                  <Badge tone="signal">
                    {data?.alerts.alerts.length ?? 0} active
                  </Badge>
                </div>
                {recentAlerts.length ? (
                  <ul className="dashboard-list">
                    {recentAlerts.map((alert) => (
                      <li className="dashboard-list-row" key={alert.alertId}>
                        <div className="dashboard-list-main">
                          <p className="dashboard-list-title">{alert.cardId}</p>
                          <p className="dashboard-list-subtitle">{alert.type.replace('_', ' ')}</p>
                        </div>
                        <p className="dashboard-list-value">
                          {formatUsdFromCents(alert.thresholdCents)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dashboard-muted-copy">
                    No alerts configured.
                  </p>
                )}
              </Card>
            </section>
          )}
        </>
      ) : null}
    </PageContainer>
  );
}
