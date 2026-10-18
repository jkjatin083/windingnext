'use client';
// Shared bottom nav. Uses Next.js client-side links, so taps switch screens
// without a page reload and the cached data shows instantly.
// Tabs depend on who is logged in: App 1 contractors get Home/Entries/Hisab,
// Pandey ji gets the motor app (Make/Dispatch/Report), Sunil gets both,
// Sandeep gets the sale order app, Admin gets the order book.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ic = {
  home: <path d="M3 11l8-7 8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H4a1 1 0 0 1-1-1z"/>,
  entries: <path d="M4 6h14M4 11h14M4 16h14"/>,
  hisab: <path d="M4 18V9M11 18V4M18 18v-6"/>,
  make: <><circle cx="11" cy="11" r="9"/><path d="M11 6v10M6 11h10"/></>,
  dispatch: <path d="M4 11h14M13 6l5 5-5 5"/>,
  report: <path d="M4 18V9M11 18V4M18 18v-6"/>,
  new: <path d="M11 4v14M4 11h14"/>,
  orders: <><path d="M5 4h12v14H5z"/><path d="M8 8h6M8 12h6"/></>,
  status: <path d="M3 11h4l3-6 4 12 3-6h2"/>,
  rotor: <><circle cx="11" cy="11" r="8"/><path d="M11 3v4M11 15v4M3 11h4M15 11h4"/></>
};

const BASE = [
  { href: '/made', label: 'Made', icon: ic.make },
  { href: '/give', label: 'Give', icon: ic.dispatch },
  { href: '/report', label: 'Report', icon: ic.report }
];
const MOTOR = [
  { href: '/motor', label: 'Make', icon: ic.make },
  { href: '/dispatch', label: 'Dispatch', icon: ic.dispatch },
  { href: '/mreport', label: 'Report', icon: ic.report }
];

const SALE = [
  { href: '/sale', label: 'Overview', icon: ic.home },
  { href: '/sale-new', label: 'New order', icon: ic.new },
  { href: '/orders', label: 'Orders', icon: ic.orders },
  { href: '/status', label: 'Status', icon: ic.status }
];

const ADMIN = [
  { href: '/ob', label: 'Overview', icon: ic.home },
  { href: '/book', label: 'Order Book', icon: ic.orders },
  { href: '/demand', label: 'Contractors', icon: ic.entries },
  { href: '/rotor', label: 'Rotor', icon: ic.rotor },
  { href: '/eadmin', label: 'Entries', icon: ic.entries }
];

function itemsFor(name) {
  if (name === 'Admin') return ADMIN;
  if (name === 'Pandey ji') return MOTOR;
  if (name === 'Sunil') return [...BASE, ...MOTOR.map((t, i) => i === 2 ? { ...t, label: 'Hisaab' } : t)];
  if (name === 'Sandeep') return SALE;
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
