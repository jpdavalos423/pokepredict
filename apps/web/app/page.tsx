import {
  Badge,
  Card,
  EmptyState,
  ErrorBanner,
  LoadingSkeleton,
  PageContainer,
  SectionHeader,
  StatCard,
  StatCardSkeleton
} from './components/ui';
import { getApiBaseUrl } from '../lib/api-client';

export default function HomePage() {
  return (
    <PageContainer>
      <SectionHeader
        title="Foundation App Shell"
        subtitle="Phase 1 establishes shared theme tokens, premium shell layout, reusable dashboard primitives, and API scaffolding."
      />

      <section className="phase-grid phase-grid-stats" aria-label="Stat card primitives">
        <StatCard
          label="Market Status"
          value="Ready"
          trend="Phase 1"
          tone="signal"
          hint="Chart-first shell complete"
        />
        <StatCard
          label="Theme Mode"
          value="Dark Only"
          trend="Premium"
          tone="neutral"
          hint="Inter + semantic tokens"
        />
        <StatCardSkeleton />
      </section>

      <section className="phase-grid phase-grid-cards" aria-label="Shared state primitives">
        <Card>
          <div className="phase-stack">
            <h2>Badge System</h2>
            <div className="phase-stack">
              <div>
                <Badge tone="primary">Interactive</Badge>{' '}
                <Badge tone="success">Bullish</Badge>{' '}
                <Badge tone="danger">Bearish</Badge>
              </div>
              <div>
                <Badge tone="warning">Featured</Badge>{' '}
                <Badge tone="signal">Signal</Badge>{' '}
                <Badge tone="neutral">Neutral</Badge>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="phase-stack">
            <h2>Loading Skeleton</h2>
            <LoadingSkeleton className="ui-skeleton-text-short" />
            <LoadingSkeleton className="ui-skeleton-text-large" />
            <LoadingSkeleton className="ui-skeleton-pill" />
          </div>
        </Card>
      </section>

      <ErrorBanner
        title="Error Banner Primitive"
        message="Shared alert styles are ready for GET/POST state handling in future phases."
      />

      <EmptyState
        title="Feature Pages Are Intentionally Deferred"
        description="Dashboard data, market results, card detail rendering, portfolio CRUD, and alerts CRUD are out of scope for Phase 1."
      />

      <Card>
        <p>
          Same-origin API base configured: <code>{getApiBaseUrl()}</code>
        </p>
      </Card>
    </PageContainer>
  );
}
