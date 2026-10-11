import React, { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ThemeToggle({ showLabel = false }) {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <Button type="button" variant="ghost" size={showLabel ? "sm" : "icon"} onClick={() => setDark(!dark)} aria-label={dark ? "Switch to light appearance" : "Switch to dark appearance"} className={showLabel ? "min-h-11 gap-2 rounded-xl px-3 text-muted-foreground" : undefined}>
      {dark ? <Sun className="w-5 h-5" aria-hidden="true" /> : <Moon className="w-5 h-5" aria-hidden="true" />}
      {showLabel && <span>Appearance</span>}
    </Button>
  );
}