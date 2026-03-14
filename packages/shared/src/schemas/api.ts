import { z } from 'zod';
import {
  ALERT_TYPES,
  DEFAULT_PAGE_LIMIT,
  HOLDING_CONDITIONS,
  HOLDING_VARIANTS,
  MAX_PAGE_LIMIT,
  PRICE_RANGES
} from '../constants';

const optionalTrimmedString = z
  .preprocess((value) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().min(1))
  .optional();

export const cardsListQuerySchema = z
  .object({
    set: optionalTrimmedString,
    query: optionalTrimmedString,
    limit: z.preprocess((value) => value ?? DEFAULT_PAGE_LIMIT, z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT)),
    cursor: optionalTrimmedString
  })
  .superRefine((input, ctx) => {
    if (!input.set && !input.query) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one of set or query is required.',
        path: ['query']
      });
      return;
    }

    if (!input.set && input.query && input.query.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Query must be at least 2 characters when set is omitted.',
        path: ['query']
      });
    }

    if (input.set && input.query && input.query.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Query must be at least 1 character when set is present.',
        path: ['query']
      });
    }
  });

export const priceRangeSchema = z.enum(PRICE_RANGES);

export const idempotencyKeyHeaderSchema = z.string().trim().min(1).max(256);

export const createHoldingRequestSchema = z.object({
  cardId: z.string().min(1),
  qty: z.number().int().positive(),
  variant: z.enum(HOLDING_VARIANTS),
  grade: z.string().nullable(),
  condition: z.enum(HOLDING_CONDITIONS),
  buyPriceCents: z.int().nonnegative(),
  buyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(500).optional()
});

export const portfolioSummarySchema = z.object({
  totalCostBasisCents: z.int(),
  totalMarketValueCents: z.int(),
  unrealizedPnLCents: z.int(),
  unrealizedPnLBps: z.int()
});

export const latestPriceResponseSchema = z.object({
  cardId: z.string().min(1),
  asOf: z.string().datetime(),
  marketCents: z.int().nonnegative(),
  lowCents: z.int().nonnegative().optional(),
  highCents: z.int().nonnegative().optional(),
  currency: z.literal('USD'),
  source: z.string().min(1)
});

export const holdingResponseSchema = createHoldingRequestSchema.extend({
  holdingId: z.string().min(1),
  userId: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.int().nonnegative(),
  requestHash: z.string().min(1).optional()
});

export const portfolioHoldingValuationSchema = holdingResponseSchema.extend({
  costBasisCents: z.int(),
  marketValueCents: z.int(),
  unrealizedPnLCents: z.int(),
  unrealizedPnLBps: z.int(),
  latestPrice: latestPriceResponseSchema.nullable()
});

export const portfolioResponseSchema = z.object({
  summary: portfolioSummarySchema,
  holdings: z.array(portfolioHoldingValuationSchema)
});

export const createAlertRequestSchema = z.object({
  cardId: z.string().min(1),
  type: z.enum(ALERT_TYPES),
  thresholdCents: z.int().positive(),
  cooldownHours: z.int().positive(),
  notifyEmail: z.string().email()
});

export const alertResponseSchema = createAlertRequestSchema.extend({
  alertId: z.string().min(1),
  userId: z.string().min(1),
  enabled: z.boolean(),
  lastTriggeredAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.int().nonnegative(),
  requestHash: z.string().min(1).optional()
});

export const alertsListResponseSchema = z.object({
  alerts: z.array(alertResponseSchema)
});

export const cursorPayloadParamsSchema = z
  .object({
    set: z.string().min(1).optional(),
    query: z.string().min(1).optional()
  })
  .strict();

export const cursorPayloadV1Schema = z
  .object({
    v: z.literal(1),
    route: z.string().min(1),
    index: z.enum(['gsi1', 'gsi2']),
    params: cursorPayloadParamsSchema,
    limit: z.number().int().min(1).max(MAX_PAGE_LIMIT),
    lek: z.record(z.string(), z.unknown())
  })
  .strict();
