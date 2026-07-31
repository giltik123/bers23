import { useState, useEffect, useCallback } from 'react';
import { projectService, genId } from '@/lib/projectService';

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

  // Records the edit in history AND as an EditOperation. Clears stale objects.
  const pushEdit = (imageUrl, instruction, { objectId = null, type = 'edit', creditsUsed = 1 } = {}) => {
    const kept = (project.history || []).slice(0, project.history_index + 1);
    const history = [...kept, { image_url: imageUrl, instruction, operation: type, created_at: new Date().toISOString() }];
    const operation = {
      id: genId(),
      object_id: objectId,
      prompt: instruction,
      type,
      created_at: new Date().toISOString(),
      preview_image_url: project.current_image_url,
      result_image_url: imageUrl,
      credits_used: creditsUsed,
      status: 'completed',
    };
    return save({
      current_image_url: imageUrl,
      thumbnail_url: imageUrl,
      status: 'editing',
      history,
      history_index: history.length - 1,
      operations: [...(project.operations || []), operation],
      objects: [],
    });
  };

  const undo = () => {
    const i = project.history_index - 1;
    if (i < -1) return;
    const url = i === -1 ? project.original_image_url : project.history[i].image_url;
    return save({ current_image_url: url, thumbnail_url: url, history_index: i, objects: [] });
  };

  const redo = () => {
    const i = project.history_index + 1;
    if (!project.history || i >= project.history.length) return;
    const url = project.history[i].image_url;
    return save({ current_image_url: url, thumbnail_url: url, history_index: i, objects: [] });
  };

  const restoreOriginal = () =>
    save({
      current_image_url: project.original_image_url,
      thumbnail_url: project.original_image_url,
      history_index: -1,
      objects: [],
    });

  // Snapshots the current state as a named version (auto-saved).
  const createVersion = (name) =>
    save({
      versions: [
        ...(project.versions || []),
        {
          id: genId(),
          name,
          created_at: new Date().toISOString(),
          preview_url: project.current_image_url,
          operations_included: (project.operations || []).map((o) => o.id),
        },
      ],
    });

  // Restoring a version is recorded as a history step, so it stays undoable.
  const restoreVersion = (version) =>
    pushEdit(version.preview_url, `Restored version "${version.name}"`, {
      type: 'restore_version',
      creditsUsed: 0,
    });

  const canUndo = project ? project.history_index > -1 : false;
  const canRedo = project ? (project.history || []).length - 1 > project.history_index : false;

  return {
    project, loading, error, reload: load,
    rename, saveObjects, selectObject,
    pushEdit, undo, redo, restoreOriginal,
    createVersion, restoreVersion,
    canUndo, canRedo,
  };
}
