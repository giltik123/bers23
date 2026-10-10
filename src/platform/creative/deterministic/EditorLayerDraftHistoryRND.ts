import {
  changeEditorLayerDocumentRND,
  type EditorLayerDocumentRND,
  type EditorLayerDraftChangeRND,
} from './EditorLayerDocumentRND';

export type EditorLayerDraftHistoryRND = Readonly<{
  kind: 'BERS_EDITOR_LAYER_DRAFT_HISTORY_RND';
  sourceSha256: string;
  current: EditorLayerDocumentRND;
  undo: readonly EditorLayerDocumentRND[];
  redo: readonly EditorLayerDocumentRND[];
  maximumSteps: 64;
  coreAuthorityGranted: false;
}>;

function guardDocument(value: EditorLayerDocumentRND): void {
  if (!value || value.kind !== 'BERS_EDITOR_LAYER_DRAFT_RND' ||
      value.schemaVersion !== 1 || value.authority !== 'NONE_RESEARCH_ONLY' ||
      !Number.isSafeInteger(value.revision) || value.revision < 0 ||
      typeof value.sourceSha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(value.sourceSha256)) {
    throw new Error('Editor history requires a valid non-authoritative layer draft');
  }
}
function historyState(
  current: EditorLayerDocumentRND,
  undo: readonly EditorLayerDocumentRND[],
  redo: readonly EditorLayerDocumentRND[],
): EditorLayerDraftHistoryRND {
  return Object.freeze({
    kind:'BERS_EDITOR_LAYER_DRAFT_HISTORY_RND',
    sourceSha256:current.sourceSha256,
    current,
    undo:Object.freeze([...undo]),redo:Object.freeze([...redo]),
    maximumSteps:64,coreAuthorityGranted:false,
  });
}
function assertCurrent(
  state: EditorLayerDraftHistoryRND,
  expectedRevision: number,
  currentSourceSha256: string,
): void {
  if (!state || state.kind !== 'BERS_EDITOR_LAYER_DRAFT_HISTORY_RND' ||
      state.coreAuthorityGranted !== false || state.maximumSteps !== 64 ||
      !Array.isArray(state.undo) || !Array.isArray(state.redo) ||
      state.undo.length > 64 || state.redo.length > 64) {
    throw new Error('Editor history state is malformed');
  }
  guardDocument(state.current);
  if (!Number.isSafeInteger(expectedRevision) ||
      state.current.revision !== expectedRevision ||
      state.current.revision === Number.MAX_SAFE_INTEGER) {
    throw new Error('Editor history is stale');
  }
  if (currentSourceSha256 !== state.sourceSha256 ||
      currentSourceSha256 !== state.current.sourceSha256) {
    throw new Error('Editor history source SHA drift');
  }
  for(const entry of [...state.undo,...state.redo]){
    guardDocument(entry);
    if (entry.sourceSha256 !== currentSourceSha256 ||
        entry.tenantId !== state.current.tenantId ||
        entry.projectId !== state.current.projectId ||
        entry.sourceArtifactId !== state.current.sourceArtifactId ||
        entry.width !== state.current.width ||
        entry.height !== state.current.height) {
      throw new Error('Editor history snapshots cross source/project bounds');
    }
  }
}
function restored(
  snapshot: EditorLayerDocumentRND,
  nextRevision: number,
): EditorLayerDocumentRND {
  return Object.freeze({...snapshot,revision:nextRevision});
}

export function createEditorLayerDraftHistoryRND(document: EditorLayerDocumentRND): EditorLayerDraftHistoryRND {
  guardDocument(document);
  return historyState(document,[],[]);
}
export function applyEditorLayerDraftHistoryRND(
  state: EditorLayerDraftHistoryRND,
  expectedRevision: number,
  currentSourceSha256: string,
  change: EditorLayerDraftChangeRND,
): EditorLayerDraftHistoryRND {
  assertCurrent(state,expectedRevision,currentSourceSha256);
  const next=changeEditorLayerDocumentRND(state.current,{
    expectedRevision,currentSourceSha256:undefined as never,
    sourceSha256:currentSourceSha256,change,
  });
  return historyState(next,[...state.undo.slice(-63),state.current],[]);
}
export function undoEditorLayerDraftHistoryRND(
  state: EditorLayerDraftHistoryRND,
  expectedRevision: number,
  currentSourceSha256: string,
): EditorLayerDraftHistoryRND {
  assertCurrent(state,expectedRevision,currentSourceSha256);
  if (state.undo.length === 0) throw new Error('Editor history undo stack empty');
  const previous=state.undo[state.undo.length-1];
  return historyState(restored(previous,expectedRevision+1),
    state.undo.slice(0,-1),[...state.redo.slice(-63),state.current]);
}
export function redoEditorLayerDraftHistoryRND(
  state: EditorLayerDraftHistoryRND,
  expectedRevision: number,
  currentSourceSha256: string,
): EditorLayerDraftHistoryRND {
  assertCurrent(state,expectedRevision,currentSourceSha256);
  if (state.redo.length === 0) throw new Error('Editor history redo stack empty');
  const next=state.redo[state.redo.length-1];
  return historyState(restored(next,expectedRevision+1),
    [...state.undo.slice(-63),state.current],state.redo.slice(0,-1));
}
