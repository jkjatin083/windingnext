'use client';
// Shared bottom nav. Uses Next.js client-side links, so taps switch screens
// without a page reload and the cached data shows instantly.
// Tabs depend on who is logged in: App 1 contractors get Home/Entries/Hisab,
// Pandey ji gets the motor app (Make/Dispatch/Report), Sunil gets both.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ic = {
  home: <path d="M3 11l8-7 8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H4a1 1 0 0 1-1-1z"/>,
  entries: <path d="M4 6h14M4 11h14M4 16h14"/>,
  hisab: <path d="M4 18V9M11 18V4M18 18v-6"/>,
  make: <><circle cx="11" cy="11" r="9"/><path d="M11 6v10M6 11h10"/></>,
  dispatch: <path d="M4 11h14M13 6l5 5-5 5"/>,
  report: <path d="M4 18V9M11 18V4M18 18v-6"/>
};

const BASE = [
  { href: '/home', label: 'Home', icon: ic.home },
  { href: '/entries', label: 'Entries', icon: ic.entries },
  { href: '/hisab', label: 'Hisab', icon: ic.hisab }
];
const MOTOR = [
  { href: '/motor', label: 'Make', icon: ic.make },
  { href: '/dispatch', label: 'Dispatch', icon: ic.dispatch },
  { href: '/report', label: 'Report', icon: ic.report }
];

function itemsFor(name) {
  if (name === 'Pandey ji') return MOTOR;
  if (name === 'Sunil') return [...BASE, ...MOTOR];
  return BASE;
}

export default function Nav() {
  const p = usePathname();
  const [items, setItems] = useState(BASE);
  useEffect(() => { setItems(itemsFor(localStorage.getItem('wa_name') || '')); }, []);
  return (
    <nav>
      {items.map(i => (
        <Link key={i.href} href={i.href} className={p === i.href ? 'on' : ''} style={{ flex: 1, width: 'auto' }}>
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">{i.icon}</svg>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
