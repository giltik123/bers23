/** Typed Voice Intent -> existing Editor handlers, never a voice-owned engine. */
export const VOICE_EXECUTABLE_KINDS=Object.freeze([
  'NAVIGATE','HISTORY_UNDO','HISTORY_REDO','HISTORY_RESTORE',
  'TRANSFORM','RESIZE','WARDROBE_QUERY',
]);
const modes=new Set([
  'FLIP_HORIZONTAL','FLIP_VERTICAL','ROTATE_90_CW','ROTATE_180','ROTATE_270_CW',
]);
const tabs=new Set(['prompt','creative','agent','fashion','outfits','recipes']);
export function admitVoiceEditorAction(draft,context){
  if(!draft||draft.schemaVersion!==1||draft.privacy!=='LOCAL_ONLY'||
     draft.engine!=='OS_ON_DEVICE'||draft.requiresConfirmation!==true)
    throw new Error('VOICE_DRAFT_NOT_ADMITTED');
  if(!context?.projectId || !context?.sourceArtifactId ||
     context.projectId!==context.confirmedProjectId ||
     context.sourceArtifactId!==context.confirmedSourceArtifactId)
    throw new Error('VOICE_SOURCE_CHANGED');
  if(context.busy||context.selectionActive||context.hasPendingResult)
    throw new Error('VOICE_EDITOR_BUSY');
  if(!VOICE_EXECUTABLE_KINDS.includes(draft.kind))
    throw new Error('VOICE_ACTION_NOT_SUPPORTED');
  const args=draft.params||{};
  if(draft.kind==='NAVIGATE' && !tabs.has(args.tab))
    throw new Error('VOICE_TARGET_UNKNOWN');
  if(draft.kind==='TRANSFORM' && !modes.has(args.mode))
    throw new Error('VOICE_TRANSFORM_UNKNOWN');
  if(draft.kind==='RESIZE' && (!Number.isSafeInteger(args.width)||
     !Number.isSafeInteger(args.height)||args.width<1||args.height<1||
     args.width>16384||args.height>16384||args.width*args.height>24_000_000))
    throw new Error('VOICE_SIZE_INVALID');
  if(draft.kind==='HISTORY_UNDO'&&!context.canUndo)
    throw new Error('VOICE_UNDO_UNAVAILABLE');
  if(draft.kind==='HISTORY_REDO'&&!context.canRedo)
    throw new Error('VOICE_REDO_UNAVAILABLE');
  if(draft.kind==='WARDROBE_QUERY' &&
     (typeof args.query!=='string'||!args.query.trim()||
     args.query.length>1024))
    throw new Error('VOICE_QUERY_INVALID');
  return Object.freeze({kind:draft.kind,params:Object.freeze({...args})});
}
