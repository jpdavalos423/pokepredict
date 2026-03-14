import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  TransactWriteCommand
} from '@aws-sdk/lib-dynamodb';
import {
  alertsEvalResultSchema,
  computeSignalsResultSchema,
  type AlertsEvalResult,
  type AlertType,
  type ComputeSignalsResult
} from '@pokepredict/shared';
import { loadPipelineConfig } from '../config/env';
import { logInfo } from './common';

interface AlertForEval {
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

interface PricePointForEval {
  ts: string;
  marketCents: number;
}

export interface AlertsEvalDependencies {
  now: () => string;
  listEnabledAlertsByCard: (cardId: string) => Promise<AlertForEval[]>;
  getCurrentPricePoint: (cardId: string, asOfIso: string) => Promise<PricePointForEval | null>;
  getPreviousPrice: (cardId: string, beforeIso: string) => Promise<PricePointForEval | null>;
  sendNotificationEmail: (
    alert: AlertForEval,
    currentMarketCents: number,
    previousMarketCents: number,
    asOf: string
  ) => Promise<void>;
  markAlertTriggered: (alert: AlertForEval, triggeredAt: string) => Promise<void>;
}

function parseIsoMillis(value: string): number {
  const millis = Date.parse(value);
  if (Number.isNaN(millis)) {
    throw new Error(`Invalid ISO timestamp: ${value}`);
  }
  return millis;
}

export function isCooldownActive(
  lastTriggeredAt: string | undefined,
  cooldownHours: number,
  nowIso: string
): boolean {
  if (!lastTriggeredAt) {
    return false;
  }

  const lastMillis = parseIsoMillis(lastTriggeredAt);
  const nowMillis = parseIsoMillis(nowIso);
  const expiresAt = lastMillis + cooldownHours * 60 * 60 * 1000;
  return nowMillis < expiresAt;
}

export function shouldTriggerCrossing(
  type: AlertType,
  previousMarketCents: number,
  currentMarketCents: number,
  thresholdCents: number
): boolean {
  if (type === 'PRICE_ABOVE') {
    return previousMarketCents <= thresholdCents && currentMarketCents > thresholdCents;
  }

  return previousMarketCents >= thresholdCents && currentMarketCents < thresholdCents;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required field ${field}.`);
  }
  return value;
}

function asNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Missing required field ${field}.`);
  }
  return value;
}

function asBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Missing required field ${field}.`);
  }
  return value;
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return value;
}

function toAlertForEval(item: Record<string, unknown>): AlertForEval {
  const alert: AlertForEval = {
    alertId: asString(item.alertId, 'alertId'),
    userId: asString(item.userId, 'userId'),
    cardId: asString(item.cardId, 'cardId'),
    type: asString(item.type, 'type') as AlertType,
    thresholdCents: asNumber(item.thresholdCents, 'thresholdCents'),
    cooldownHours: asNumber(item.cooldownHours, 'cooldownHours'),
    notifyEmail: asString(item.notifyEmail, 'notifyEmail'),
    enabled: asBoolean(item.enabled, 'enabled')
  };

  const lastTriggeredAt = asOptionalString(item.lastTriggeredAt);
  if (lastTriggeredAt !== undefined) {
    alert.lastTriggeredAt = lastTriggeredAt;
  }

  return alert;
}

function toPricePointForEval(item: Record<string, unknown>): PricePointForEval {
  return {
    ts: asString(item.ts, 'ts'),
    marketCents: asNumber(item.marketCents, 'marketCents')
  };
}

export function createAlertsEvalHandler(
  deps: AlertsEvalDependencies
): (event: ComputeSignalsResult) => Promise<AlertsEvalResult> {
  return async function alertsEvalHandler(event: ComputeSignalsResult): Promise<AlertsEvalResult> {
    const input = computeSignalsResultSchema.parse(event);
    const cardIds = [...new Set(input.updatedCardIds)];

    let triggeredAlertCount = 0;
    let sentNotificationCount = 0;

    for (const cardId of cardIds) {
      const alerts = (await deps.listEnabledAlertsByCard(cardId)).filter((alert) => alert.enabled);
      if (alerts.length === 0) {
        continue;
      }

      const current = await deps.getCurrentPricePoint(cardId, input.asOf);
      if (!current) {
        continue;
      }

      const previous = await deps.getPreviousPrice(cardId, current.ts);
      if (!previous) {
        continue;
      }

      for (const alert of alerts) {
        const nowIso = deps.now();
        if (isCooldownActive(alert.lastTriggeredAt, alert.cooldownHours, nowIso)) {
          continue;
        }

        if (
          !shouldTriggerCrossing(
            alert.type,
            previous.marketCents,
            current.marketCents,
            alert.thresholdCents
          )
        ) {
          continue;
        }

        triggeredAlertCount += 1;
        await deps.sendNotificationEmail(
          alert,
          current.marketCents,
          previous.marketCents,
          current.ts
        );
        sentNotificationCount += 1;
        await deps.markAlertTriggered(alert, nowIso);
      }
    }

    const result: AlertsEvalResult = {
      runId: input.runId,
      asOf: input.asOf,
      source: input.source,
      mode: input.mode,
      startedAt: input.startedAt,
      processedCardCount: cardIds.length,
      triggeredAlertCount,
      sentNotificationCount
    };

    alertsEvalResultSchema.parse(result);

    logInfo('Evaluated alerts and delivered notifications.', {
      step: 'AlertsEval',
      runId: input.runId,
      processedCardCount: result.processedCardCount,
      triggeredAlertCount: result.triggeredAlertCount,
      sentNotificationCount: result.sentNotificationCount
    });

    return result;
  };
}

function createDefaultDependencies(): AlertsEvalDependencies {
  const cfg = loadPipelineConfig();
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: cfg.awsRegion }));
  const ses = new SESv2Client({ region: cfg.awsRegion });

  return {
    now: () => new Date().toISOString(),
    listEnabledAlertsByCard: async (cardId: string) => {
      const response = await ddb.send(
        new QueryCommand({
          TableName: cfg.tables.alertsByCard,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :alertPrefix)',
          ExpressionAttributeValues: {
            ':pk': `CARD#${cardId}`,
            ':alertPrefix': 'ALERT#'
          },
          ScanIndexForward: false
        })
      );

      return (response.Items ?? []).map((item) => toAlertForEval(item as Record<string, unknown>));
    },
    getCurrentPricePoint: async (cardId: string, asOfIso: string) => {
      const response = await ddb.send(
        new QueryCommand({
          TableName: cfg.tables.prices,
          KeyConditionExpression: 'pk = :pk AND sk <= :beforeOrAt',
          ExpressionAttributeValues: {
            ':pk': `CARD#${cardId}`,
            ':beforeOrAt': `TS#${asOfIso}`
          },
          ScanIndexForward: false,
          Limit: 1
        })
      );

      const item = response.Items?.[0] as Record<string, unknown> | undefined;
      return item ? toPricePointForEval(item) : null;
    },
    getPreviousPrice: async (cardId: string, beforeIso: string) => {
      const response = await ddb.send(
        new QueryCommand({
          TableName: cfg.tables.prices,
          KeyConditionExpression: 'pk = :pk AND sk < :before',
          ExpressionAttributeValues: {
            ':pk': `CARD#${cardId}`,
            ':before': `TS#${beforeIso}`
          },
          ScanIndexForward: false,
          Limit: 1
        })
      );

      const item = response.Items?.[0] as Record<string, unknown> | undefined;
      if (!item) {
        return null;
      }

      return toPricePointForEval(item);
    },
    sendNotificationEmail: async (alert, currentMarketCents, previousMarketCents, asOf) => {
      await ses.send(
        new SendEmailCommand({
          FromEmailAddress: cfg.sesFromEmail,
          Destination: {
            ToAddresses: [alert.notifyEmail]
          },
          Content: {
            Simple: {
              Subject: {
                Data: `PokePredict alert: ${alert.type} on ${alert.cardId}`
              },
              Body: {
                Text: {
                  Data: [
                    `Alert ID: ${alert.alertId}`,
                    `Card: ${alert.cardId}`,
                    `Type: ${alert.type}`,
                    `Threshold: ${alert.thresholdCents} cents`,
                    `Previous: ${previousMarketCents} cents`,
                    `Current: ${currentMarketCents} cents`,
                    `As Of: ${asOf}`
                  ].join('\n')
                }
              }
            }
          }
        })
      );
    },
    markAlertTriggered: async (alert, triggeredAt) => {
      await ddb.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: cfg.tables.alertsByUser,
                Key: {
                  pk: `USER#${alert.userId}`,
                  sk: `ALERT#${alert.alertId}`
                },
                ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
                UpdateExpression: [
                  'SET lastTriggeredAt = :lastTriggeredAt',
                  'updatedAt = :updatedAt',
                  'version = if_not_exists(version, :zero) + :one'
                ].join(', '),
                ExpressionAttributeValues: {
                  ':lastTriggeredAt': triggeredAt,
                  ':updatedAt': triggeredAt,
                  ':zero': 0,
                  ':one': 1
                }
              }
            },
            {
              Update: {
                TableName: cfg.tables.alertsByCard,
                Key: {
                  pk: `CARD#${alert.cardId}`,
                  sk: `ALERT#${alert.alertId}`
                },
                ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
                UpdateExpression: [
                  'SET lastTriggeredAt = :lastTriggeredAt',
                  'updatedAt = :updatedAt',
                  'version = if_not_exists(version, :zero) + :one'
                ].join(', '),
                ExpressionAttributeValues: {
                  ':lastTriggeredAt': triggeredAt,
                  ':updatedAt': triggeredAt,
                  ':zero': 0,
                  ':one': 1
                }
              }
            }
          ]
        })
      );
    }
  };
}

let defaultHandler: ((event: ComputeSignalsResult) => Promise<AlertsEvalResult>) | undefined;

export async function handler(event: ComputeSignalsResult): Promise<AlertsEvalResult> {
  if (!defaultHandler) {
    defaultHandler = createAlertsEvalHandler(createDefaultDependencies());
  }

  return defaultHandler(event);
}
