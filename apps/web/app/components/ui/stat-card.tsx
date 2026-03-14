import type { ReactNode } from 'react';
import { Badge } from './badge';
import { Card } from './card';
import { cn } from './cn';

type StatTone = 'neutral' | 'success' | 'danger' | 'signal';

interface StatCardProps {
  label: string;
  value: string;
  trend?: string;
  tone?: StatTone;
  hint?: string;
  className?: string;
  trailing?: ReactNode;
}

const TONE_CLASS: Record<StatTone, string> = {
  neutral: 'ui-stat-value-neutral',
  success: 'ui-stat-value-success',
  danger: 'ui-stat-value-danger',
  signal: 'ui-stat-value-signal'
};

export function StatCard({
  label,
  value,
  trend,
  tone = 'neutral',
  hint,
  className,
  trailing
}: StatCardProps) {
  return (
    <Card className={cn('ui-stat-card', className)} variant="elevated">
      <div className="ui-stat-top-row">
        <p className="ui-stat-label">{label}</p>
        {trailing}
      </div>
      <p className={cn('ui-stat-value', TONE_CLASS[tone])}>{value}</p>
      <div className="ui-stat-bottom-row">
        {trend ? <Badge tone={tone === 'neutral' ? 'primary' : tone}>{trend}</Badge> : null}
        {hint ? <p className="ui-stat-hint">{hint}</p> : null}
      </div>
    </Card>
  );
}
