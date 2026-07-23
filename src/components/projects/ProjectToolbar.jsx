import React from 'react';
import { Search, Archive } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SORT_OPTIONS } from '@/lib/projectService';

export default function ProjectToolbar({ query, onQueryChange, sortBy, onSortChange, showArchived, onToggleArchived }) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 mb-6">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search projects…"
          className="pl-9 rounded-xl"
        />
      </div>
      <div className="flex gap-2">
        <Select value={sortBy} onValueChange={onSortChange}>
          <SelectTrigger className="w-[150px] rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant={showArchived ? 'secondary' : 'outline'}
          onClick={onToggleArchived}
          className="rounded-xl"
        >
          <Archive className="w-4 h-4 mr-2" /> {showArchived ? 'Archived' : 'Active'}
        </Button>
      </div>
    </div>
  );
}