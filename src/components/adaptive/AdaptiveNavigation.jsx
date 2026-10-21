import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { usePlatformProfile } from '@/lib/platform/PlatformManager';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

// A compact, single-row mode switcher. Secondary editor capabilities remain
// accessible from "More" without becoming permanent top-level modes.
export default function AdaptiveNavigation({ items, extraItems = [], active, onChange, compact = false }) {
  const profile = usePlatformProfile();
  const { t, language } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);
  const current = [...items, ...extraItems].find((item) => item.id === active);
  const extraActive = extraItems.some((item) => item.id === active);

  useEffect(() => { setMoreOpen(false); }, [active]);
  useEffect(() => {
    if (!moreOpen) return undefined;
    const dismiss = (event) => { if (!moreRef.current?.contains(event.target)) setMoreOpen(false); };
    const escape = (event) => { if (event.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [moreOpen]);

  const tabLabel = (item) => language === 'ru' ? t(`editorUi.tabs.${item.id}.label`) : item.label;
  const activeClass = 'border-primary bg-primary text-primary-foreground shadow-sm';
  const inactiveClass = 'border-border bg-background text-foreground hover:border-primary/50 hover:bg-accent';
  return (
    <nav aria-label={language === 'ru' ? t('editorUi.modes') : 'Editing modes'}
      className={compact
        ? 'rounded-2xl border border-border/70 bg-card px-3 py-2 shadow-sm'
        : 'space-y-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:p-4'}>
      {!compact && <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{language === 'ru' ? t('editorUi.methods') : 'Editing methods'}</p>
        <p className="mt-1 text-sm font-medium text-foreground">{language === 'ru' ? t('editorUi.what') : 'What would you like to do?'}</p>
      </div>}
      <div className="flex items-start gap-2">
        <div className={['flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1', profile.compact ? 'w-full' : 'flex-wrap'].join(' ')}
          role="group" aria-label={language === 'ru' ? t('editorUi.chooseMethod') : 'Choose editing method'}>
        {items.map((item) => (
          <button key={item.id} type="button" aria-pressed={active === item.id}
            onClick={() => onChange(item.id)}
            className={['min-h-11 shrink-0 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors',
              active === item.id ? activeClass : inactiveClass].join(' ')}>
            {tabLabel(item)}
          </button>
        ))}
        </div>
        {extraItems.length > 0 && <div ref={moreRef} className="relative shrink-0">
          <button type="button" aria-expanded={moreOpen} aria-haspopup="true"
            aria-controls="bers-extra-editor-modes"
            onClick={() => setMoreOpen((value) => !value)}
            className={['flex min-h-11 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors',
              extraActive ? activeClass : inactiveClass].join(' ')}>
            {language === 'ru' ? 'Ещё' : 'More'} <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {moreOpen && <div id="bers-extra-editor-modes" role="group"
            aria-label={language === 'ru' ? 'Дополнительные инструменты' : 'Additional tools'}
            className="absolute right-0 top-full z-50 mt-2 w-52 space-y-1 rounded-xl border border-border bg-card p-2 shadow-xl">
            {extraItems.map((item) => <button key={item.id} type="button"
              aria-pressed={active === item.id}
              onClick={() => { onChange(item.id); setMoreOpen(false); }}
              className={['block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent',
                active === item.id ? 'bg-primary/10 font-semibold text-primary' : 'text-foreground'].join(' ')}>
              {tabLabel(item)}
            </button>)}
          </div>}
        </div>}
      </div>
      {!compact && current?.description && (
        <p className="rounded-xl bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground" aria-live="polite">
          {language === 'ru' ? t(`editorUi.tabs.${current.id}.description`) : current.description}
        </p>
      )}
    </nav>
  );
}
