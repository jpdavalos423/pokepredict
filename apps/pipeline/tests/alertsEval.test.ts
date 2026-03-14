import { describe, expect, it, vi } from 'vitest';
import type { ComputeSignalsResult } from '@pokepredict/shared';
import {
  createAlertsEvalHandler,
  isCooldownActive,
  shouldTriggerCrossing
} from '../src/handlers/alertsEval';

describe('alertsEval helpers', () => {
  it('detects threshold crossing for both alert types', () => {
    expect(shouldTriggerCrossing('PRICE_ABOVE', 10000, 12001, 12000)).toBe(true);
    expect(shouldTriggerCrossing('PRICE_ABOVE', 12001, 12500, 12000)).toBe(false);
    expect(shouldTriggerCrossing('PRICE_BELOW', 12000, 11999, 12000)).toBe(true);
    expect(shouldTriggerCrossing('PRICE_BELOW', 11999, 11000, 12000)).toBe(false);
  });

  it('enforces cooldown window in hours', () => {
    const nowIso = '2026-03-12T12:00:00.000Z';
    expect(isCooldownActive(undefined, 24, nowIso)).toBe(false);
    expect(isCooldownActive('2026-03-12T11:30:00.000Z', 1, nowIso)).toBe(true);
    expect(isCooldownActive('2026-03-12T10:00:00.000Z', 1, nowIso)).toBe(false);
  });
});

describe('alertsEval handler', () => {
  const event: ComputeSignalsResult = {
    runId: 'run_123',
    asOf: '2026-03-12T12:00:00.000Z',
    source: 'fixture',
    mode: 'manual',
    startedAt: '2026-03-12T12:00:00.000Z',
    processedCount: 1,
    updatedCardIds: ['sv3-198']
  };

  it('triggers and sends notifications on crossing', async () => {
    const sendNotificationEmail = vi.fn(async () => {});
    const markAlertTriggered = vi.fn(async () => {});

    const handler = createAlertsEvalHandler({
      now: () => '2026-03-12T12:01:00.000Z',
      listEnabledAlertsByCard: async () => [
        {
          alertId: 'a1',
          userId: 'u1',
          cardId: 'sv3-198',
          type: 'PRICE_ABOVE',
          thresholdCents: 12000,
          cooldownHours: 24,
          notifyEmail: 'user@example.com',
          enabled: true
        }
      ],
      getCurrentPricePoint: async () => ({
        ts: '2026-03-12T11:50:00.000Z',
        marketCents: 12100
      }),
      getPreviousPrice: async () => ({
        ts: '2026-03-11T12:00:00.000Z',
        marketCents: 11900
      }),
      sendNotificationEmail,
      markAlertTriggered
    });

    const result = await handler(event);
    expect(result.processedCardCount).toBe(1);
    expect(result.triggeredAlertCount).toBe(1);
    expect(result.sentNotificationCount).toBe(1);
    expect(sendNotificationEmail).toHaveBeenCalledTimes(1);
    expect(markAlertTriggered).toHaveBeenCalledTimes(1);
  });

  it('suppresses notifications within cooldown window', async () => {
    const sendNotificationEmail = vi.fn(async () => {});

    const handler = createAlertsEvalHandler({
      now: () => '2026-03-12T12:01:00.000Z',
      listEnabledAlertsByCard: async () => [
        {
          alertId: 'a1',
          userId: 'u1',
          cardId: 'sv3-198',
          type: 'PRICE_ABOVE',
          thresholdCents: 12000,
          cooldownHours: 24,
          notifyEmail: 'user@example.com',
          enabled: true,
          lastTriggeredAt: '2026-03-12T11:30:00.000Z'
        }
      ],
      getCurrentPricePoint: async () => ({
        ts: '2026-03-12T11:50:00.000Z',
        marketCents: 12100
      }),
      getPreviousPrice: async () => ({
        ts: '2026-03-11T12:00:00.000Z',
        marketCents: 11900
      }),
      sendNotificationEmail,
      markAlertTriggered: async () => {}
    });

    const result = await handler(event);
    expect(result.triggeredAlertCount).toBe(0);
    expect(result.sentNotificationCount).toBe(0);
    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });

  it('bubbles SES send failures', async () => {
    const handler = createAlertsEvalHandler({
      now: () => '2026-03-12T12:01:00.000Z',
      listEnabledAlertsByCard: async () => [
        {
          alertId: 'a1',
          userId: 'u1',
          cardId: 'sv3-198',
          type: 'PRICE_ABOVE',
          thresholdCents: 12000,
          cooldownHours: 24,
          notifyEmail: 'user@example.com',
          enabled: true
        }
      ],
      getCurrentPricePoint: async () => ({
        ts: '2026-03-12T11:50:00.000Z',
        marketCents: 12100
      }),
      getPreviousPrice: async () => ({
        ts: '2026-03-11T12:00:00.000Z',
        marketCents: 11900
      }),
      sendNotificationEmail: async () => {
        throw new Error('ses send failed');
      },
      markAlertTriggered: async () => {}
    });

    await expect(handler(event)).rejects.toThrow('ses send failed');
  });

  it('anchors previous lookup to current price timestamp instead of run asOf', async () => {
    const getPreviousPrice = vi.fn(async () => ({
      ts: '2026-03-11T12:00:00.000Z',
      marketCents: 11900
    }));

    const handler = createAlertsEvalHandler({
      now: () => '2026-03-12T12:01:00.000Z',
      listEnabledAlertsByCard: async () => [
        {
          alertId: 'a1',
          userId: 'u1',
          cardId: 'sv3-198',
          type: 'PRICE_ABOVE',
          thresholdCents: 12000,
          cooldownHours: 24,
          notifyEmail: 'user@example.com',
          enabled: true
        }
      ],
      getCurrentPricePoint: async () => ({
        ts: '2026-03-12T11:50:00.000Z',
        marketCents: 12100
      }),
      getPreviousPrice,
      sendNotificationEmail: async () => {},
      markAlertTriggered: async () => {}
    });

    await handler({
      ...event,
      asOf: '2026-03-12T12:00:00.000Z'
    });

    expect(getPreviousPrice).toHaveBeenCalledWith('sv3-198', '2026-03-12T11:50:00.000Z');
  });
});
