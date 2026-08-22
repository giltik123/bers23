import { useState, useEffect, useCallback } from 'react';
import { projectService } from '@/lib/projectService';

// All project/history/version business logic lives here — never in UI components.
// Every mutation auto-saves the project entity.
export default function useProject(projectId) {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const validProjectId = typeof projectId === 'string' ? projectId.trim() : '';
    if (!validProjectId) {
      setProject(null);
      setError('Project ID is required');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setProject(await projectService.get(validProjectId));
    } catch (e) {
      console.error('[Editor] Failed to load project', e);
      setProject(null);
      setError(e?.message || 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const save = async (data) => {
    const updated = await projectService.update(projectId, data);
    setProject(updated);
    return updated;
  };

  const rename = (name) => save({ name });

  // Auto-save detected objects (object list persists on the project).
  const saveObjects = (objects) => save({ objects, status: 'editing' });

  // Auto-save object selection.
  const selectObject = (objectId) =>
    save({
      objects: (project.objects || []).map((o) => ({ ...o, selected: o.id === objectId })),
    });

  const pushEdit = async (finalArtifactId, instruction) => { const updated = await projectService.acceptFinal(projectId, finalArtifactId, instruction); setProject(updated); return updated; };

  const serverMutation = async (operation) => { const updated=await operation(); setProject(updated); return updated; };
  const undo = () => canUndo ? serverMutation(() => projectService.undo(projectId)) : undefined;

  const redo = () => canRedo ? serverMutation(() => projectService.redo(projectId)) : undefined;

  const restoreOriginal = () => serverMutation(() => projectService.restoreOriginal(projectId));

  // Snapshots the current state as a named version (auto-saved).
  const createVersion = (name) => serverMutation(() => projectService.createVersion(projectId, name));

  // Restoring a version is recorded as a history step, so it stays undoable.
  const restoreVersion = (version) => serverMutation(() => projectService.restoreVersion(projectId, version.id));

  const canUndo = project ? project.history_index > 0 : false;
  const canRedo = project ? (project.history || []).length - 1 > project.history_index : false;

  return {
    project, loading, error, reload: load,
    rename, saveObjects, selectObject,
    pushEdit, undo, redo, restoreOriginal,
    createVersion, restoreVersion,
    canUndo, canRedo,
  };
}
