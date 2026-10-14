import React from 'react';
import { usePlatformProfile } from '@/lib/platform/PlatformManager';

export default function AdaptiveNavigation({ items, active, onChange }) {
  const profile = usePlatformProfile();
  const current = items.find((item) => item.id === active);

  return (
    <nav aria-label="Editing modes" className="space-y-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:p-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Editing methods</p>
        <p className="mt-1 text-sm font-medium text-foreground">What would you like to do?</p>
      </div>
      <div className={['flex gap-2 overflow-x-auto pb-1', profile.compact ? 'w-full' : 'flex-wrap'].join(' ')} role="group" aria-label="Choose editing method">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={active === item.id}
            onClick={() => onChange(item.id)}
            className={[
              'min-h-11 shrink-0 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors',
              active === item.id
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'border-border bg-background text-foreground hover:border-primary/50 hover:bg-accent',
            ].join(' ')}
          >
            {item.label}
          </button>
        ))}
      </div>
      {current?.description && (
        <p className="rounded-xl bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground" aria-live="polite">
          {current.description}
        </p>
      )}
    </nav>
  );
}
