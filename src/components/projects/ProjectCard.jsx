import React from 'react';
import { Link } from 'react-router-dom';
import { Star, Wand2 } from 'lucide-react';
import moment from 'moment';
import ProjectActionsMenu from '@/components/projects/ProjectActionsMenu';
import { previewCache } from '@/lib/performance/previewCache';

export default function ProjectCard({ project, onRename, onDuplicate, onToggleFavorite, onToggleArchive, onDelete }) {
  const edits = project.operations?.length || 0;
  const previewUrl = previewCache.gallery(project);
  return (
    <div className="group relative rounded-2xl overflow-hidden border border-border/60 bg-card hover:shadow-lg transition-all duration-300">
      <Link to={`/editor?id=${project.id}`} className="block">
        <div className="aspect-square bg-muted overflow-hidden">
          {previewUrl ? <img src={previewUrl} alt={project.name} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /> : <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">Preview unavailable</div>}
        </div>
        <div className="p-3">
          <div className="flex items-center gap-1.5 min-w-0">
            {project.favorite && <Star className="w-3.5 h-3.5 shrink-0 fill-amber-400 text-amber-400" />}
            <p className="font-medium text-sm truncate">{project.name}</p>
          </div>
          <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
            <span>{moment(project.updated_date).fromNow()}</span>
            {edits > 0 && (
              <span className="flex items-center gap-1"><Wand2 className="w-3 h-3" />{edits}</span>
            )}
          </div>
          {project.width && project.height && (
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">{project.width} × {project.height}px</p>
          )}
        </div>
      </Link>
      <div className="absolute top-2 right-2 flex gap-1">
        <button
          onClick={(e) => { e.preventDefault(); onToggleFavorite(project); }}
          className="p-2 rounded-lg bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Toggle favorite"
        >
          <Star className={project.favorite ? 'w-4 h-4 fill-amber-400 text-amber-400' : 'w-4 h-4'} />
        </button>
        <ProjectActionsMenu
          project={project}
          onRename={onRename}
          onDuplicate={onDuplicate}
          onToggleFavorite={onToggleFavorite}
          onToggleArchive={onToggleArchive}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}