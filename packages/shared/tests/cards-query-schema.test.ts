import { describe, expect, it } from 'vitest';
import { cardsListQuerySchema } from '../src/schemas/api';

describe('cards list query schema', () => {
  it('requires set or query', () => {
    const parsed = cardsListQuerySchema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  it('enforces query min length of 2 when set is absent', () => {
    const parsed = cardsListQuerySchema.safeParse({ query: 'a' });
    expect(parsed.success).toBe(false);
  });

  it('accepts query length >= 2 when set is absent', () => {
    const parsed = cardsListQuerySchema.safeParse({ query: 'ab' });
    expect(parsed.success).toBe(true);
  });

  it('accepts set+query where query length is 1', () => {
    const parsed = cardsListQuerySchema.safeParse({ set: 'sv3', query: 'a' });
    expect(parsed.success).toBe(true);
  });

  it('caps limit at 50', () => {
    const parsed = cardsListQuerySchema.safeParse({
      set: 'sv3',
      limit: '51'
    });
    expect(parsed.success).toBe(false);
  });
});
