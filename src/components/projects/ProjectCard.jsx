import React from 'react';
import { Link } from 'react-router-dom';
import { Star, Wand2 } from 'lucide-react';
import moment from 'moment';
import ProjectActionsMenu from '@/components/projects/ProjectActionsMenu';
import { previewCache } from '@/lib/performance/previewCache';

export default function ProjectCard({ project, onRename, onToggleFavorite, onToggleArchive, onDelete }) {
  const edits = project.operations?.length || 0;
  const previewUrl = previewCache.gallery(project);
  return (
    <div className="group relative rounded-3xl overflow-hidden border border-border/70 bg-card shadow-sm hover:-translate-y-0.5 hover:shadow-xl transition-all duration-300">
      <Link to={`/editor?id=${project.id}`} className="block">
        <div className="aspect-[4/3] bg-muted overflow-hidden">
          {previewUrl ? <img src={previewUrl} alt={project.name} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /> : <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">Preview unavailable</div>}
        </div>
        <div className="space-y-2 p-4">
          <div className="flex items-center gap-1.5 min-w-0">
            {project.favorite && <Star className="w-3.5 h-3.5 shrink-0 fill-amber-400 text-amber-400" />}
            <p className="truncate text-base font-semibold">{project.name}</p>
          </div>
          <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
            <span>{moment(project.updated_date).fromNow()}</span>
            {edits > 0 && (
              <span className="flex items-center gap-1"><Wand2 className="w-3 h-3" />{edits}</span>
            )}
          </div>
          {project.width && project.height && (
            <p className="text-xs text-muted-foreground">{project.width} × {project.height}px</p>
          )}
          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">Open editor <span aria-hidden="true">→</span></span>
        </div>
      </Link>
      <div className="absolute right-3 top-3 flex flex-wrap items-center gap-2">
        <button
          onClick={(e) => { e.preventDefault(); onToggleFavorite(project); }}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-slate-950/75 px-3 text-xs font-medium text-white shadow-sm backdrop-blur hover:bg-slate-950"
          aria-label={project.favorite ? "Remove from favorites" : "Add to favorites"}
          title={project.favorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star className={project.favorite ? 'h-4 w-4 fill-amber-400 text-amber-400' : 'h-4 w-4'} aria-hidden="true" />
          {project.favorite ? 'Saved' : 'Favorite'}
        </button>
        <ProjectActionsMenu
          project={project}
          onRename={onRename}
          onToggleFavorite={onToggleFavorite}
          onToggleArchive={onToggleArchive}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}