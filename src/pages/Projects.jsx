import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ProjectCard from '@/components/projects/ProjectCard';
import ProjectToolbar from '@/components/projects/ProjectToolbar';
import ErrorBanner from '@/components/editor/ErrorBanner';
import { projectService, searchProjects, sortProjects } from '@/lib/projectService';
import { imageMemoryCache } from '@/lib/performance/imageMemoryCache';
import { previewCache } from '@/lib/performance/previewCache';
import { networkManager } from '@/lib/performance/networkManager';
import { offlineQueue } from '@/lib/performance/offlineQueue';

export default function Projects() {
  const [projects, setProjects] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [showArchived, setShowArchived] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const fileRef = useRef(null);
  const navigate = useNavigate();

  const reload = async () => {
    setProjects(null);
    setLoadError('');
    try {
      setProjects(await projectService.list());
    } catch (error) {
      console.error('[Projects] Failed to load projects', error);
      setLoadError(error?.message || 'Unable to load projects.');
    }
  };
  const createProjectFromFile = (file) => projectService.createFromFile(file);
  useEffect(() => { reload(); offlineQueue.register('project-upload', async ({ file }) => { await createProjectFromFile(file); await reload(); }); }, []);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadError('');
    try {
      const project = await createProjectFromFile(file);
      navigate(`/editor?id=${project.id}`);
    } catch (error) {
      console.error('[Projects] Failed to create project', error);
      const retryable = !networkManager.snapshot().online || /network|fetch|timeout/i.test(error?.message || '');
      if (retryable) { offlineQueue.enqueue({ kind: 'project-upload', file }); setUploadError('This upload will retry when your connection returns.'); }
      else setUploadError(error?.message || 'Unable to create this project.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleRename = async (project) => {
    const name = window.prompt('Rename project', project.name);
    if (!name || name === project.name) return;
    setActionError('');
    try { await projectService.rename(project.id, name); await reload(); }
    catch (error) { console.error('[Projects] Failed to rename project', error); setActionError(error?.message || 'Unable to rename project.'); }
  };

  const handleDuplicate = async () => {
    setActionError('');
    setActionError('Duplicate will be available with server-authoritative project history.');
  };

  const handleToggleFavorite = async (project) => {
    setActionError('');
    try { await projectService.setFavorite(project.id, !project.favorite); await reload(); }
    catch (error) { console.error('[Projects] Failed to update favorite', error); setActionError(error?.message || 'Unable to update project.'); }
  };

  const handleToggleArchive = async (project) => {
    setActionError('');
    try { await projectService.setArchived(project.id, !project.archived); await reload(); }
    catch (error) { console.error('[Projects] Failed to update archive state', error); setActionError(error?.message || 'Unable to update project.'); }
  };

  const handleDelete = async (project) => {
    setActionError('');
    try { await projectService.remove(project.id); setProjects((current) => current.filter((p) => p.id !== project.id)); }
    catch (error) { console.error('[Projects] Failed to delete project', error); setActionError(error?.message || 'Unable to delete project.'); }
  };

  const visible = projects
    ? sortProjects(searchProjects(projects.filter((p) => !!p.archived === showArchived), query), sortBy)
    : null;

  useEffect(() => { const thumbnails = (visible || []).map((project) => ({ key: `${project.id}:thumbnail`, url: previewCache.gallery(project) })); imageMemoryCache.setVisible(thumbnails.map((item) => item.key)); const cancels = thumbnails.map((item) => previewCache.warm(item.url)); return () => cancels.forEach((cancel) => cancel()); }, [visible]);

  const cardActions = {
    onRename: handleRename,
    onDuplicate: handleDuplicate,
    onToggleFavorite: handleToggleFavorite,
    onToggleArchive: handleToggleArchive,
    onDelete: handleDelete,
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">Edit objects, not entire images.</p>
        </div>
        <Button onClick={() => fileRef.current.click()} disabled={uploading} className="rounded-xl">
          {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
          New project
        </Button>
      </div>

      {uploadError && <p className="mb-4 rounded-xl border border-destructive/30 px-3 py-2 text-sm text-destructive">{uploadError}</p>}

      {loadError && <div className="mb-4"><ErrorBanner message={loadError} onRetry={reload} /></div>}
      {actionError && <div className="mb-4"><ErrorBanner message={actionError} /></div>}

      <ProjectToolbar
        query={query} onQueryChange={setQuery}
        sortBy={sortBy} onSortChange={setSortBy}
        showArchived={showArchived} onToggleArchived={() => setShowArchived(!showArchived)}
      />

      {!visible && !loadError ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : loadError ? null : visible.length === 0 ? (
        query || showArchived ? (
          <p className="text-center text-sm text-muted-foreground py-20">
            {showArchived ? 'No archived projects.' : 'No projects match your search.'}
          </p>
        ) : (
          <button
            onClick={() => fileRef.current.click()}
            className="w-full border-2 border-dashed border-border rounded-3xl py-20 flex flex-col items-center gap-3 text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
          >
            <ImageIcon className="w-10 h-10" />
            <span className="font-medium">Upload a photo to start</span>
            <span className="text-xs">Your projects will appear here</span>
          </button>
        )
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {visible.map((p) => <ProjectCard key={p.id} project={p} {...cardActions} />)}
        </div>
      )}
    </div>
  );
}
