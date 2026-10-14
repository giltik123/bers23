import React, { useEffect, useId, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { notificationCenter } from '@/lib/notifications/notificationCenter';

export default function NotificationCenter() {
  const [state, setState] = useState(notificationCenter.snapshot());
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const host = useRef(null);

  useEffect(() => {
    const unsubscribe = notificationCenter.subscribe(setState);
    notificationCenter.ensure().catch(() => {});
    return unsubscribe;
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setOpen(false); };
    const closeOnOutsideClick = (event) => { if (!host.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOnOutsideClick);
    };
  }, [open]);

  return (
    <div className="relative" ref={host}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={state.unread > 0 ? 'Notifications, ' + state.unread + ' unread' : 'Notifications'}
        className="relative inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        <span>Notifications</span>
        {state.unread > 0 && (
          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] leading-none text-primary-foreground" aria-hidden="true">{state.unread}</span>
        )}
      </button>
      {open && (
        <section
          id={panelId}
          aria-label="Notifications"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-popover p-4 shadow-xl"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Notifications</h2>
            {state.unread > 0 && (
              <button type="button" onClick={() => notificationCenter.markAllRead()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs text-primary hover:bg-accent">
                <CheckCheck className="h-4 w-4" aria-hidden="true" /> Mark all read
              </button>
            )}
          </div>
          {state.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">You're all caught up. No notifications yet.</p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-auto">
              {state.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => notificationCenter.markRead(item.id)}
                  className={['w-full rounded-xl border border-border/50 p-3 text-left transition-colors hover:bg-accent', item.read ? 'opacity-60' : 'bg-primary/5'].join(' ')}
                >
                  <span className="block text-sm font-medium">{item.title}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{item.message}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
