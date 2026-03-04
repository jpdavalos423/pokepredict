import { z } from 'zod';
import {
  ALERT_TYPES,
  HOLDING_CONDITIONS,
  HOLDING_VARIANTS,
  SUPPORTED_CURRENCIES
} from '../constants';

export const cardSchema = z.object({
  cardId: z.string().min(1),
  name: z.string().min(1),
  set: z.object({
    id: z.string().min(1),
    name: z.string().min(1)
  }),
  number: z.string().min(1),
  rarity: z.string().optional(),
  imageUrl: z.string().url().optional()
});

export const pricePointSchema = z.object({
  cardId: z.string().min(1),
  ts: z.string().datetime(),
  marketCents: z.int().nonnegative(),
  lowCents: z.int().nonnegative().optional(),
  highCents: z.int().nonnegative().optional(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  source: z.string().min(1)
});

export const holdingSchema = z.object({
  holdingId: z.string().min(1),
  userId: z.string().min(1),
  cardId: z.string().min(1),
  qty: z.number().positive(),
  variant: z.enum(HOLDING_VARIANTS),
  grade: z.string().nullable(),
  condition: z.enum(HOLDING_CONDITIONS),
  buyPriceCents: z.int().nonnegative(),
  buyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(500).optional()
});

export const alertSchema = z.object({
  alertId: z.string().min(1),
  userId: z.string().min(1),
  cardId: z.string().min(1),
  type: z.enum(ALERT_TYPES),
  thresholdCents: z.int().positive(),
  cooldownHours: z.int().positive(),
  notifyEmail: z.string().email(),
  enabled: z.boolean(),
  lastTriggeredAt: z.string().datetime().optional()
});

export const startRunInputSchema = z.object({
  source: z.string().min(1),
  mode: z.enum(['scheduled', 'manual']),
  runId: z.string().min(1).optional(),
  asOf: z.string().datetime().optional()
});

export const startRunResultSchema = z.object({
  runId: z.string().min(1),
  asOf: z.string().datetime(),
  source: z.string().min(1),
  mode: z.enum(['scheduled', 'manual']),
  startedAt: z.string().datetime()
});

export const rawPriceRecordSchema = z.object({
  sourceCardId: z.string().min(1),
  recordedAt: z.string().datetime(),
  marketPrice: z.number().nonnegative(),
  lowPrice: z.number().nonnegative().optional(),
  highPrice: z.number().nonnegative().optional(),
  currency: z.enum(SUPPORTED_CURRENCIES)
});

export const rawFetchPayloadSchema = z.object({
  runId: z.string().min(1),
  asOf: z.string().datetime(),
  source: z.string().min(1),
  mode: z.enum(['scheduled', 'manual']),
  records: z.array(rawPriceRecordSchema)
});

export const fetchRawResultSchema = z.object({
  runId: z.string().min(1),
  asOf: z.string().datetime(),
  source: z.string().min(1),
  mode: z.enum(['scheduled', 'manual']),
  startedAt: z.string().datetime(),
  rawS3Key: z.string().min(1),
  rawRecordCount: z.number().int().nonnegative(),
  fetchedAt: z.string().datetime()
});

export const normalizeResultSchema = z.object({
  runId: z.string().min(1),
  asOf: z.string().datetime(),
  source: z.string().min(1),
  mode: z.enum(['scheduled', 'manual']),
  startedAt: z.string().datetime(),
  processedCount: z.number().int().nonnegative(),
  updatedCardIds: z.array(z.string().min(1))
});
