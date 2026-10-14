import React from 'react';
import { MoreVertical, Pencil, Star, Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

export default function ProjectActionsMenu({ project, onRename, onToggleFavorite, onToggleArchive, onDelete }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.preventDefault()}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-slate-950/75 px-3 text-xs font-medium text-white shadow-sm backdrop-blur hover:bg-slate-950"
          aria-label="Project options"
        >
          <MoreVertical className="h-4 w-4" aria-hidden="true" /> Options
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onRename(project)}><Pencil className="w-4 h-4 mr-2" /> Rename</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onToggleFavorite(project)}>
          <Star className="w-4 h-4 mr-2" /> {project.favorite ? 'Unfavorite' : 'Favorite'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onToggleArchive(project)}>
          {project.archived ? <ArchiveRestore className="w-4 h-4 mr-2" /> : <Archive className="w-4 h-4 mr-2" />}
          {project.archived ? 'Restore' : 'Archive'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onDelete(project)} className="text-destructive focus:text-destructive">
          <Trash2 className="w-4 h-4 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}