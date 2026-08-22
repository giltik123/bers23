import { useState, useEffect, useCallback } from 'react';
import { projectService } from '@/lib/projectService';

// Project state is server-authoritative. This hook never constructs image history or version identity locally.
export default function useProject(projectId) {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const validProjectId = typeof projectId === 'string' ? projectId.trim() : '';
    if (!validProjectId) {
      setProject(null); setError('Project ID is required'); setLoading(false); return;
    }
    setLoading(true); setError(null);
    try { setProject(await projectService.get(validProjectId)); }
    catch (e) { console.error('[Editor] Failed to load project', e); setProject(null); setError(e?.message || 'Failed to load project'); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const apply = async (operation) => { const updated = await operation(); setProject(updated); return updated; };
  const save = (data) => apply(() => projectService.update(projectId, data));
  const rename = (name) => save({ name });
  const saveObjects = (objects) => save({ objects, status: 'editing' });
  const selectObject = (objectId) => save({ objects: (project.objects || []).map((o) => ({ ...o, selected: o.id === objectId })) });

  const acceptFinal = (finalArtifactId, instruction, { executionId, type = 'edit', creditsUsed = 0 } = {}) =>
    apply(() => projectService.acceptFinal(projectId, { finalArtifactId, executionId, instruction, operation: type, creditsUsed }));
  const undo = () => apply(() => projectService.undo(projectId));
  const redo = () => apply(() => projectService.redo(projectId));
  const restoreOriginal = () => apply(() => projectService.restoreOriginal(projectId));
  const createVersion = (name) => apply(() => projectService.createVersion(projectId, name));
  const restoreVersion = (version) => apply(() => projectService.restoreVersion(projectId, version.id));

  const canUndo = project ? Boolean(project.can_undo ?? project.history_index > -1) : false;
  const canRedo = project ? Boolean(project.can_redo ?? ((project.history || []).length - 1 > project.history_index)) : false;

  return {
    project, loading, error, reload: load,
    rename, saveObjects, selectObject,
    acceptFinal, undo, redo, restoreOriginal,
    createVersion, restoreVersion,
    canUndo, canRedo,
  };
}
