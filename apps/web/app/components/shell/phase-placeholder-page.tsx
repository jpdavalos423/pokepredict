import { EmptyState, PageContainer, SectionHeader } from '../ui';

interface PhasePlaceholderPageProps {
  title: string;
  subtitle: string;
}

export function PhasePlaceholderPage({ title, subtitle }: PhasePlaceholderPageProps) {
  return (
    <PageContainer>
      <SectionHeader title={title} subtitle={subtitle} />
      <EmptyState
        title="Implementation Starts in Phase 2+"
        description="This route is scaffolded for shared shell validation only. Feature-level data, charts, and mutations are intentionally deferred."
      />
    </PageContainer>
  );
}
