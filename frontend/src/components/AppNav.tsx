'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/setup/supervisors', label: 'Supervisors' },
  { href: '/setup/students', label: 'Students' },
  { href: '/setup/batches', label: 'Batches' },
  { href: '/setup/config', label: 'Config' },
  { href: '/ceremony/choice', label: 'Choice' },
  { href: '/ceremony/lottery', label: 'Lottery' },
  { href: '/ceremony/results', label: 'Results' },
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="bg-gray-50 border-b border-gray-200 px-6 py-2">
      <div className="max-w-7xl mx-auto flex gap-1 flex-wrap text-sm">
        {links.map(({ href, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                active
                  ? 'bg-blue-600 text-white font-medium shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
