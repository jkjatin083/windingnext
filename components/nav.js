'use client';
// Shared bottom nav. Uses Next.js client-side links, so taps switch screens
// without a page reload and the cached data shows instantly.
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/home', label: 'Home', icon: <path d="M3 11l8-7 8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H4a1 1 0 0 1-1-1z"/> },
  { href: '/entries', label: 'Entries', icon: <path d="M4 6h14M4 11h14M4 16h14"/> },
  { href: '/hisab', label: 'Hisab', icon: <path d="M4 18V9M11 18V4M18 18v-6"/> }
];

export default function Nav() {
  const p = usePathname();
  return (
    <nav>
      {items.map(i => (
        <Link key={i.href} href={i.href} className={p === i.href ? 'on' : ''}>
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">{i.icon}</svg>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
