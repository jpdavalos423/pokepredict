import { describe, expect, it } from 'vitest';
import {
  extractTcgdexSetIdsFromSeriesPayload,
  extractSetIdFromCardId,
  isExcludedSetId,
  parseCsvList,
  resolveExcludedSetIdsFromPayload
} from '../src/providers/tcgdex-scope';

describe('tcgdex scope helpers', () => {
  it('parses CSV series IDs with normalization and dedupe', () => {
    expect(parseCsvList(' tcgp,me,TCGP ,, me ')).toEqual(['tcgp', 'me']);
  });

  it('extracts set IDs from card IDs', () => {
    expect(extractSetIdFromCardId('A1-001')).toBe('a1');
    expect(extractSetIdFromCardId('sv3-198')).toBe('sv3');
    expect(extractSetIdFromCardId('invalid')).toBeUndefined();
  });

  it('resolves excluded set IDs from set payload metadata', () => {
    const resolved = resolveExcludedSetIdsFromPayload(
      [
        { id: 'A1', serie: { id: 'tcgp' } },
        { id: 'A2', serie: { id: 'tcgp' } },
        { id: 'sv3', serie: { id: 'sv' } }
      ],
      ['tcgp']
    );

    expect(resolved.totalSetsParsed).toBe(3);
    expect(resolved.matchedSeriesIds.has('tcgp')).toBe(true);
    expect(resolved.excludedSetIds).toEqual(new Set(['a1', 'a2']));
    expect(isExcludedSetId('A1', resolved.excludedSetIds)).toBe(true);
    expect(isExcludedSetId('sv3', resolved.excludedSetIds)).toBe(false);
  });

  it('extracts set IDs from series payload metadata', () => {
    const setIds = extractTcgdexSetIdsFromSeriesPayload({
      id: 'tcgp',
      sets: [
        { id: 'A1' },
        { id: 'P-A' }
      ]
    });

    expect(setIds).toEqual(new Set(['a1', 'p-a']));
  });
});
