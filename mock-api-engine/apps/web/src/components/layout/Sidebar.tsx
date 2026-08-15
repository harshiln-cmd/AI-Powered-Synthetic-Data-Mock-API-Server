import { Braces, Route, ScrollText } from 'lucide-react';
import { NavLink } from 'react-router';
import type { ComponentType } from 'react';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/endpoints', label: 'Endpoints', icon: Route },
  { to: '/logs', label: 'Logs', icon: ScrollText },
];

export function Sidebar() {
  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-border bg-canvas">
      <div className="flex items-center gap-2.5 px-5 py-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15 text-brand">
          <Braces size={18} strokeWidth={2.25} />
        </div>
        <div>
          <p className="text-sm font-semibold leading-none text-ink">Mock API</p>
          <p className="mt-1 text-xs leading-none text-ink-muted">Synthetic Data Engine</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand/12 text-brand'
                  : 'text-ink-muted hover:bg-panel hover:text-ink',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={17}
                  className={isActive ? 'text-brand' : 'text-ink-muted group-hover:text-ink'}
                />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border px-5 py-4">
        <p className="text-xs text-ink-muted">
          Phase 3 <span className="text-border">·</span> Dashboard
        </p>
      </div>
    </aside>
  );
}
