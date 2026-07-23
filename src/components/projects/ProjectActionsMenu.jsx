import React from 'react';
import { MoreVertical, Pencil, Copy, Star, Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

export default function ProjectActionsMenu({ project, onRename, onDuplicate, onToggleFavorite, onToggleArchive, onDelete }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.preventDefault()}
          className="p-2 rounded-lg bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Project actions"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onRename(project)}><Pencil className="w-4 h-4 mr-2" /> Rename</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDuplicate(project)}><Copy className="w-4 h-4 mr-2" /> Duplicate</DropdownMenuItem>
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