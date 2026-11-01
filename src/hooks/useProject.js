import { useState, useEffect, useCallback, useRef } from 'react';
import { projectService } from '@/lib/projectService';
import { createProjectRequestGate } from './projectRequestGate';

// All Project/history/version mutations remain Core-owned. The request gate
// only prevents stale async responses from crossing Editor Project boundaries.
export default function useProject(projectId) {
  const activeId = typeof projectId === 'string' ? projectId.trim() : '';
  const gateRef = useRef(null);
  if (!gateRef.current) gateRef.current = createProjectRequestGate(activeId);
  // Sync during render: a response for the old Project must be invalidated
  // even before React runs the effect cleanup for a route change.
  gateRef.current.sync(activeId);

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(Boolean(activeId));
  const [error, setError] = useState(null);
  const [stateOwnerId, setStateOwnerId] = useState(activeId);

  const load = useCallback(async () => {
    const gate = gateRef.current;
    const ticket = gate.begin(activeId);
    if (ticket === null) return;

    setStateOwnerId(activeId);
    if (!activeId) {
      setProject(null);
      setError('Project ID is required');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const loaded = await projectService.get(activeId);
      if (!gate.isCurrent(activeId, ticket)) return;
      if (loaded?.id !== activeId) throw new Error('Project response identity mismatch');
      setProject(loaded);
    } catch (e) {
      if (!gate.isCurrent(activeId, ticket)) return;
      console.error('[Editor] Failed to load project', e);
      setProject(null);
      setError(e?.message || 'Failed to load project');
    } finally {
      if (gate.isCurrent(activeId, ticket)) setLoading(false);
    }
  }, [activeId]);

  useEffect(() => {
    load();
    return () => gateRef.current.invalidate();
  }, [load]);

  const runMutation = async (operation) => {
    const gate = gateRef.current;
    const ticket = gate.begin(activeId);
    if (ticket === null || !activeId) throw new Error('Project changed before action');
    // A mutation supersedes any pending reload; it must not leave its spinner
    // active after the older read has been correctly ignored.
    setLoading(false);
    setError(null);
    const updated = await operation();
    if (!gate.isCurrent(activeId, ticket)) return updated;
    if (updated?.id !== activeId) throw new Error('Project response identity mismatch');
    setProject(updated);
    return updated;
  };

  const save = (data) => runMutation(() => projectService.update(activeId, data));
  const rename = (name) => save({ name });
  const activeProject = stateOwnerId === activeId && project?.id === activeId ? project : null;

  // Auto-save detected objects and selection through the canonical Project API.
  const saveObjects = (objects) => save({ objects });
  const selectObject = (objectId) =>
    save({
      objects: (activeProject?.objects || []).map((o) => ({ ...o, selected: o.id === objectId })),
    });

  const pushEdit = (finalArtifactId, instruction) =>
    runMutation(() => projectService.acceptFinal(activeId, finalArtifactId, instruction));
  const canUndo = activeProject ? activeProject.history_index > 0 : false;
  const canRedo = activeProject ? (activeProject.history || []).length - 1 > activeProject.history_index : false;
  const undo = () => canUndo ? runMutation(() => projectService.undo(activeId)) : undefined;
  const redo = () => canRedo ? runMutation(() => projectService.redo(activeId)) : undefined;
  const restoreOriginal = () => runMutation(() => projectService.restoreOriginal(activeId));
  const createVersion = (name) => runMutation(() => projectService.createVersion(activeId, name));
  const restoreVersion = (version) => runMutation(() => projectService.restoreVersion(activeId, version.id));

  return {
    project: activeProject,
    loading: stateOwnerId === activeId ? loading : Boolean(activeId),
    error: stateOwnerId === activeId ? error : null,
    reload: load,
    rename, saveObjects, selectObject,
    pushEdit, undo, redo, restoreOriginal,
    createVersion, restoreVersion,
    canUndo, canRedo,
  };
}
