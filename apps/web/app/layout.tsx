import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'PokePredict',
  description: 'Pokemon TCG market intelligence scaffold'
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
