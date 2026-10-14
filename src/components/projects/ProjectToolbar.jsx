import React from 'react';
import { Search, Archive } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SORT_OPTIONS } from '@/lib/projectService';

export default function ProjectToolbar({ query, onQueryChange, sortBy, onSortChange, showArchived, onToggleArchived }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:flex-row sm:items-end sm:gap-4" role="search" aria-label="Find projects">
      <label className="relative flex-1 space-y-1.5 text-xs font-medium text-muted-foreground">
        <span>Search your projects</span>
        <span className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            aria-label="Search projects"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Project name…"
            className="h-11 rounded-xl pl-10"
          />
        </span>
      </label>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="project-sort" className="block text-xs font-medium text-muted-foreground">Sort by</label>
          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger id="project-sort" aria-label="Sort projects" className="h-11 w-[155px] rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
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
          <Archive className="h-4 w-4" aria-hidden="true" /> {showArchived ? 'View active' : 'View archived'}
        </Button>
      </div>
    </div>
  );
}
