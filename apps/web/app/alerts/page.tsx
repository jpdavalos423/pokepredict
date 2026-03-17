'use client';

import type { AlertType } from '@pokepredict/shared';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, unwrapApiResponse } from '../../lib/api-client';
import { getFrontendUserId } from '../../lib/frontend-config';
import { formatIsoDateTime, formatUsdFromCents } from '../../lib/format';
import { buildIdempotencyKey } from '../../lib/idempotency';
import { getRequestErrorMessage } from '../../lib/request-error';
import type { AlertCreateInput, AlertsData } from '../../lib/api/types';
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

interface AlertFormState {
  cardId: string;
  type: AlertType;
  thresholdUsd: string;
  cooldownHours: string;
  notifyEmail: string;
}

const ALERT_TYPES: Array<{ value: AlertType; label: string }> = [
  { value: 'PRICE_ABOVE', label: 'Price Above' },
  { value: 'PRICE_BELOW', label: 'Price Below' }
];

function createDefaultAlertFormState(): AlertFormState {
  return {
    cardId: '',
    type: 'PRICE_ABOVE',
    thresholdUsd: '',
    cooldownHours: '24',
    notifyEmail: ''
  };
}

function LoadingAlertsState() {
  return (
    <>
      <section className="phase-grid phase-grid-stats" aria-label="Loading alerts summary">
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

export default function AlertsPage() {
  const userId = getFrontendUserId();
  const cardIdInputRef = useRef<HTMLInputElement | null>(null);
  const [alertsData, setAlertsData] = useState<AlertsData | null>(null);
  const [formState, setFormState] = useState<AlertFormState>(createDefaultAlertFormState);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingAlertId, setDeletingAlertId] = useState<string | null>(null);
  const [confirmDeleteAlertId, setConfirmDeleteAlertId] = useState<string | null>(null);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [formValidationMessage, setFormValidationMessage] = useState<string | null>(null);
  const [mutationErrorMessage, setMutationErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadAlerts = useCallback(async () => {
    setIsLoading(true);
    setLoadErrorMessage(null);

    try {
      const response = await apiClient.getAlerts(userId);
      setAlertsData(unwrapApiResponse(response));
    } catch (error) {
      setLoadErrorMessage(getRequestErrorMessage(error, 'Alerts could not be loaded.'));
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  const updateForm = <T extends keyof AlertFormState>(key: T, value: AlertFormState[T]) => {
    setFormState((previous) => ({
      ...previous,
      [key]: value
    }));
  };

  const submitAlert = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormValidationMessage(null);
    setMutationErrorMessage(null);
    setSuccessMessage(null);

    const cardId = formState.cardId.trim();
    if (!cardId) {
      setFormValidationMessage('Card ID is required.');
      return;
    }

    const thresholdUsd = Number.parseFloat(formState.thresholdUsd);
    if (!Number.isFinite(thresholdUsd) || thresholdUsd <= 0) {
      setFormValidationMessage('Threshold must be a positive USD amount.');
      return;
    }

    const cooldownHours = Number.parseInt(formState.cooldownHours, 10);
    if (!Number.isFinite(cooldownHours) || cooldownHours <= 0) {
      setFormValidationMessage('Cooldown must be a positive whole hour value.');
      return;
    }

    const notifyEmail = formState.notifyEmail.trim();
    if (!notifyEmail) {
      setFormValidationMessage('Notification email is required.');
      return;
    }

    const payload: AlertCreateInput = {
      cardId,
      type: formState.type,
      thresholdCents: Math.round(thresholdUsd * 100),
      cooldownHours,
      notifyEmail
    };

    setIsSubmitting(true);

    try {
      const idempotencyKey = buildIdempotencyKey('alerts-create', userId, payload);
      const response = await apiClient.createAlert(userId, payload, idempotencyKey);
      const alert = unwrapApiResponse(response, 201);

      setSuccessMessage(`Created alert for ${alert.cardId}.`);
      setFormState(createDefaultAlertFormState());
      setConfirmDeleteAlertId(null);
      await loadAlerts();
    } catch (error) {
      setMutationErrorMessage(getRequestErrorMessage(error, 'Alert could not be created.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteAlert = async (alertId: string) => {
    setMutationErrorMessage(null);
    setSuccessMessage(null);
    setDeletingAlertId(alertId);

    try {
      await apiClient.deleteAlert(userId, alertId);
      setSuccessMessage('Alert deleted.');
      setConfirmDeleteAlertId(null);
      await loadAlerts();
    } catch (error) {
      setMutationErrorMessage(getRequestErrorMessage(error, 'Alert could not be deleted.'));
    } finally {
      setDeletingAlertId(null);
    }
  };

  const totalAlerts = alertsData?.alerts.length ?? 0;
  const aboveCount = alertsData?.alerts.filter((alert) => alert.type === 'PRICE_ABOVE').length ?? 0;
  const belowCount = alertsData?.alerts.filter((alert) => alert.type === 'PRICE_BELOW').length ?? 0;

  return (
    <PageContainer>
      <SectionHeader
        title="Alerts"
        subtitle="Create and manage price threshold alerts with minimal, intentional controls."
        action={<Badge tone="primary">User: {userId}</Badge>}
      />

      {loadErrorMessage ? (
        <ErrorBanner
          message={loadErrorMessage}
          action={
            <Button variant="secondary" onClick={() => void loadAlerts()}>
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

      {alertsData ? (
        <section className="phase-grid phase-grid-stats" aria-label="Alerts summary">
          <StatCard
            label="Active Alerts"
            value={String(totalAlerts)}
            trend="Configured"
            tone="signal"
            hint="User-scoped rules"
          />
          <StatCard
            label="Price Above"
            value={String(aboveCount)}
            trend="Upper thresholds"
            tone="success"
            hint="Triggers on crossings"
          />
          <StatCard
            label="Price Below"
            value={String(belowCount)}
            trend="Lower thresholds"
            tone="danger"
            hint="Triggers on crossings"
          />
        </section>
      ) : null}

      {isLoading && !alertsData ? <LoadingAlertsState /> : null}

      <section className="crud-grid crud-grid-two">
        <Card variant="elevated">
          <div className="crud-card-header">
            <h2>Create Alert</h2>
            <Badge tone="signal">Idempotent create</Badge>
          </div>
          <form className="crud-form" onSubmit={submitAlert}>
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
                <span className="crud-field-label">Type</span>
                <select
                  className="ui-input"
                  value={formState.type}
                  onChange={(event) => updateForm('type', event.target.value as AlertType)}
                >
                  {ALERT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="crud-field">
                <span className="crud-field-label">Threshold (USD)</span>
                <input
                  className="ui-input"
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={formState.thresholdUsd}
                  onChange={(event) => updateForm('thresholdUsd', event.target.value)}
                  placeholder="120.00"
                  required
                />
              </label>

              <label className="crud-field">
                <span className="crud-field-label">Cooldown (Hours)</span>
                <input
                  className="ui-input"
                  type="number"
                  min={1}
                  step={1}
                  value={formState.cooldownHours}
                  onChange={(event) => updateForm('cooldownHours', event.target.value)}
                  required
                />
              </label>

              <label className="crud-field crud-field-span-full">
                <span className="crud-field-label">Notify Email</span>
                <input
                  className="ui-input"
                  type="email"
                  value={formState.notifyEmail}
                  onChange={(event) => updateForm('notifyEmail', event.target.value)}
                  placeholder="user@example.com"
                  required
                />
              </label>
            </div>

            <div className="crud-actions">
              <p className="crud-hint">Duplicate submissions reuse the same idempotency key.</p>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Alert'}
              </Button>
            </div>
          </form>
        </Card>

        <Card variant="elevated">
          <div className="crud-card-header">
            <h2>Alert Rules</h2>
            <Badge tone="neutral">{totalAlerts} total</Badge>
          </div>

          {alertsData && alertsData.alerts.length > 0 ? (
            <ul className="crud-list" aria-label="Alert rules">
              {alertsData.alerts.map((alert) => (
                <li className="crud-row" key={alert.alertId}>
                  <div className="crud-row-main">
                    <div>
                      <p className="crud-row-title">{alert.cardId}</p>
                      <p className="crud-row-subtitle">
                        {alert.type.replace('_', ' ')} at {formatUsdFromCents(alert.thresholdCents)}
                      </p>
                    </div>
                    <div className="crud-row-value-wrap">
                      <Badge tone={alert.type === 'PRICE_ABOVE' ? 'success' : 'danger'}>
                        {alert.type === 'PRICE_ABOVE' ? 'Above' : 'Below'}
                      </Badge>
                      <Badge tone={alert.enabled ? 'signal' : 'neutral'}>
                        {alert.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                  </div>

                  <div className="crud-row-meta">
                    <span>{alert.notifyEmail}</span>
                    <span>Cooldown {alert.cooldownHours}h</span>
                    <span>
                      Last Triggered{' '}
                      {alert.lastTriggeredAt ? formatIsoDateTime(alert.lastTriggeredAt) : 'Never'}
                    </span>
                  </div>

                  <div className="crud-row-actions">
                    {confirmDeleteAlertId === alert.alertId ? (
                      <div className="crud-confirm-actions">
                        <Button
                          variant="destructive"
                          onClick={() => void deleteAlert(alert.alertId)}
                          disabled={deletingAlertId === alert.alertId}
                        >
                          {deletingAlertId === alert.alertId ? 'Deleting...' : 'Confirm Delete'}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => setConfirmDeleteAlertId(null)}
                          disabled={deletingAlertId === alert.alertId}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => setConfirmDeleteAlertId(alert.alertId)}
                        disabled={deletingAlertId === alert.alertId}
                      >
                        Delete Alert
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {!isLoading && alertsData && alertsData.alerts.length === 0 ? (
            <EmptyState
              className="crud-empty"
              title="No alerts configured"
              description="Create your first threshold rule to track key cards and get notified on crossings."
              action={
                <Button variant="secondary" onClick={() => cardIdInputRef.current?.focus()}>
                  Create First Alert
                </Button>
              }
            />
          ) : null}

          {isLoading && alertsData ? (
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
