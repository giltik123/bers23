/**
 * BERS VoiceIntentDraftV1 — text/intent only, never execution authority.
 * Natural-language voice must not bypass Core, Billing or explicit Accept.
 * All drafts require a visible user confirmation before altering an input.
 */
const MAX_TRANSCRIPT=1024;
function safeTranscript(value){
  if(typeof value!=='string')throw new Error('VOICE_INVALID_TRANSCRIPT');
  const cleaned=value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
  if(!cleaned || cleaned.length>MAX_TRANSCRIPT)
    throw new Error('VOICE_INVALID_TRANSCRIPT');
  return cleaned;
}
export function buildVoiceIntentDraft(transcript,{locale='ru-RU',engine='OS_ON_DEVICE'}={}){
  if(locale!=='ru-RU'||engine!=='OS_ON_DEVICE')
    throw new Error('VOICE_UNADMITTED_RECOGNIZER');
  const finalTranscript=safeTranscript(transcript);
  const lower=finalTranscript.toLocaleLowerCase('ru-RU');
  let kind='PROMPT_REPLACE',text=finalTranscript;
  if(/^(?:открой|покажи)\s+(?:поле\s+)?промпт[.!]?$/u.test(lower)){
    kind='NAVIGATE_PROMPT';text='';
  }else if(/^(?:очисти|удали|сотри)\s+(?:поле\s+)?промпт[.!]?$/u.test(lower)){
    kind='PROMPT_CLEAR';text='';
  }else{
    const replace=finalTranscript.match(/^(?:запиши\s+в\s+промпт|замени\s+промпт\s+на)\s*[:：]?\s*(.+)$/iu);
    const append=finalTranscript.match(/^(?:добавь\s+в\s+промпт|добавь)\s*[:：]?\s*(.+)$/iu);
    if(replace){kind='PROMPT_REPLACE';text=replace[1].trim();}
    else if(append){kind='PROMPT_APPEND';text=append[1].trim();}
    else if(/^(?:прими|подтверди|примен[ий]|оплати|запусти|создай|удали\s+проект|отмени|повтори|поверни|обрежь|примерь|отрази|сохрани)(?=\s|$|[.!?,])/iu.test(lower)){
      // Mutating/navigation/expensive speech is a proposed unsupported
      // action at VI-1: do NOT reinterpret as an executable instruction.
      kind='ACTION_NEEDS_UI';text=finalTranscript;
    }
  }
  return Object.freeze({
    schemaVersion:1,kind,locale,engine,privacy:'LOCAL_ONLY',
    finalTranscript,editable:true,requiresConfirmation:true,
    targetSurface:'PROMPT',
    proposedText:text,
  });
}
export function applyConfirmedVoiceDraft(draft,existingPrompt=''){
  if(!draft||draft.schemaVersion!==1 || draft.requiresConfirmation!==true ||
     draft.privacy!=='LOCAL_ONLY'||draft.engine!=='OS_ON_DEVICE')
    throw new Error('VOICE_DRAFT_NOT_ADMITTED');
  if(typeof existingPrompt!=='string')
    throw new Error('VOICE_PROMPT_INVALID');
  if(draft.kind==='NAVIGATE_PROMPT')return Object.freeze({navigate:true,prompt:existingPrompt});
  if(draft.kind==='ACTION_NEEDS_UI')
    throw new Error('VOICE_REQUIRES_EXISTING_EDITOR_CONTROLS');
  const text=draft.proposedText;
  if(typeof text!=='string'||text.length>MAX_TRANSCRIPT)
    throw new Error('VOICE_DRAFT_INVALID');
  if(draft.kind==='PROMPT_CLEAR')return Object.freeze({navigate:false,prompt:''});
  if(draft.kind==='PROMPT_REPLACE' && text.trim())
    return Object.freeze({navigate:false,prompt:text.trim()});
  if(draft.kind==='PROMPT_APPEND' && text.trim())
    return Object.freeze({navigate:false,prompt:[existingPrompt.trim(),text.trim()].filter(Boolean).join(' ')});
  throw new Error('VOICE_INTENT_UNSUPPORTED');
}
