import type { ReactNode } from 'react';
import { cn } from './cn';

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

export function PageContainer({ children, className }: PageContainerProps) {
  return <main className={cn('page-container', className)}>{children}</main>;
}
