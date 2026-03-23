import { describe, expect, it } from 'vitest';
import {
  mapTcgdexCardToRawRecord,
  translateTcgdexCardId
} from '../src/providers/tcgdex-source';

const AS_OF = '2026-03-10T06:00:00.000Z';

function createCard() {
  return {
    id: 'sv3-198',
    localId: '198',
    set: { id: 'sv3' },
    pricing: {
      tcgplayer: {
        updated: '2026-03-09T04:05:06.000Z',
        normal: {
          marketPrice: 112.34,
          lowPrice: 98,
          highPrice: 130
        }
      }
    }
  };
}

describe('tcgdex mapper', () => {
  it('maps valid tcgplayer.normal pricing into canonical raw record', () => {
    const mapped = mapTcgdexCardToRawRecord(createCard(), AS_OF);

    expect(mapped.skipReason).toBeUndefined();
    expect(mapped.usedFallbackTimestamp).toBe(false);
    expect(mapped.record).toEqual({
      sourceCardId: 'sv3-198',
      recordedAt: '2026-03-09T04:05:06.000Z',
      marketPrice: 112.34,
      lowPrice: 98,
      highPrice: 130,
      currency: 'USD'
    });
  });

  it('skips card when pricing is missing', () => {
    const card = createCard();
    delete card.pricing;

    const mapped = mapTcgdexCardToRawRecord(card, AS_OF);
    expect(mapped.skipReason).toBe('missing pricing');
  });

  it('skips card when tcgplayer provider is missing', () => {
    const card = createCard();
    delete card.pricing.tcgplayer;

    const mapped = mapTcgdexCardToRawRecord(card, AS_OF);
    expect(mapped.skipReason).toBe('missing tcgplayer provider');
  });

  it('skips card when normal variant is missing', () => {
    const card = createCard();
    delete card.pricing.tcgplayer.normal;

    const mapped = mapTcgdexCardToRawRecord(card, AS_OF);
    expect(mapped.skipReason).toBe('missing normal variant');
  });

  it('skips card when marketPrice is missing', () => {
    const card = createCard();
    delete card.pricing.tcgplayer.normal.marketPrice;

    const mapped = mapTcgdexCardToRawRecord(card, AS_OF);
    expect(mapped.skipReason).toBe('missing marketPrice');
  });

  it('falls back to pipeline timestamp when tcgplayer.updated is invalid', () => {
    const card = createCard();
    card.pricing.tcgplayer.updated = 'not-a-date';

    const mapped = mapTcgdexCardToRawRecord(card, AS_OF);
    expect(mapped.skipReason).toBeUndefined();
    expect(mapped.usedFallbackTimestamp).toBe(true);
    expect(mapped.record?.recordedAt).toBe(AS_OF);
  });

  it('skips card with unknown card ID when translation fails', () => {
    const card = createCard();
    card.id = 'bad/id';
    delete card.localId;
    delete card.set;

    const mapped = mapTcgdexCardToRawRecord(card, AS_OF);
    expect(mapped.skipReason).toBe('unknown card ID');
  });

  it('translates IDs deterministically from set.id + localId fallback', () => {
    const card = createCard();
    card.id = 'bad/id';
    card.set = { id: 'SV3' };
    card.localId = 'TG30';

    expect(translateTcgdexCardId(card)).toBe('sv3-TG30');
  });

  it('supports dotted and hyphenated set IDs', () => {
    const dotted = createCard();
    dotted.id = 'SV10.5W-086';
    expect(translateTcgdexCardId(dotted)).toBe('sv10.5w-086');

    const hyphenated = createCard();
    hyphenated.id = 'bad/id';
    hyphenated.set = { id: 'P-A' };
    hyphenated.localId = '001';
    expect(translateTcgdexCardId(hyphenated)).toBe('p-a-001');
  });
});
