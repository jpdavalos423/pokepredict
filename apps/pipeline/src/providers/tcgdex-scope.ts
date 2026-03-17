export interface TcgdexSetSummary {
  id?: string;
  serie?: { id?: string };
  series?: { id?: string };
}

interface TcgdexSeriesSetSummary {
  id?: string;
}

export interface TcgdexExcludedSetResolution {
  excludedSetIds: Set<string>;
  matchedSeriesIds: Set<string>;
  totalSetsParsed: number;
}

export interface TcgdexPaginationResult {
  hasNextPage: boolean;
  nextPage?: number;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

export function parseCsvList(value: string): string[] {
  const deduped = new Set<string>();
  for (const token of value.split(',')) {
    const normalized = normalizeToken(token);
    if (normalized.length > 0) {
      deduped.add(normalized);
    }
  }
  return [...deduped];
}

export function normalizeSetId(setId: string): string {
  return normalizeToken(setId);
}

export function extractSetIdFromCardId(cardId: string): string | undefined {
  const trimmed = cardId.trim();
  if (!trimmed) {
    return undefined;
  }

  const splitIndex = trimmed.indexOf('-');
  if (splitIndex <= 0) {
    return undefined;
  }

  return normalizeSetId(trimmed.slice(0, splitIndex));
}

export function extractTcgdexSetSummaries(payload: unknown): TcgdexSetSummary[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (entry): entry is TcgdexSetSummary => typeof entry === 'object' && entry !== null
    );
  }

  if (typeof payload !== 'object' || payload === null) {
    return [];
  }

  const objectPayload = payload as Record<string, unknown>;
  const candidates = [objectPayload.sets, objectPayload.items, objectPayload.data, objectPayload.results];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    return candidate.filter(
      (entry): entry is TcgdexSetSummary => typeof entry === 'object' && entry !== null
    );
  }

  return [];
}

export function extractTcgdexSetIdsFromSeriesPayload(payload: unknown): Set<string> {
  const setIds = new Set<string>();
  if (typeof payload !== 'object' || payload === null) {
    return setIds;
  }

  const objectPayload = payload as Record<string, unknown>;
  const seriesSets = objectPayload.sets;
  if (!Array.isArray(seriesSets)) {
    return setIds;
  }

  for (const setEntry of seriesSets) {
    if (typeof setEntry === 'string' && setEntry.trim().length > 0) {
      setIds.add(normalizeSetId(setEntry));
      continue;
    }
    if (typeof setEntry !== 'object' || setEntry === null) {
      continue;
    }
    const setId = (setEntry as TcgdexSeriesSetSummary).id;
    if (typeof setId !== 'string' || setId.trim().length === 0) {
      continue;
    }
    setIds.add(normalizeSetId(setId));
  }

  return setIds;
}

export function parseTcgdexPagination(
  payload: unknown,
  currentPage: number,
  observedCount: number
): TcgdexPaginationResult {
  let hasNextPage = observedCount > 0;
  let nextPage: number | undefined;

  if (typeof payload === 'object' && payload !== null) {
    const objectPayload = payload as Record<string, unknown>;
    const directNextPage = objectPayload.nextPage;

    if (typeof directNextPage === 'number' && Number.isFinite(directNextPage) && directNextPage > currentPage) {
      hasNextPage = true;
      nextPage = directNextPage;
    } else if (typeof directNextPage === 'string') {
      const parsed = Number.parseInt(directNextPage, 10);
      if (Number.isFinite(parsed) && parsed > currentPage) {
        hasNextPage = true;
        nextPage = parsed;
      }
    }

    const pagination = objectPayload.pagination;
    if (typeof pagination === 'object' && pagination !== null) {
      const page =
        typeof (pagination as Record<string, unknown>).page === 'number'
          ? (pagination as Record<string, unknown>).page as number
          : currentPage;
      const totalPagesRaw =
        (pagination as Record<string, unknown>).pageCount ??
        (pagination as Record<string, unknown>).totalPages;
      const totalPages = typeof totalPagesRaw === 'number' ? totalPagesRaw : undefined;
      const explicitHasNext = (pagination as Record<string, unknown>).hasNextPage;

      if (typeof explicitHasNext === 'boolean') {
        hasNextPage = explicitHasNext;
      } else if (typeof totalPages === 'number') {
        hasNextPage = page < totalPages;
      }

      if (hasNextPage && nextPage === undefined) {
        nextPage = page + 1;
      }
    }
  }

  const result: TcgdexPaginationResult = {
    hasNextPage
  };
  if (nextPage !== undefined) {
    result.nextPage = nextPage;
  }
  return result;
}

export function resolveExcludedSetIdsFromPayload(
  payload: unknown,
  excludedSeriesIds: readonly string[]
): TcgdexExcludedSetResolution {
  const normalizedSeries = new Set(excludedSeriesIds.map(normalizeToken).filter(Boolean));
  if (normalizedSeries.size === 0) {
    return {
      excludedSetIds: new Set<string>(),
      matchedSeriesIds: new Set<string>(),
      totalSetsParsed: 0
    };
  }

  const excludedSetIds = new Set<string>();
  const matchedSeriesIds = new Set<string>();
  const sets = extractTcgdexSetSummaries(payload);

  for (const setSummary of sets) {
    if (typeof setSummary.id !== 'string' || setSummary.id.trim().length === 0) {
      continue;
    }

    const seriesIdCandidate =
      typeof setSummary.serie?.id === 'string'
        ? setSummary.serie.id
        : typeof setSummary.series?.id === 'string'
          ? setSummary.series.id
          : undefined;

    if (!seriesIdCandidate) {
      continue;
    }

    const normalizedSeriesId = normalizeToken(seriesIdCandidate);
    if (!normalizedSeries.has(normalizedSeriesId)) {
      continue;
    }

    matchedSeriesIds.add(normalizedSeriesId);
    excludedSetIds.add(normalizeSetId(setSummary.id));
  }

  return {
    excludedSetIds,
    matchedSeriesIds,
    totalSetsParsed: sets.length
  };
}

export function isExcludedSetId(setId: string | undefined, excludedSetIds: ReadonlySet<string>): boolean {
  if (!setId) {
    return false;
  }
  return excludedSetIds.has(normalizeSetId(setId));
}
