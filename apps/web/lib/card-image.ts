const LEGACY_UNREACHABLE_IMAGE_HOSTS = new Set(['images.pokepredict.dev']);
const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|webp|avif|gif)$/i;

function normalizeUrlCandidate(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isLegacyUnreachableUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return LEGACY_UNREACHABLE_IMAGE_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function isTcgdexAssetUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase() === 'assets.tcgdex.net';
  } catch {
    return false;
  }
}

function buildTcgdexVariantUrls(url: string): string[] {
  if (!isTcgdexAssetUrl(url)) {
    return [];
  }

  const normalized = url.trim().replace(/\/+$/g, '');
  if (IMAGE_EXTENSION_PATTERN.test(normalized)) {
    return [normalized];
  }

  return [
    `${normalized}/high.webp`,
    `${normalized}/high.png`,
    `${normalized}/low.webp`,
    `${normalized}/low.png`
  ];
}

function normalizePokemonTcgSetId(setId: string): string {
  const trimmed = setId.trim().toLowerCase();
  const scarletVioletMatch = trimmed.match(/^sv0([1-9])$/);
  if (scarletVioletMatch?.[1]) {
    return `sv${scarletVioletMatch[1]}`;
  }
  return trimmed;
}

function buildPokemonTcgNumberVariants(number: string): string[] {
  const trimmed = number.trim();
  if (!trimmed) {
    return [];
  }

  const variants = [trimmed];
  if (/^\d+$/.test(trimmed)) {
    variants.push(String(Number.parseInt(trimmed, 10)));
  }

  return [...new Set(variants)];
}

function buildPublicFallbackUrls(setId: string, number: string): string[] {
  const normalizedSetId = setId.trim();
  const normalizedNumber = number.trim();
  if (!normalizedSetId || !normalizedNumber) {
    return [];
  }

  const setIdCandidates = [normalizedSetId, normalizePokemonTcgSetId(normalizedSetId)];
  const numberCandidates = buildPokemonTcgNumberVariants(normalizedNumber);
  const candidates: string[] = [];

  for (const setCandidate of setIdCandidates) {
    const encodedSetId = encodeURIComponent(setCandidate);
    for (const numberCandidate of numberCandidates) {
      const encodedNumber = encodeURIComponent(numberCandidate);
      candidates.push(`https://images.pokemontcg.io/${encodedSetId}/${encodedNumber}_hires.png`);
      candidates.push(`https://images.pokemontcg.io/${encodedSetId}/${encodedNumber}.png`);
    }
  }

  return candidates;
}

export interface BuildCardImageCandidatesInput {
  imageUrl?: string | undefined;
  setId: string;
  number: string;
}

export function buildCardImageCandidates(input: BuildCardImageCandidatesInput): string[] {
  const candidates: string[] = [];
  const normalizedPrimary = normalizeUrlCandidate(input.imageUrl);

  if (normalizedPrimary && !isLegacyUnreachableUrl(normalizedPrimary)) {
    const tcgdexVariants = buildTcgdexVariantUrls(normalizedPrimary);
    if (tcgdexVariants.length > 0) {
      candidates.push(...tcgdexVariants);
    }
    candidates.push(normalizedPrimary);
  }

  candidates.push(...buildPublicFallbackUrls(input.setId, input.number));
  return [...new Set(candidates)];
}
