import type { ReactNode } from 'react';
import { cn } from './cn';

type CardVariant = 'default' | 'elevated';

interface CardProps {
  children: ReactNode;
  className?: string;
  variant?: CardVariant;
}

export function Card({ children, className, variant = 'default' }: CardProps) {
  return (
    <article
      className={cn(
        'ui-card',
        variant === 'elevated' ? 'ui-card-elevated' : '',
        className
      )}
    >
      {children}
    </article>
  );
}
