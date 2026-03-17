import { describe, expect, it } from 'vitest';
import { normalizeCardRarity } from '../src/data/read-repository';

describe('normalizeCardRarity', () => {
  it('maps None rarity to Promo for promo sets', () => {
    expect(normalizeCardRarity('None', 'SVP Black Star Promos')).toBe('Promo');
    expect(normalizeCardRarity('none', 'XY Black Star Promos')).toBe('Promo');
  });

  it('drops None rarity for non-promo sets', () => {
    expect(normalizeCardRarity('None', 'Obsidian Flames')).toBeUndefined();
  });

  it('preserves non-None rarity values', () => {
    expect(normalizeCardRarity('Ultra Rare', 'SVP Black Star Promos')).toBe('Ultra Rare');
  });

  it('returns undefined for empty or missing values', () => {
    expect(normalizeCardRarity('', 'SVP Black Star Promos')).toBeUndefined();
    expect(normalizeCardRarity('   ', 'SVP Black Star Promos')).toBeUndefined();
    expect(normalizeCardRarity(undefined, 'SVP Black Star Promos')).toBeUndefined();
  });
});
