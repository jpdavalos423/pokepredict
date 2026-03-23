import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

type CardVariant = 'default' | 'elevated';

interface CardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  variant?: CardVariant;
}

export function Card({
  children,
  className,
  variant = 'default',
  ...rest
}: CardProps) {
  return (
    <article
      className={cn(
        'ui-card',
        variant === 'elevated' ? 'ui-card-elevated' : '',
        className
      )}
      {...rest}
    >
      {children}
    </article>
  );
}
