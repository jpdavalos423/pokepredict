import type { ReactNode } from 'react';
import { cn } from './cn';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export function SectionHeader({
  title,
  subtitle,
  action,
  className
}: SectionHeaderProps) {
  return (
    <header className={cn('section-header', className)}>
      <div>
        <h1 className="section-header-title">{title}</h1>
        {subtitle ? <p className="section-header-subtitle">{subtitle}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </header>
  );
}
