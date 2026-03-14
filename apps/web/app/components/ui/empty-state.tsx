import type { ReactNode } from 'react';
import { Card } from './card';
import { cn } from './cn';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <Card className={cn('ui-empty-state', className)}>
      <h2 className="ui-empty-title">{title}</h2>
      <p className="ui-empty-description">{description}</p>
      {action ? <div className="ui-empty-action">{action}</div> : null}
    </Card>
  );
}
