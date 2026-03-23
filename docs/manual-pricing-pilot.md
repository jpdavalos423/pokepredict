# Manual Pricing Pilot (10 Cards)

## Purpose
Bootstraps high-accuracy pricing history without a paid upstream API by collecting sold-listing data manually and writing one daily normalized snapshot per card.

## Starter card basket
This pilot uses 10 IDs that are already verified in the deployed API.

1. `base1-4` (Charizard)
2. `sv3-169` (Charizard ex)
3. `sv3-198` (Venusaur ex)
4. `sv2-203` (Iono)
5. `swsh12-TG30` (Duraludon VMAX)
6. `sm11-125` (Umbreon & Darkrai GX)
7. `bw11-102` (Lugia-EX)
8. `ex6-108` (Gengar ex)
9. `ex15-91` (Dragonite ex delta)
10. `me02.5-276` (Pikachu ex)

Seed file: `data/cards.seed.pilot10.json`

## Data files
- Listing-level capture template: `data/manual-pricing/pilot10-ebay-listings.template.csv`
- Daily normalized snapshot template: `data/manual-pricing/pilot10-snapshots.template.csv`

## Accuracy rubric (strict)
- Source only sold/ended listings (not active listings).
- Condition must be explicit and comparable (`NM` recommended for v1).
- Include shipping in total (`totalPriceUsd = soldPriceUsd + shippingUsd`).
- Exclude lots with quantity > 1 unless you can confidently compute per-card unit price.
- Exclude non-English cards unless you are modeling mixed-language pricing.
- Exclude damaged cards, auctions with obvious shill behavior, and clear outliers.
- Keep source URL and title for auditability.

## Daily workflow
1. Collect 5 to 15 sold listings per card into the listings CSV.
2. For each card/day, compute:
   - `marketPrice`: trimmed median of `totalPriceUsd` (drop top/bottom 10% when sample >= 10)
   - `lowPrice`: 10th percentile (or min when sample < 10)
   - `highPrice`: 90th percentile (or max when sample < 10)
3. Write one row per card for that day into snapshots CSV.
4. Keep `asOf` at a consistent daily timestamp (for example `00:00:00.000Z`).

## Why this works for ML
- Listing-level rows preserve ground truth and auditability.
- One normalized daily point per card maps directly to existing `Prices` and `LatestPrices` semantics.
- Consistent condition and robust aggregation reduce label noise during early model training.
