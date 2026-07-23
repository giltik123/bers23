import React from 'react';
import { Globe, Check } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { LANGUAGES } from '@/lib/i18n/languages';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

export default function LanguageSwitcher() {
  const { language, changeLanguage } = useTranslation();
  const current = LANGUAGES.find((item) => item.code === language);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg border border-input px-3 py-1.5 text-sm hover:bg-accent">
        <Globe className="h-4 w-4" />
        <span>{current?.native || 'English'}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
        {LANGUAGES.map((item) => (
          <DropdownMenuItem key={item.code} onClick={() => changeLanguage(item.code)} className="flex items-center justify-between gap-4">
            <span>{item.native}<span className="ml-2 text-xs text-muted-foreground">{item.name}</span></span>
            {item.code === language && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}