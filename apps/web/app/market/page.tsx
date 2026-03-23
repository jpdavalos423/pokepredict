'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { apiClient, unwrapApiResponse } from '../../lib/api-client';
import { getRequestErrorMessage } from '../../lib/request-error';
import {
  Badge,
  Button,
  Card,
  CardImage,
  EmptyState,
  ErrorBanner,
  Input,
  LoadingSkeleton,
  PageContainer,
  SectionHeader
} from '../components/ui';
import type { CardListItem } from '@pokepredict/shared';

interface MarketFilters {
  query?: string | undefined;
  set?: string | undefined;
}

const DEFAULT_LIMIT = 24;
const MARKET_STATE_STORAGE_KEY = 'pokepredict:market-page-state:v1';
const MARKET_STATE_VERSION = 1;

interface PersistedMarketState {
  version: number;
  queryInput: string;
  setInput: string;
  appliedFilters: MarketFilters | null;
  cards: CardListItem[];
  cursor: string | null;
  scrollY: number;
}

function isPersistedMarketState(value: unknown): value is PersistedMarketState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<PersistedMarketState>;

  return (
    candidate.version === MARKET_STATE_VERSION &&
    typeof candidate.queryInput === 'string' &&
    typeof candidate.setInput === 'string' &&
    (candidate.appliedFilters === null || typeof candidate.appliedFilters === 'object') &&
    Array.isArray(candidate.cards) &&
    (candidate.cursor === null || typeof candidate.cursor === 'string') &&
    typeof candidate.scrollY === 'number'
  );
}

function readPersistedMarketState(): PersistedMarketState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const serialized = window.sessionStorage.getItem(MARKET_STATE_STORAGE_KEY);
    if (!serialized) {
      return null;
    }

    const parsed = JSON.parse(serialized) as unknown;
    if (!isPersistedMarketState(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writePersistedMarketState(state: PersistedMarketState): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(MARKET_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures (e.g. private mode quotas) and continue without persistence.
  }
}

function validateMarketFilters(filters: MarketFilters): string | null {
  if (!filters.query && !filters.set) {
    return 'Enter a card query or set id to search.';
  }

  if (!filters.set && filters.query && filters.query.length < 2) {
    return 'Query-only searches need at least 2 characters.';
  }

  if (filters.set && filters.query && filters.query.length < 1) {
    return 'Set + query searches require at least 1 query character.';
  }

  return null;
}

function MarketCard({ card, onViewCard }: { card: CardListItem; onViewCard: () => void }) {
  return (
    <Card className="market-card" variant="elevated">
      <div className="market-card-body">
        <div className="market-card-image-wrap">
          <CardImage
            className="market-card-image"
            imageUrl={card.imageUrl}
            setId={card.set.id}
            number={card.number}
            alt={`${card.name} card art`}
            loading="lazy"
            fallback={<div className="market-card-image-fallback">No image</div>}
          />
        </div>

        <div className="market-card-content">
          <div className="market-card-top">
            <h3 className="market-card-title">{card.name}</h3>
            {card.rarity ? <Badge tone="warning">{card.rarity}</Badge> : null}
          </div>

          <p className="market-card-meta">
            {card.set.name} ({card.set.id}) · #{card.number}
          </p>

          <Link
            href={`/cards/${encodeURIComponent(card.cardId)}`}
            className="market-card-link"
            onClick={onViewCard}
          >
            View card
          </Link>
        </div>
      </div>
    </Card>
  );
}

function LoadingGrid() {
  return (
    <section className="market-grid" aria-label="Loading market results">
      {Array.from({ length: 6 }).map((_, index) => (
        <Card className="market-card" key={`market-skeleton-${index}`}>
          <div className="market-card-body">
            <LoadingSkeleton className="market-card-skeleton-image" />
            <div className="phase-stack">
              <LoadingSkeleton className="ui-skeleton-text-short" />
              <LoadingSkeleton className="ui-skeleton-text-large" />
              <LoadingSkeleton className="ui-skeleton-text-short" />
            </div>
          </div>
        </Card>
      ))}
    </section>
  );
}

export default function MarketPage() {
  const [queryInput, setQueryInput] = useState('');
  const [setInput, setSetInput] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<MarketFilters | null>(null);
  const [cards, setCards] = useState<CardListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [requestErrorMessage, setRequestErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasHydratedState, setHasHydratedState] = useState(false);
  const pendingScrollRestoreRef = useRef<number | null>(null);

  const normalizedInput = useMemo<MarketFilters>(
    () => ({
      query: queryInput.trim() || undefined,
      set: setInput.trim() || undefined
    }),
    [queryInput, setInput]
  );

  const persistState = useCallback(
    (scrollY: number = typeof window === 'undefined' ? 0 : window.scrollY) => {
      writePersistedMarketState({
        version: MARKET_STATE_VERSION,
        queryInput,
        setInput,
        appliedFilters,
        cards,
        cursor,
        scrollY
      });
    },
    [appliedFilters, cards, cursor, queryInput, setInput]
  );

  useEffect(() => {
    const persistedState = readPersistedMarketState();
    if (persistedState) {
      setQueryInput(persistedState.queryInput);
      setSetInput(persistedState.setInput);
      setAppliedFilters(persistedState.appliedFilters);
      setCards(persistedState.cards);
      setCursor(persistedState.cursor);
      pendingScrollRestoreRef.current = persistedState.scrollY;
    }

    setHasHydratedState(true);
  }, []);

  useEffect(() => {
    if (!hasHydratedState) {
      return;
    }

    persistState();
  }, [hasHydratedState, persistState]);

  useEffect(() => {
    const pendingScrollY = pendingScrollRestoreRef.current;
    if (pendingScrollY === null) {
      return;
    }

    pendingScrollRestoreRef.current = null;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: pendingScrollY, behavior: 'auto' });
      });
    });
  }, [cards.length]);

  const fetchCards = useCallback(
    async (filters: MarketFilters, nextCursor?: string) => {
      const response = await apiClient.listCards({
        ...filters,
        limit: DEFAULT_LIMIT,
        cursor: nextCursor
      });

      return unwrapApiResponse(response);
    },
    []
  );

  const runSearch = useCallback(
    async (filters: MarketFilters) => {
      const validationError = validateMarketFilters(filters);
      if (validationError) {
        setValidationMessage(validationError);
        return;
      }

      setValidationMessage(null);
      setRequestErrorMessage(null);
      setIsLoading(true);

      try {
        const result = await fetchCards(filters);
        setCards(result.items);
        setCursor(result.cursor);
        setAppliedFilters(filters);
      } catch (error) {
        setRequestErrorMessage(
          getRequestErrorMessage(error, 'Market data could not be loaded.')
        );
      } finally {
        setIsLoading(false);
      }
    },
    [fetchCards]
  );

  const runLoadMore = useCallback(async () => {
    if (!cursor || !appliedFilters || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    setRequestErrorMessage(null);

    try {
      const result = await fetchCards(appliedFilters, cursor);
      setCards((previous) => [...previous, ...result.items]);
      setCursor(result.cursor);
    } catch (error) {
      setRequestErrorMessage(
        getRequestErrorMessage(error, 'More market data could not be loaded.')
      );
    } finally {
      setIsLoadingMore(false);
    }
  }, [appliedFilters, cursor, fetchCards, isLoadingMore]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runSearch(normalizedInput);
  };

  const onViewCard = useCallback(() => {
    persistState();
  }, [persistState]);

  return (
    <PageContainer>
      <SectionHeader
        title="Market"
        subtitle="Scan cards quickly by set and query, then drill into chart-first detail pages."
      />

      <Card variant="elevated">
        <form className="market-filters" onSubmit={onSubmit} aria-busy={isLoading}>
          <div className="market-filters-row">
            <label className="market-field">
              <span className="market-field-label">Card Query</span>
              <Input
                type="search"
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="Search card name (e.g. charizard)"
                aria-label="Card query"
                aria-describedby="market-filter-hint"
                autoComplete="off"
              />
            </label>
            <label className="market-field">
              <span className="market-field-label">Set ID</span>
              <Input
                value={setInput}
                onChange={(event) => setSetInput(event.target.value)}
                placeholder="Set id (e.g. sv3)"
                aria-label="Set id"
                aria-describedby="market-filter-hint"
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
            <div className="market-search-action">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Searching...' : 'Search'}
              </Button>
            </div>
          </div>
          <p className="market-filter-hint" id="market-filter-hint">
            Query-only requires 2+ characters. With set id provided, query can be 1+ character.
          </p>
        </form>
      </Card>

      {validationMessage ? (
        <ErrorBanner title="Search requirements" message={validationMessage} />
      ) : null}

      {requestErrorMessage ? (
        <ErrorBanner
          message={requestErrorMessage}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                if (appliedFilters) {
                  void runSearch(appliedFilters);
                  return;
                }

                void runSearch(normalizedInput);
              }}
            >
              Retry
            </Button>
          }
        />
      ) : null}

      {isLoading ? <LoadingGrid /> : null}

      {!isLoading && !appliedFilters ? (
        <EmptyState
          title="Search the market"
          description="Start with a card query or set id to load scan-friendly market results."
        />
      ) : null}

      {!isLoading && appliedFilters && cards.length === 0 ? (
        <EmptyState
          title="No cards found"
          description="Try broadening your query or switching to a different set id."
        />
      ) : null}

      {!isLoading && cards.length > 0 ? (
        <>
          <section className="market-grid" aria-label="Market cards">
            {cards.map((card) => (
              <MarketCard key={card.cardId} card={card} onViewCard={onViewCard} />
            ))}
          </section>

          {cursor ? (
            <div className="market-load-more">
              <Button
                variant="secondary"
                onClick={() => void runLoadMore()}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? 'Loading more...' : 'Load More'}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </PageContainer>
  );
}
