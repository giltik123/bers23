import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ProjectCard from '@/components/projects/ProjectCard';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import ProjectToolbar from '@/components/projects/ProjectToolbar';
import ErrorBanner from '@/components/editor/ErrorBanner';
import { projectService, searchProjects, sortProjects } from '@/lib/projectService';
import { imageMemoryCache } from '@/lib/performance/imageMemoryCache';
import { previewCache } from '@/lib/performance/previewCache';
import { networkManager } from '@/lib/performance/networkManager';
import { offlineQueue } from '@/lib/performance/offlineQueue';

export default function Projects() {
  const { t } = useTranslation();
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
      setLoadError(error?.message || t('projectUi.listFailed'));
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
      if (retryable) { offlineQueue.enqueue({ kind: 'project-upload', file }); setUploadError(t('projectUi.retryQueued')); }
      else setUploadError(error?.message || t('projectUi.createFailed'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleRename = async (project) => {
    const name = window.prompt(t('projectUi.renameTitle'), project.name);
    if (!name || name === project.name) return;
    setActionError('');
    try { await projectService.rename(project.id, name); await reload(); }
    catch (error) { console.error('[Projects] Failed to rename project', error); setActionError(error?.message || t('projectUi.renameFailed')); }
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
    catch (error) { console.error('[Projects] Failed to delete project', error); setActionError(error?.message || t('projectUi.deleteFailed')); }
  };

  const visible = projects
    ? sortProjects(searchProjects(projects.filter((p) => !!p.archived === showArchived), query), sortBy)
    : null;

  useEffect(() => { const thumbnails = (visible || []).map((project) => ({ key: `${project.id}:thumbnail`, url: previewCache.gallery(project) })); imageMemoryCache.setVisible(thumbnails.map((item) => item.key)); const cancels = thumbnails.map((item) => previewCache.warm(item.url)); return () => cancels.forEach((cancel) => cancel()); }, [visible]);

  const cardActions = {
    onRename: handleRename,
    onToggleFavorite: handleToggleFavorite,
    onToggleArchive: handleToggleArchive,
    onDelete: handleDelete,
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-7 px-4 py-7 sm:space-y-8 sm:px-6 sm:py-10">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} aria-label={t('projectUi.fileInput')} />
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{t('projectUi.workspace')}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{t('navUi.projects')}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t('projectUi.intro')}</p>
      </header>

      <section aria-label={t('projectUi.startEditing')} className="relative overflow-hidden rounded-3xl border border-teal-800/40 bg-gradient-to-br from-teal-950 via-teal-900 to-teal-800 p-6 text-white shadow-lg sm:p-8">
        <div className="relative z-10 max-w-2xl space-y-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-200">{t('projectUi.createSomething')}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{t('projectUi.hero')}</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-teal-50/85">{t('projectUi.heroHint')}</p>
          </div>
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="min-h-12 rounded-xl bg-white px-5 font-semibold text-teal-950 shadow-sm hover:bg-teal-50"
          >
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="mr-2 h-4 w-4" aria-hidden="true" />}
            {uploading ? t('projectUi.creating') : t('projectUi.newProject')}
          </Button>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-teal-50/80" aria-label="How editing works">
            <span><strong className="mr-1 text-white">01</strong> {t("projectUi.stepUpload")}</span>
            <span><strong className="mr-1 text-white">02</strong> {t("projectUi.stepEdit")}</span>
            <span><strong className="mr-1 text-white">03</strong> {t("projectUi.stepSave")}</span>
          </div>
        </div>
        <div className="pointer-events-none absolute -right-16 -top-24 h-80 w-80 rounded-full border border-teal-200/15 bg-teal-200/10 blur-2xl" aria-hidden="true" />
      </section>

      {uploadError && <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{uploadError}</p>}
      {loadError && <ErrorBanner message={loadError} onRetry={reload} />}
      {actionError && <ErrorBanner message={actionError} />}

      <section aria-label="Project library" className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{t('projectUi.projectLibrary')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('projectUi.libraryHint')}</p>
          </div>
          {visible && <span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground" aria-live="polite">{t('projectUi.shown', { count: visible.length })}</span>}
        </div>

        <ProjectToolbar
          query={query} onQueryChange={setQuery}
          sortBy={sortBy} onSortChange={setSortBy}
          showArchived={showArchived} onToggleArchived={() => setShowArchived(!showArchived)}
        />

        {!visible && !loadError ? (
          <div className="flex justify-center rounded-3xl border border-border/70 bg-card py-20" role="status" aria-label={t('projectUi.loading')}><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : loadError ? null : visible.length === 0 ? (
          query || showArchived ? (
            <div className="rounded-3xl border border-border/70 bg-card px-6 py-16 text-center">
              <p className="text-sm font-medium">{showArchived ? t('projectUi.archivedEmpty') : t('projectUi.matchingEmpty')}</p>
              <p className="mt-2 text-sm text-muted-foreground">{t('projectUi.trySearch')}</p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex w-full flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-border bg-card px-5 py-20 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent/40 hover:text-foreground"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ImageIcon className="h-7 w-7" /></span>
              <span className="text-base font-semibold text-foreground">{t('projectUi.addFirst')}</span>
              <span className="max-w-sm text-center text-sm">{t('projectUi.firstHint')}</span>
            </button>
          )
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((p) => <ProjectCard key={p.id} project={p} {...cardActions} />)}
          </div>
        )}
      </section>
    </div>
  );
}
