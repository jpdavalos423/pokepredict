import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_LIMIT,
  cardSchema,
  createSuccess,
  type Card
} from '../src';

describe('shared package smoke imports', () => {
  it('exports contracts and helpers', () => {
    const card: Card = {
      cardId: 'sv3-198',
      name: 'Venusaur ex',
      set: { id: 'sv3', name: '151' },
      number: '198'
    };

    expect(cardSchema.safeParse(card).success).toBe(true);
    expect(createSuccess(card).ok).toBe(true);
    expect(DEFAULT_PAGE_LIMIT).toBe(25);
  });
});
