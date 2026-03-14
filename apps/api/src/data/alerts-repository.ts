import {
  GetCommand,
  type DynamoDBDocumentClient,
  QueryCommand,
  TransactWriteCommand
} from '@aws-sdk/lib-dynamodb';
import type { AlertResponse } from '@pokepredict/shared';
import type { ApiConfig } from '../config';

export interface AlertIdempotencyAliasRecord {
  userId: string;
  idempotencyKey: string;
  alertId: string;
  requestHash: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  entityType: 'IDEMP';
}

export interface CreateAlertWithIdempotencyInput {
  alert: AlertResponse;
  idempotencyKey: string;
  requestHash: string;
}

export interface AlertsRepository {
  createAlert(alert: AlertResponse): Promise<void>;
  createAlertWithIdempotency(input: CreateAlertWithIdempotencyInput): Promise<void>;
  getAlert(userId: string, alertId: string): Promise<AlertResponse | null>;
  deleteAlert(alert: AlertResponse): Promise<void>;
  getIdempotencyAlias(
    userId: string,
    idempotencyKey: string
  ): Promise<AlertIdempotencyAliasRecord | null>;
  listAlertsByUser(userId: string): Promise<AlertResponse[]>;
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

function toAlertResponse(item: Record<string, unknown>): AlertResponse {
  const alert: AlertResponse = {
    alertId: asString(item.alertId, 'alertId'),
    userId: asString(item.userId, 'userId'),
    cardId: asString(item.cardId, 'cardId'),
    type: asString(item.type, 'type') as AlertResponse['type'],
    thresholdCents: asNumber(item.thresholdCents, 'thresholdCents'),
    cooldownHours: asNumber(item.cooldownHours, 'cooldownHours'),
    notifyEmail: asString(item.notifyEmail, 'notifyEmail'),
    enabled: asBoolean(item.enabled, 'enabled'),
    createdAt: asString(item.createdAt, 'createdAt'),
    updatedAt: asString(item.updatedAt, 'updatedAt'),
    version: asNumber(item.version, 'version')
  };

  const lastTriggeredAt = asOptionalString(item.lastTriggeredAt);
  if (lastTriggeredAt !== undefined) {
    alert.lastTriggeredAt = lastTriggeredAt;
  }

  const requestHash = asOptionalString(item.requestHash);
  if (requestHash !== undefined) {
    alert.requestHash = requestHash;
  }

  return alert;
}

function toIdempotencyAliasRecord(item: Record<string, unknown>): AlertIdempotencyAliasRecord {
  return {
    userId: asString(item.userId, 'userId'),
    idempotencyKey: asString(item.idempotencyKey, 'idempotencyKey'),
    alertId: asString(item.alertId, 'alertId'),
    requestHash: asString(item.requestHash, 'requestHash'),
    createdAt: asString(item.createdAt, 'createdAt'),
    updatedAt: asString(item.updatedAt, 'updatedAt'),
    version: asNumber(item.version, 'version'),
    entityType: 'IDEMP'
  };
}

function alertUserItem(alert: AlertResponse): Record<string, unknown> {
  const item: Record<string, unknown> = {
    pk: `USER#${alert.userId}`,
    sk: `ALERT#${alert.alertId}`,
    entityType: 'ALERT',
    alertId: alert.alertId,
    userId: alert.userId,
    cardId: alert.cardId,
    type: alert.type,
    thresholdCents: alert.thresholdCents,
    cooldownHours: alert.cooldownHours,
    notifyEmail: alert.notifyEmail,
    enabled: alert.enabled,
    createdAt: alert.createdAt,
    updatedAt: alert.updatedAt,
    version: alert.version
  };

  if (alert.lastTriggeredAt !== undefined) {
    item.lastTriggeredAt = alert.lastTriggeredAt;
  }

  if (alert.requestHash !== undefined) {
    item.requestHash = alert.requestHash;
  }

  return item;
}

function alertCardItem(alert: AlertResponse): Record<string, unknown> {
  const item: Record<string, unknown> = {
    pk: `CARD#${alert.cardId}`,
    sk: `ALERT#${alert.alertId}`,
    entityType: 'ALERT',
    alertId: alert.alertId,
    userId: alert.userId,
    cardId: alert.cardId,
    type: alert.type,
    thresholdCents: alert.thresholdCents,
    cooldownHours: alert.cooldownHours,
    notifyEmail: alert.notifyEmail,
    enabled: alert.enabled,
    createdAt: alert.createdAt,
    updatedAt: alert.updatedAt,
    version: alert.version
  };

  if (alert.lastTriggeredAt !== undefined) {
    item.lastTriggeredAt = alert.lastTriggeredAt;
  }

  if (alert.requestHash !== undefined) {
    item.requestHash = alert.requestHash;
  }

  return item;
}

function idempotencyAliasItem(input: CreateAlertWithIdempotencyInput): Record<string, unknown> {
  return {
    pk: `USER#${input.alert.userId}`,
    sk: `IDEMP#${input.idempotencyKey}`,
    entityType: 'IDEMP',
    userId: input.alert.userId,
    idempotencyKey: input.idempotencyKey,
    alertId: input.alert.alertId,
    requestHash: input.requestHash,
    createdAt: input.alert.createdAt,
    updatedAt: input.alert.updatedAt,
    version: 1
  };
}

export class DynamoAlertsRepository implements AlertsRepository {
  constructor(
    private readonly ddb: DynamoDBDocumentClient,
    private readonly cfg: ApiConfig
  ) {}

  async createAlert(alert: AlertResponse): Promise<void> {
    await this.ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.cfg.tables.alertsByUser,
              Item: alertUserItem(alert),
              ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)'
            }
          },
          {
            Put: {
              TableName: this.cfg.tables.alertsByCard,
              Item: alertCardItem(alert),
              ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)'
            }
          }
        ]
      })
    );
  }

  async createAlertWithIdempotency(input: CreateAlertWithIdempotencyInput): Promise<void> {
    await this.ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.cfg.tables.alertsByUser,
              Item: alertUserItem(input.alert),
              ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)'
            }
          },
          {
            Put: {
              TableName: this.cfg.tables.alertsByCard,
              Item: alertCardItem(input.alert),
              ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)'
            }
          },
          {
            Put: {
              TableName: this.cfg.tables.alertsByUser,
              Item: idempotencyAliasItem(input),
              ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)'
            }
          }
        ]
      })
    );
  }

  async getAlert(userId: string, alertId: string): Promise<AlertResponse | null> {
    const response = await this.ddb.send(
      new GetCommand({
        TableName: this.cfg.tables.alertsByUser,
        Key: {
          pk: `USER#${userId}`,
          sk: `ALERT#${alertId}`
        }
      })
    );

    if (!response.Item) {
      return null;
    }

    return toAlertResponse(response.Item as Record<string, unknown>);
  }

  async deleteAlert(alert: AlertResponse): Promise<void> {
    await this.ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName: this.cfg.tables.alertsByUser,
              Key: {
                pk: `USER#${alert.userId}`,
                sk: `ALERT#${alert.alertId}`
              },
              ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)'
            }
          },
          {
            Delete: {
              TableName: this.cfg.tables.alertsByCard,
              Key: {
                pk: `CARD#${alert.cardId}`,
                sk: `ALERT#${alert.alertId}`
              },
              ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)'
            }
          }
        ]
      })
    );
  }

  async getIdempotencyAlias(
    userId: string,
    idempotencyKey: string
  ): Promise<AlertIdempotencyAliasRecord | null> {
    const response = await this.ddb.send(
      new GetCommand({
        TableName: this.cfg.tables.alertsByUser,
        Key: {
          pk: `USER#${userId}`,
          sk: `IDEMP#${idempotencyKey}`
        }
      })
    );

    if (!response.Item) {
      return null;
    }

    return toIdempotencyAliasRecord(response.Item as Record<string, unknown>);
  }

  async listAlertsByUser(userId: string): Promise<AlertResponse[]> {
    const response = await this.ddb.send(
      new QueryCommand({
        TableName: this.cfg.tables.alertsByUser,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :alertPrefix)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':alertPrefix': 'ALERT#'
        },
        ScanIndexForward: false
      })
    );

    return (response.Items ?? []).map((item) => toAlertResponse(item as Record<string, unknown>));
  }
}
