import type { ReactNode } from 'react';
import { AppShell } from './components/shell';
import './globals.css';

export const metadata = {
  title: 'PokePredict',
  description: 'Pokemon TCG market intelligence'
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
