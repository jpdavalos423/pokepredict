import { describe, expect, it } from 'vitest';
import { buildCardImageCandidates } from '../lib/card-image';

describe('buildCardImageCandidates', () => {
  it('keeps provided primary URL first when host is not legacy', () => {
    const result = buildCardImageCandidates({
      imageUrl: 'https://cdn.example.com/cards/sv3-169.png',
      setId: 'sv3',
      number: '169'
    });

    expect(result[0]).toBe('https://cdn.example.com/cards/sv3-169.png');
    expect(result).toContain('https://images.pokemontcg.io/sv3/169_hires.png');
  });

  it('drops legacy unreachable host and uses fallback sources', () => {
    const result = buildCardImageCandidates({
      imageUrl: 'https://images.pokepredict.dev/cards/sv3-169.png',
      setId: 'sv3',
      number: '169'
    });

    expect(result).not.toContain('https://images.pokepredict.dev/cards/sv3-169.png');
    expect(result[0]).toBe('https://images.pokemontcg.io/sv3/169_hires.png');
  });

  it('expands tcgdex base asset URLs into concrete image variants first', () => {
    const result = buildCardImageCandidates({
      imageUrl: 'https://assets.tcgdex.net/en/sv/sv01/001',
      setId: 'sv01',
      number: '001'
    });

    expect(result[0]).toBe('https://assets.tcgdex.net/en/sv/sv01/001/high.webp');
    expect(result).toContain('https://assets.tcgdex.net/en/sv/sv01/001/high.png');
  });

  it('normalizes sv0X + zero-padded numbers for pokemontcg fallbacks', () => {
    const result = buildCardImageCandidates({
      imageUrl: undefined,
      setId: 'sv01',
      number: '001'
    });

    expect(result).toContain('https://images.pokemontcg.io/sv1/1_hires.png');
  });

  it('returns no candidates when inputs are blank', () => {
    const result = buildCardImageCandidates({
      imageUrl: undefined,
      setId: '',
      number: ''
    });

    expect(result).toEqual([]);
  });
});
