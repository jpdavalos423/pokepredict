'use client';

import type { HoldingCondition, HoldingVariant } from '@pokepredict/shared';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, unwrapApiResponse } from '../../lib/api-client';
import { getFrontendUserId } from '../../lib/frontend-config';
import { formatCompactUsdFromCents, formatPercentFromBps, formatUsdFromCents } from '../../lib/format';
import { buildIdempotencyKey } from '../../lib/idempotency';
import { getRequestErrorMessage } from '../../lib/request-error';
import type { HoldingCreateInput, PortfolioData } from '../../lib/api/types';
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
} from '../components/ui';

interface HoldingFormState {
  cardId: string;
  qty: string;
  variant: HoldingVariant;
  grade: string;
  condition: HoldingCondition;
  buyPriceUsd: string;
  buyDate: string;
  notes: string;
}

const HOLDING_VARIANTS: Array<{ value: HoldingVariant; label: string }> = [
  { value: 'raw', label: 'Raw' },
  { value: 'holo', label: 'Holo' },
  { value: 'reverse_holo', label: 'Reverse Holo' },
  { value: 'first_edition', label: 'First Edition' },
  { value: 'other', label: 'Other' }
];

const HOLDING_CONDITIONS: Array<{ value: HoldingCondition; label: string }> = [
  { value: 'NM', label: 'Near Mint' },
  { value: 'LP', label: 'Lightly Played' },
  { value: 'MP', label: 'Moderately Played' },
  { value: 'HP', label: 'Heavily Played' },
  { value: 'DMG', label: 'Damaged' }
];

function getDefaultBuyDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createDefaultHoldingFormState(): HoldingFormState {
  return {
    cardId: '',
    qty: '1',
    variant: 'raw',
    grade: '',
    condition: 'NM',
    buyPriceUsd: '',
    buyDate: getDefaultBuyDate(),
    notes: ''
  };
}

function formatSignedUsd(valueInCents: number): string {
  if (valueInCents === 0) {
    return formatUsdFromCents(0);
  }

  const sign = valueInCents > 0 ? '+' : '-';
  return `${sign}${formatUsdFromCents(Math.abs(valueInCents))}`;
}

function getPnLTone(valueInCents: number): 'neutral' | 'success' | 'danger' {
  if (valueInCents > 0) {
    return 'success';
  }

  if (valueInCents < 0) {
    return 'danger';
  }

  return 'neutral';
}

function LoadingPortfolioState() {
  return (
    <>
      <section className="phase-grid phase-grid-stats" aria-label="Loading portfolio summary">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </section>
      <Card>
        <div className="phase-stack">
          <LoadingSkeleton className="ui-skeleton-text-short" />
          <LoadingSkeleton className="ui-skeleton-text-large" />
          <LoadingSkeleton className="ui-skeleton-text-large" />
        </div>
      </Card>
    </>
  );
}

export default function PortfolioPage() {
  const userId = getFrontendUserId();
  const cardIdInputRef = useRef<HTMLInputElement | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [formState, setFormState] = useState<HoldingFormState>(createDefaultHoldingFormState);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingHoldingId, setDeletingHoldingId] = useState<string | null>(null);
  const [confirmDeleteHoldingId, setConfirmDeleteHoldingId] = useState<string | null>(null);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [mutationErrorMessage, setMutationErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [formValidationMessage, setFormValidationMessage] = useState<string | null>(null);

  const loadPortfolio = useCallback(async () => {
    setIsLoading(true);
    setLoadErrorMessage(null);

    try {
      const response = await apiClient.getPortfolio(userId);
      setPortfolio(unwrapApiResponse(response));
    } catch (error) {
      setLoadErrorMessage(
        getRequestErrorMessage(error, 'Portfolio data could not be loaded.')
      );
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadPortfolio();
  }, [loadPortfolio]);

  const updateForm = <T extends keyof HoldingFormState>(key: T, value: HoldingFormState[T]) => {
    setFormState((previous) => ({
      ...previous,
      [key]: value
    }));
  };

  const submitHolding = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormValidationMessage(null);
    setMutationErrorMessage(null);
    setSuccessMessage(null);

    const cardId = formState.cardId.trim();
    if (!cardId) {
      setFormValidationMessage('Card ID is required.');
      return;
    }

    const qty = Number.parseInt(formState.qty, 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      setFormValidationMessage('Quantity must be a positive whole number.');
      return;
    }

    const buyPriceUsd = Number.parseFloat(formState.buyPriceUsd);
    if (!Number.isFinite(buyPriceUsd) || buyPriceUsd < 0) {
      setFormValidationMessage('Buy price must be a valid USD amount.');
      return;
    }

    if (!formState.buyDate) {
      setFormValidationMessage('Buy date is required.');
      return;
    }

    const payload: HoldingCreateInput = {
      cardId,
      qty,
      variant: formState.variant,
      grade: formState.grade.trim() || null,
      condition: formState.condition,
      buyPriceCents: Math.round(buyPriceUsd * 100),
      buyDate: formState.buyDate,
      notes: formState.notes.trim() || undefined
    };

    setIsSubmitting(true);

    try {
      const idempotencyKey = buildIdempotencyKey('portfolio-create', userId, payload);
      const response = await apiClient.createHolding(userId, payload, idempotencyKey);
      const holding = unwrapApiResponse(response, 201);

      setSuccessMessage(`Added ${holding.cardId} to portfolio.`);
      setFormState(createDefaultHoldingFormState());
      setConfirmDeleteHoldingId(null);
      await loadPortfolio();
    } catch (error) {
      setMutationErrorMessage(
        getRequestErrorMessage(error, 'Holding could not be created.')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteHolding = async (holdingId: string) => {
    setMutationErrorMessage(null);
    setSuccessMessage(null);
    setDeletingHoldingId(holdingId);

    try {
      await apiClient.deleteHolding(userId, holdingId);
      setSuccessMessage('Holding deleted.');
      setConfirmDeleteHoldingId(null);
      await loadPortfolio();
    } catch (error) {
      setMutationErrorMessage(
        getRequestErrorMessage(error, 'Holding could not be deleted.')
      );
    } finally {
      setDeletingHoldingId(null);
    }
  };

  const summary = portfolio?.summary;
  const pnlTone = getPnLTone(summary?.unrealizedPnLCents ?? 0);

  return (
    <PageContainer>
      <SectionHeader
        title="Portfolio"
        subtitle="Track holdings, valuation, and unrealized performance with compact create/delete controls."
        action={<Badge tone="primary">User: {userId}</Badge>}
      />

      {loadErrorMessage ? (
        <ErrorBanner
          message={loadErrorMessage}
          action={
            <Button variant="secondary" onClick={() => void loadPortfolio()}>
              Retry
            </Button>
          }
        />
      ) : null}

      {formValidationMessage ? (
        <ErrorBanner title="Form validation" message={formValidationMessage} />
      ) : null}

      {mutationErrorMessage ? (
        <ErrorBanner title="Action failed" message={mutationErrorMessage} />
      ) : null}

      {successMessage ? (
        <Card className="crud-feedback crud-feedback-success">
          <p className="crud-feedback-copy">{successMessage}</p>
        </Card>
      ) : null}

      {summary ? (
        <section className="phase-grid phase-grid-stats" aria-label="Portfolio summary">
          <StatCard
            label="Market Value"
            value={formatCompactUsdFromCents(summary.totalMarketValueCents)}
            trend="Current"
            hint={`${portfolio?.holdings.length ?? 0} holding(s)`}
          />
          <StatCard
            label="Cost Basis"
            value={formatCompactUsdFromCents(summary.totalCostBasisCents)}
            trend="Invested"
            hint="Tracked from purchase entries"
          />
          <StatCard
            label="Unrealized P/L"
            value={formatSignedUsd(summary.unrealizedPnLCents)}
            trend={formatPercentFromBps(summary.unrealizedPnLBps)}
            tone={pnlTone}
            hint="Valuation minus cost basis"
          />
        </section>
      ) : null}

      {isLoading && !portfolio ? <LoadingPortfolioState /> : null}

      <section className="crud-grid crud-grid-two">
        <Card variant="elevated">
          <div className="crud-card-header">
            <h2>Add Holding</h2>
            <Badge tone="neutral">Idempotent create</Badge>
          </div>
          <form className="crud-form" onSubmit={submitHolding}>
            <div className="crud-form-grid">
              <label className="crud-field">
                <span className="crud-field-label">Card ID</span>
                <input
                  ref={cardIdInputRef}
                  className="ui-input"
                  value={formState.cardId}
                  onChange={(event) => updateForm('cardId', event.target.value)}
                  placeholder="sv3-198"
                  required
                />
              </label>

              <label className="crud-field">
                <span className="crud-field-label">Qty</span>
                <input
                  className="ui-input"
                  type="number"
                  min={1}
                  step={1}
                  value={formState.qty}
                  onChange={(event) => updateForm('qty', event.target.value)}
                  required
                />
              </label>

              <label className="crud-field">
                <span className="crud-field-label">Variant</span>
                <select
                  className="ui-input"
                  value={formState.variant}
                  onChange={(event) => updateForm('variant', event.target.value as HoldingVariant)}
                >
                  {HOLDING_VARIANTS.map((variant) => (
                    <option key={variant.value} value={variant.value}>
                      {variant.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="crud-field">
                <span className="crud-field-label">Condition</span>
                <select
                  className="ui-input"
                  value={formState.condition}
                  onChange={(event) =>
                    updateForm('condition', event.target.value as HoldingCondition)
                  }
                >
                  {HOLDING_CONDITIONS.map((condition) => (
                    <option key={condition.value} value={condition.value}>
                      {condition.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="crud-field">
                <span className="crud-field-label">Buy Price (USD)</span>
                <input
                  className="ui-input"
                  type="number"
                  min={0}
                  step={0.01}
                  value={formState.buyPriceUsd}
                  onChange={(event) => updateForm('buyPriceUsd', event.target.value)}
                  placeholder="95.00"
                  required
                />
              </label>

              <label className="crud-field">
                <span className="crud-field-label">Buy Date</span>
                <input
                  className="ui-input"
                  type="date"
                  value={formState.buyDate}
                  onChange={(event) => updateForm('buyDate', event.target.value)}
                  required
                />
              </label>

              <label className="crud-field">
                <span className="crud-field-label">Grade (Optional)</span>
                <input
                  className="ui-input"
                  value={formState.grade}
                  onChange={(event) => updateForm('grade', event.target.value)}
                  placeholder="PSA 10"
                />
              </label>
            </div>

            <label className="crud-field">
              <span className="crud-field-label">Notes (Optional)</span>
              <textarea
                className="ui-input crud-textarea"
                value={formState.notes}
                onChange={(event) => updateForm('notes', event.target.value)}
                maxLength={500}
                placeholder="Source or context"
              />
            </label>

            <div className="crud-actions">
              <p className="crud-hint">Duplicate submissions reuse the same idempotency key.</p>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Adding...' : 'Add Holding'}
              </Button>
            </div>
          </form>
        </Card>

        <Card variant="elevated">
          <div className="crud-card-header">
            <h2>Holdings</h2>
            <Badge tone="neutral">{portfolio?.holdings.length ?? 0} total</Badge>
          </div>

          {portfolio && portfolio.holdings.length > 0 ? (
            <ul className="crud-list" aria-label="Portfolio holdings">
              {portfolio.holdings.map((holding) => (
                <li className="crud-row" key={holding.holdingId}>
                  <div className="crud-row-main">
                    <div>
                      <p className="crud-row-title">{holding.cardId}</p>
                      <p className="crud-row-subtitle">
                        Qty {holding.qty} · {holding.variant.replace('_', ' ')} · {holding.condition}
                      </p>
                    </div>
                    <div className="crud-row-value-wrap">
                      <p className="crud-row-value">{formatUsdFromCents(holding.marketValueCents)}</p>
                      <Badge tone={getPnLTone(holding.unrealizedPnLCents)}>
                        {formatSignedUsd(holding.unrealizedPnLCents)}
                      </Badge>
                    </div>
                  </div>

                  <div className="crud-row-meta">
                    <span>Cost {formatUsdFromCents(holding.costBasisCents)}</span>
                    <span>Buy Date {holding.buyDate}</span>
                    <span>
                      Latest{' '}
                      {holding.latestPrice
                        ? formatUsdFromCents(holding.latestPrice.marketCents)
                        : 'Unavailable'}
                    </span>
                  </div>

                  <div className="crud-row-actions">
                    {confirmDeleteHoldingId === holding.holdingId ? (
                      <div className="crud-confirm-actions">
                        <Button
                          variant="destructive"
                          onClick={() => void deleteHolding(holding.holdingId)}
                          disabled={deletingHoldingId === holding.holdingId}
                        >
                          {deletingHoldingId === holding.holdingId ? 'Deleting...' : 'Confirm Delete'}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => setConfirmDeleteHoldingId(null)}
                          disabled={deletingHoldingId === holding.holdingId}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => setConfirmDeleteHoldingId(holding.holdingId)}
                        disabled={deletingHoldingId === holding.holdingId}
                      >
                        Delete Holding
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {!isLoading && portfolio && portfolio.holdings.length === 0 ? (
            <EmptyState
              className="crud-empty"
              title="No holdings yet"
              description="Add your first holding to start tracking valuation and unrealized performance."
              action={
                <Button variant="secondary" onClick={() => cardIdInputRef.current?.focus()}>
                  Add First Holding
                </Button>
              }
            />
          ) : null}

          {isLoading && portfolio ? (
            <div className="phase-stack">
              <LoadingSkeleton className="ui-skeleton-text-short" />
              <LoadingSkeleton className="ui-skeleton-text-large" />
              <LoadingSkeleton className="ui-skeleton-text-large" />
            </div>
          ) : null}
        </Card>
      </section>
    </PageContainer>
  );
}
