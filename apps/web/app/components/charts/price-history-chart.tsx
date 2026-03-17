import type { PriceHistoryPoint } from '@pokepredict/shared';
import { formatUsdFromCents } from '../../../lib/format';

interface PriceHistoryChartProps {
  points: PriceHistoryPoint[];
}

interface ChartPoint {
  x: number;
  y: number;
  ts: string;
  marketCents: number;
}

const CHART_WIDTH = 960;
const CHART_HEIGHT = 340;
const PADDING_LEFT = 56;
const PADDING_RIGHT = 18;
const PADDING_TOP = 18;
const PADDING_BOTTOM = 36;

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric'
});

function formatShortDate(iso: string): string {
  return SHORT_DATE_FORMATTER.format(new Date(iso));
}

function getMinMax(values: number[]): { min: number; max: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    return {
      min: min - Math.max(100, Math.round(min * 0.02)),
      max: max + Math.max(100, Math.round(max * 0.02))
    };
  }

  return { min, max };
}

function buildPoints(points: PriceHistoryPoint[]): ChartPoint[] {
  const values = points.map((point) => point.marketCents);
  const { min, max } = getMinMax(values);
  const innerWidth = CHART_WIDTH - PADDING_LEFT - PADDING_RIGHT;
  const innerHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const horizontalStep = points.length > 1 ? innerWidth / (points.length - 1) : innerWidth / 2;

  return points.map((point, index) => {
    const ratio = (point.marketCents - min) / (max - min);
    const x = PADDING_LEFT + horizontalStep * index;
    const y = PADDING_TOP + (1 - ratio) * innerHeight;

    return {
      x,
      y,
      ts: point.ts,
      marketCents: point.marketCents
    };
  });
}

function buildLinePath(points: ChartPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
}

function buildAreaPath(points: ChartPoint[]): string {
  if (!points.length) {
    return '';
  }

  const linePath = buildLinePath(points);
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  if (!firstPoint || !lastPoint) {
    return linePath;
  }

  return `${linePath} L ${lastPoint.x.toFixed(2)} ${CHART_HEIGHT - PADDING_BOTTOM} L ${firstPoint.x.toFixed(2)} ${CHART_HEIGHT - PADDING_BOTTOM} Z`;
}

function getYAxisTicks(min: number, max: number, tickCount = 4): number[] {
  const ticks: number[] = [];
  const span = max - min;
  for (let index = 0; index < tickCount; index += 1) {
    const ratio = index / (tickCount - 1);
    ticks.push(Math.round(max - span * ratio));
  }

  return ticks;
}

export function PriceHistoryChart({ points }: PriceHistoryChartProps) {
  if (!points.length) {
    return (
      <div className="price-chart-empty" role="status">
        No historical points are available for this range yet.
      </div>
    );
  }

  const sortedPoints = [...points].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  const chartPoints = buildPoints(sortedPoints);
  const values = sortedPoints.map((point) => point.marketCents);
  const { min, max } = getMinMax(values);
  const yAxisTicks = getYAxisTicks(min, max);
  const linePath = buildLinePath(chartPoints);
  const areaPath = buildAreaPath(chartPoints);

  const firstPoint = sortedPoints[0];
  const midPoint = sortedPoints[Math.floor((sortedPoints.length - 1) / 2)];
  const lastPoint = sortedPoints[sortedPoints.length - 1];
  const xAxisLabels = [firstPoint, midPoint, lastPoint].filter(
    (point): point is PriceHistoryPoint => Boolean(point)
  ).filter(
    (point, index, points) => points.findIndex((candidate) => candidate.ts === point.ts) === index
  );

  return (
    <div className="price-chart">
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label="Card market price history chart">
        <defs>
          <linearGradient id="price-area-gradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(93, 168, 255, 0.28)" />
            <stop offset="100%" stopColor="rgba(93, 168, 255, 0.02)" />
          </linearGradient>
        </defs>

        {yAxisTicks.map((tick, index) => {
          const ratio = (tick - min) / (max - min);
          const y = PADDING_TOP + (1 - ratio) * (CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM);
          return (
            <g key={`${tick}-${index}`}>
              <line
                className="price-chart-grid-line"
                x1={PADDING_LEFT}
                y1={y}
                x2={CHART_WIDTH - PADDING_RIGHT}
                y2={y}
              />
              <text className="price-chart-axis-label" x={8} y={y + 4}>
                {formatUsdFromCents(tick)}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill="url(#price-area-gradient)" />
        <path className="price-chart-line" d={linePath} />

        {chartPoints.map((point, index) => (
          <circle
            key={`${point.ts}-${index}`}
            className="price-chart-point"
            cx={point.x}
            cy={point.y}
            r={index === chartPoints.length - 1 ? 4.2 : 3.1}
          />
        ))}

        {xAxisLabels.map((point, index) => {
          const chartPoint = chartPoints.find((entry) => entry.ts === point.ts);
          if (!chartPoint) {
            return null;
          }

          return (
            <text
              key={`${point.ts}-${index}-label`}
              className="price-chart-axis-label"
              x={chartPoint.x}
              y={CHART_HEIGHT - 10}
              textAnchor="middle"
            >
              {formatShortDate(point.ts)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
