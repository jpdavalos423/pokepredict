export const apiEndpoints = {
  cards: '/cards',
  cardById: (cardId: string) => `/cards/${encodeURIComponent(cardId)}`,
  cardLatestPrice: (cardId: string) => `/cards/${encodeURIComponent(cardId)}/price/latest`,
  cardPrices: (cardId: string) => `/cards/${encodeURIComponent(cardId)}/prices`,
  cardLatestSignal: (cardId: string) => `/cards/${encodeURIComponent(cardId)}/signals/latest`,
  portfolio: '/portfolio',
  portfolioHoldings: '/portfolio/holdings',
  portfolioHoldingById: (holdingId: string) =>
    `/portfolio/holdings/${encodeURIComponent(holdingId)}`,
  alerts: '/alerts',
  alertById: (alertId: string) => `/alerts/${encodeURIComponent(alertId)}`
} as const;
