import React from 'react';
import { GitBranch, Plus, History } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/ru';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function VersionsPanel({ versions = [], onCreate, onRestore, disabled }) {
  const { t, language } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button disabled={disabled} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50" aria-label={t('editControls.versions')}>
          <GitBranch className="h-4 w-4" aria-hidden="true" /> {t('editControls.versions')}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{t('editControls.versions')}</DropdownMenuLabel>
        <DropdownMenuItem onClick={onCreate}>
          <Plus className="w-4 h-4 mr-2" /> {t('editControls.saveVersion')}
        </DropdownMenuItem>
        {versions.length > 0 && <DropdownMenuSeparator />}
        {versions.map((v) => (
          <DropdownMenuItem key={v.id} onClick={() => onRestore(v)}>
            <img src={v.preview_url} alt="" className="w-8 h-8 rounded object-cover mr-2" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm truncate">{v.name}</span>
              <span className="block text-xs text-muted-foreground">{moment(v.created_at).locale(language === 'ru' ? 'ru' : 'en').fromNow()}</span>
            </span>
            <History className="w-3.5 h-3.5 text-muted-foreground" />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}