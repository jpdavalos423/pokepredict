import type { ReactNode } from 'react';
import { cn } from './cn';

type BadgeTone = 'neutral' | 'success' | 'danger' | 'warning' | 'signal' | 'primary';

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'ui-badge-neutral',
  success: 'ui-badge-success',
  danger: 'ui-badge-danger',
  warning: 'ui-badge-warning',
  signal: 'ui-badge-signal',
  primary: 'ui-badge-primary'
};

export function Badge({ children, tone = 'neutral', className }: BadgeProps) {
  return <span className={cn('ui-badge', TONE_CLASS[tone], className)}>{children}</span>;
}
