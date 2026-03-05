import { createHash } from 'node:crypto';
import type {
  CreateHoldingRequest,
  HoldingResponse,
  LatestPriceResponse,
  PortfolioHoldingValuation,
  PortfolioSummary
} from '@pokepredict/shared';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }

  if (value && typeof value === 'object') {
    const sorted = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));

    const output: Record<string, unknown> = {};
    for (const [key, child] of sorted) {
      output[key] = canonicalize(child);
    }

    return output;
  }

  return value;
}

export function computeHoldingRequestHash(input: CreateHoldingRequest): string {
  const canonicalPayload = JSON.stringify(canonicalize(input));
  return createHash('sha256').update(canonicalPayload).digest('hex');
}

function calculateBps(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Math.round((numerator * 10000) / denominator);
}

export function buildHoldingValuation(
  holding: HoldingResponse,
  latestPrice: LatestPriceResponse | null
): PortfolioHoldingValuation {
  const costBasisCents = holding.qty * holding.buyPriceCents;
  const latestMarketCents = latestPrice?.marketCents ?? 0;
  const marketValueCents = holding.qty * latestMarketCents;
  const unrealizedPnLCents = marketValueCents - costBasisCents;

  return {
    ...holding,
    costBasisCents,
    marketValueCents,
    unrealizedPnLCents,
    unrealizedPnLBps: calculateBps(unrealizedPnLCents, costBasisCents),
    latestPrice
  };
}

export function summarizePortfolio(
  holdings: PortfolioHoldingValuation[]
): PortfolioSummary {
  const summary = holdings.reduce(
    (acc, holding) => {
      acc.totalCostBasisCents += holding.costBasisCents;
      acc.totalMarketValueCents += holding.marketValueCents;
      acc.unrealizedPnLCents += holding.unrealizedPnLCents;
      return acc;
    },
    {
      totalCostBasisCents: 0,
      totalMarketValueCents: 0,
      unrealizedPnLCents: 0,
      unrealizedPnLBps: 0
    }
  );

  summary.unrealizedPnLBps = calculateBps(
    summary.unrealizedPnLCents,
    summary.totalCostBasisCents
  );

  return summary;
}
