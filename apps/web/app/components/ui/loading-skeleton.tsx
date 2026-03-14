import type { CSSProperties } from 'react';
import { cn } from './cn';

interface LoadingSkeletonProps {
  className?: string;
  style?: CSSProperties;
}

export function LoadingSkeleton({ className, style }: LoadingSkeletonProps) {
  return <div className={cn('ui-skeleton', className)} style={style} aria-hidden="true" />;
}

export function StatCardSkeleton() {
  return (
    <div className="ui-card ui-card-elevated ui-stat-card">
      <LoadingSkeleton className="ui-skeleton-text-short" />
      <LoadingSkeleton className="ui-skeleton-text-large" />
      <LoadingSkeleton className="ui-skeleton-pill" />
    </div>
  );
}
