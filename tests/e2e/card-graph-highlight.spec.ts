import { expect, test } from '@playwright/test';

interface BackendSuccess<T> {
  ok: true;
  data: T;
  error: null;
}

function ok<T>(data: T): BackendSuccess<T> {
  return {
    ok: true,
    data,
    error: null
  };
}

test('graph view supports highlighting points by hover and focus', async ({ page }) => {
  const cardId = 'sv3-198';

  await page.route(`**/api/cards/${cardId}**`, async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;

    if (pathname === `/api/cards/${cardId}`) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          ok({
            cardId,
            name: 'Charizard ex',
            set: {
              id: 'sv3',
              name: 'Obsidian Flames'
            },
            number: '198',
            rarity: 'Special Illustration Rare',
            imageUrl: undefined
          })
        )
      });
      return;
    }

    if (pathname === `/api/cards/${cardId}/price/latest`) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          ok({
            cardId,
            asOf: '2026-02-11T12:00:00.000Z',
            marketCents: 2210,
            marketPrice: 22.1,
            lowCents: 2100,
            highCents: 2450,
            currency: 'USD',
            source: 'fixture'
          })
        )
      });
      return;
    }

    if (pathname === `/api/cards/${cardId}/signals/latest`) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          ok({
            cardId,
            asOfDate: '2026-02-11',
            ret7dBps: 240,
            ret30dBps: 880,
            vol30dBps: 180,
            trend: 'UPTREND'
          })
        )
      });
      return;
    }

    if (pathname === `/api/cards/${cardId}/prices`) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          ok({
            cardId,
            range: url.searchParams.get('range') ?? '90d',
            from: '2026-01-01',
            to: '2026-02-11',
            points: [
              {
                ts: '2026-01-01T12:00:00.000Z',
                marketCents: 1840,
                marketPrice: 18.4,
                lowCents: 1760,
                highCents: 1900,
                currency: 'USD',
                source: 'fixture'
              },
              {
                ts: '2026-01-10T12:00:00.000Z',
                marketCents: 1910,
                marketPrice: 19.1,
                lowCents: 1800,
                highCents: 1980,
                currency: 'USD',
                source: 'fixture'
              },
              {
                ts: '2026-01-19T12:00:00.000Z',
                marketCents: 1970,
                marketPrice: 19.7,
                lowCents: 1880,
                highCents: 2040,
                currency: 'USD',
                source: 'fixture'
              },
              {
                ts: '2026-01-30T12:00:00.000Z',
                marketCents: 2090,
                marketPrice: 20.9,
                lowCents: 2010,
                highCents: 2150,
                currency: 'USD',
                source: 'fixture'
              },
              {
                ts: '2026-02-11T12:00:00.000Z',
                marketCents: 2210,
                marketPrice: 22.1,
                lowCents: 2100,
                highCents: 2450,
                currency: 'USD',
                source: 'fixture'
              }
            ]
          })
        )
      });
      return;
    }

    await route.continue();
  });

  await page.goto(`/cards/${cardId}`);

  await expect(page.getByRole('heading', { name: 'Market Price History' })).toBeVisible();
  const interactionCopy = page.locator('.price-chart-interaction-copy');
  await expect(interactionCopy).toContainText('Hover or focus a chart point to highlight it.');

  const points = page.locator('.price-chart-point');
  await expect(points).toHaveCount(5);

  const firstPoint = points.first();
  await firstPoint.hover();
  await expect(firstPoint).toHaveAttribute('data-active', 'true');
  await expect(interactionCopy).toContainText('Highlighted Jan 1 at $18.40');

  const thirdPoint = points.nth(2);
  await thirdPoint.focus();
  await expect(thirdPoint).toHaveAttribute('data-active', 'true');
  await expect(interactionCopy).toContainText('Highlighted Jan 19 at $19.70');
});
