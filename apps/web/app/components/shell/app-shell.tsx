import type { ReactNode } from 'react';
import { TopNav } from './top-nav';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <TopNav />
      {children}
    </div>
  );
}
