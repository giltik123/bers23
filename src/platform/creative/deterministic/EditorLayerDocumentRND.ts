/**
 * Versioned, source-bound, in-memory non-destructive Editor document.
 * Research only. Artifact references are untrusted text until canonical Core
 * rehydrates and checks tenant/project ownership and exact stored SHA-256.
 * This module does not persist, upload, issue FINAL or confer edit authority.
 */
export type EditorLayerReferenceRND = Readonly<{
  id: string;
  artifactId: string;
  artifactSha256: string;
  maskArtifactId?: string;
  maskSha256?: string;
  visible: boolean;
  locked: boolean;
  opacityQ8: number;
  blendMode: 'NORMAL';
}>;

export type EditorLayerDocumentRND = Readonly<{
  schemaVersion: 1;
  kind: 'BERS_EDITOR_LAYER_DRAFT_RND';
  tenantId: string;
  projectId: string;
  sourceArtifactId: string;
  sourceSha256: string;
  width: number;
  height: number;
  revision: number;
  layers: readonly EditorLayerReferenceRND[];
  authority: 'NONE_RESEARCH_ONLY';
}>;

export type EditorLayerDraftChangeRND =
  | Readonly<{ type: 'ADD'; layer: EditorLayerReferenceRND }>
  | Readonly<{ type: 'REMOVE'; layerId: string }>
  | Readonly<{ type: 'MOVE'; layerId: string; toIndex: number }>
  | Readonly<{ type: 'SET_VISIBILITY'; layerId: string; visible: boolean }>
  | Readonly<{ type: 'SET_OPACITY'; layerId: string; opacityQ8: number }>;

const hex64=/^[0-9a-f]{64}$/u;
const ref=/^[a-zA-Z0-9][a-zA-Z0-9:_.-]{0,127}$/u;

function requireReference(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !ref.test(value)) throw new Error(`Editor document invalid ${label}`);
}
function requireSha(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !hex64.test(value)) throw new Error(`Editor document invalid ${label}`);
}
function checkedLayer(value: EditorLayerReferenceRND): EditorLayerReferenceRND {
  if (!value || typeof value !== 'object') throw new Error('Editor document requires layer reference');
  requireReference(value.id,'layer ID');
  requireReference(value.artifactId,'layer artifact ID');
  requireSha(value.artifactSha256,'layer artifact SHA');
  if ((value.maskArtifactId === undefined) !== (value.maskSha256 === undefined)) {
    throw new Error('Editor document layer MASK must include both artifact ID and SHA');
  }
  if (value.maskArtifactId !== undefined) {
    requireReference(value.maskArtifactId,'mask artifact ID');
    requireSha(value.maskSha256,'mask artifact SHA');
  }
  if (typeof value.visible !== 'boolean' || typeof value.locked !== 'boolean' ||
      !Number.isSafeInteger(value.opacityQ8) || value.opacityQ8 < 0 || value.opacityQ8 > 255 ||
      value.blendMode !== 'NORMAL') throw new Error('Editor document layer parameters invalid');
  return Object.freeze({
    id:value.id,artifactId:value.artifactId,artifactSha256:value.artifactSha256,
    ...(value.maskArtifactId === undefined?{}:{maskArtifactId:value.maskArtifactId,maskSha256:value.maskSha256}),
    visible:value.visible,locked:value.locked,opacityQ8:value.opacityQ8,blendMode:'NORMAL' as const,
  });
}

/** Creates a frozen draft that contains asset references only, never full image bytes. */
export function createEditorLayerDocumentRND(input: Readonly<{
  tenantId: string; projectId: string; sourceArtifactId: string; sourceSha256: string;
  width: number; height: number; layers?: readonly EditorLayerReferenceRND[];
}>): EditorLayerDocumentRND {
  if (!input || typeof input !== 'object') throw new Error('Editor document input required');
  requireReference(input.tenantId,'tenant');
  requireReference(input.projectId,'project');
  requireReference(input.sourceArtifactId,'source artifact');
  requireSha(input.sourceSha256,'source SHA');
  if (!Number.isSafeInteger(input.width) || !Number.isSafeInteger(input.height) ||
      input.width < 1 || input.height < 1 || input.width > 16_384 || input.height > 16_384 ||
      input.width * input.height > 16_777_216) throw new Error('Editor document source geometry invalid');
  const entries = input.layers ?? [];
  if (!Array.isArray(entries) || entries.length > 32) throw new Error('Editor document layer count exceeded');
  const layers=entries.map(checkedLayer);
  if (new Set(layers.map(layer=>layer.id)).size !== layers.length) {
    throw new Error('Editor document layer IDs duplicate');
  }
  return Object.freeze({
    schemaVersion:1,kind:'BERS_EDITOR_LAYER_DRAFT_RND',tenantId:input.tenantId,
    projectId:input.projectId,sourceArtifactId:input.sourceArtifactId,
    sourceSha256:input.sourceSha256,width:input.width,height:input.height,
    revision:0,layers:Object.freeze(layers),authority:'NONE_RESEARCH_ONLY',
  });
}

function readLayerIndex(layers: readonly EditorLayerReferenceRND[], id: string): number {
  requireReference(id,'layer ID');
  const index=layers.findIndex(item=>item.id===id);
  if(index<0)throw new Error('Editor document layer not found');
  return index;
}

/**
 * Revision CAS + exact source-identity precondition. This is a local draft
 * concurrency invariant, NOT Core's persisted Project CAS/revision lock.
 */
export function changeEditorLayerDocumentRND(
  document: EditorLayerDocumentRND,
  input: Readonly<{ expectedRevision: number; sourceSha256: string; change: EditorLayerDraftChangeRND }>,
): EditorLayerDocumentRND {
  if (!document || document.kind !== 'BERS_EDITOR_LAYER_DRAFT_RND' ||
      document.schemaVersion !== 1 || document.authority !== 'NONE_RESEARCH_ONLY') {
    throw new Error('Editor document authority or schema mismatch');
  }
  if (!input || !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision !== document.revision || document.revision === Number.MAX_SAFE_INTEGER) {
    throw new Error('Editor document stale revision');
  }
  requireSha(input.sourceSha256,'current source SHA');
  if (input.sourceSha256 !== document.sourceSha256) throw new Error('Editor document source SHA drift');
  const change=input.change;
  if (!change || typeof change !== 'object') throw new Error('Editor document change required');
  const layers=[...document.layers];
  switch(change.type){
    case 'ADD': {
      if(layers.length>=32) throw new Error('Editor document layer count exceeded');
      const layer=checkedLayer(change.layer);
      if(layers.some(value=>value.id===layer.id))throw new Error('Editor document layer IDs duplicate');
      layers.push(layer); break;
    }
    case 'REMOVE': {
      const index=readLayerIndex(layers,change.layerId);
      if(layers[index].locked)throw new Error('Editor document layer locked');
      layers.splice(index,1);break;
    }
    case 'MOVE': {
      const index=readLayerIndex(layers,change.layerId);
      if(layers[index].locked)throw new Error('Editor document layer locked');
      if(!Number.isSafeInteger(change.toIndex) || change.toIndex<0 || change.toIndex>=layers.length) {
        throw new Error('Editor document destination index invalid');
      }
      const [item]=layers.splice(index,1);
      layers.splice(change.toIndex,0,item);break;
    }
    case 'SET_VISIBILITY': {
      const index=readLayerIndex(layers,change.layerId);
      if(layers[index].locked)throw new Error('Editor document layer locked');
      if(typeof change.visible!=='boolean')throw new Error('Editor document layer visibility invalid');
      layers[index]=Object.freeze({...layers[index],visible:change.visible});break;
    }
    case 'SET_OPACITY': {
      const index=readLayerIndex(layers,change.layerId);
      if(layers[index].locked)throw new Error('Editor document layer locked');
      if(!Number.isSafeInteger(change.opacityQ8) || change.opacityQ8<0 || change.opacityQ8>255) {
        throw new Error('Editor document layer opacity invalid');
      }
      layers[index]=Object.freeze({...layers[index],opacityQ8:change.opacityQ8});break;
    }
    default:throw new Error('Editor document operation is unsupported');
  }
  return Object.freeze({...document,revision:document.revision+1,layers:Object.freeze(layers)});
}
