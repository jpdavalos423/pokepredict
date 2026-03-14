'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../ui/cn';

interface NavItem {
  href: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard' },
  { href: '/market', label: 'Market' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/alerts', label: 'Alerts' }
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopNav() {
  const pathname = usePathname();
  const activeItem = NAV_ITEMS.find((item) => isActivePath(pathname, item.href));

  return (
    <header className="shell-top-nav">
      <div className="shell-top-nav-inner">
        <Link className="shell-brand" href="/">
          <span className="shell-brand-mark" />
          <span>PokePredict</span>
        </Link>

        <nav className="shell-desktop-nav" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn('shell-nav-link', isActivePath(pathname, item.href) ? 'is-active' : '')}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="shell-mobile-title" aria-live="polite">
          {activeItem?.label ?? 'PokePredict'}
        </div>
      </div>
    </header>
  );
}
