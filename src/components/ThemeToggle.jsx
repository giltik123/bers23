import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ThemeToggle({ showLabel = false }) {
  const { t } = useTranslation();
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);
  useEffect(() => {
    const synchronize = (event) => setDark(Boolean(event.detail));
    window.addEventListener('bers-theme-change', synchronize);
    return () => window.removeEventListener('bers-theme-change', synchronize);
  }, []);

  const toggleAppearance = () => {
    const next = !dark;
    setDark(next);
    window.dispatchEvent(new CustomEvent('bers-theme-change', { detail: next }));
  };

  return (
    <Button type="button" variant="ghost" size={showLabel ? "sm" : "icon"} onClick={toggleAppearance} aria-label={dark ? t('settings.appearanceHint') : t('settings.appearanceHint')} className={showLabel ? "min-h-11 gap-2 rounded-xl px-3 text-muted-foreground" : undefined}>
      {dark ? <Sun className="w-5 h-5" aria-hidden="true" /> : <Moon className="w-5 h-5" aria-hidden="true" />}
      {showLabel && <span>{t('settings.appearance')}</span>}
    </Button>
  );
}