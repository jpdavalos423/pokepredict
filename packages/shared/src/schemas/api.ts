import { z } from 'zod';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, PRICE_RANGES } from '../constants';

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
