import type { ReactNode } from 'react';
import { cn } from './cn';

interface ErrorBannerProps {
  title?: string;
  message: string;
  action?: ReactNode;
  className?: string;
}

export function ErrorBanner({
  title = 'Unable to load data',
  message,
  action,
  className
}: ErrorBannerProps) {
  return (
    <aside className={cn('ui-error-banner', className)} role="alert" aria-live="polite">
      <div>
        <p className="ui-error-title">{title}</p>
        <p className="ui-error-message">{message}</p>
      </div>
      {action ? <div>{action}</div> : null}
    </aside>
  );
}
