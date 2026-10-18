import React from 'react';
import { Search, Archive } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SORT_OPTIONS } from '@/lib/projectService';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

export default function ProjectToolbar({ query, onQueryChange, sortBy, onSortChange, showArchived, onToggleArchived }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:flex-row sm:items-end sm:gap-4" role="search" aria-label={t('projectUi.searchRegion')}>
      <label className="relative flex-1 space-y-1.5 text-xs font-medium text-muted-foreground">
        <span>{t('projectUi.searchYour')}</span>
        <span className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            aria-label={t('projectUi.search')}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('projectUi.searchPlaceholder')}
            className="h-11 rounded-xl pl-10"
          />
        </span>
      </label>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="project-sort" className="block text-xs font-medium text-muted-foreground">{t('projectUi.sortBy')}</label>
          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger id="project-sort" aria-label={t('projectUi.sort')} className="h-11 w-[155px] rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{t({ recent: 'projectUi.sortRecent', created: 'projectUi.sortCreated', name: 'projectUi.sortName', edits: 'projectUi.sortEdits' }[option.value] || 'projectUi.sortRecent')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant={showArchived ? 'secondary' : 'outline'}
          onClick={onToggleArchived}
          aria-pressed={showArchived}
          className="min-h-11 rounded-xl"
        >
          <Archive className="h-4 w-4" aria-hidden="true" /> {showArchived ? t('projectUi.active') : t('projectUi.archived')}
        </Button>
      </div>
    </div>
  );
}
