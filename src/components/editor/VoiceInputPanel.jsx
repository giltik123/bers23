import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { Mic, MicOff, Check, X, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  buildVoiceIntentDraft,applyConfirmedVoiceDraft,
} from '@/application/voice/VoiceIntentDraftV1';
import { createLocalVoiceSession, installLocalRussianVoicePack } from '@/application/voice/createLocalVoiceSession';
import { getVoiceConfirmationKey } from '@/application/voice/voiceConfirmationLabel';

const MAX_TRANSCRIPT=1024;
const INTENT_LABEL_KEYS = Object.freeze({
  PROMPT_REPLACE: 'voiceUi.intentPromptReplace',
  PROMPT_APPEND: 'voiceUi.intentPromptAppend',
  PROMPT_CLEAR: 'voiceUi.intentPromptClear',
  NAVIGATE_PROMPT: 'voiceUi.intentNavigatePrompt',
  ACTION_NEEDS_UI: 'voiceUi.intentActionNeedsUi',
  NAVIGATE: 'voiceUi.intentNavigate',
  HISTORY_UNDO: 'voiceUi.intentHistoryUndo',
  HISTORY_REDO: 'voiceUi.intentHistoryRedo',
  HISTORY_RESTORE: 'voiceUi.intentHistoryRestore',
  TRANSFORM: 'voiceUi.intentTransform',
  RESIZE: 'voiceUi.intentResize',
  WARDROBE_QUERY: 'voiceUi.intentWardrobe',
  TRYON_SELECT_PROPOSAL: 'voiceUi.intentTryOn',
  REQUIRES_CANONICAL_CONTEXT: 'voiceUi.intentCanonical',
  AGENT_PROPOSAL: 'voiceUi.intentAgent',
  AMBIGUOUS: 'voiceUi.intentAmbiguous',
});
const VOICE_ERROR_KEYS = Object.freeze({
  LOCAL_ASR_PACK_MISSING: 'voiceUi.errorPackMissing',
  LOCAL_ASR_INSTALL_UNSUPPORTED: 'voiceUi.errorInstallUnsupported',
  LOCAL_ASR_INSTALL_UNAVAILABLE: 'voiceUi.errorInstallFailed',
  LOCAL_ASR_INSTALL_FAILED: 'voiceUi.errorInstallFailed',
  LOCAL_ASR_INSTALL_UNVERIFIED: 'voiceUi.errorInstallFailed',
  LOCAL_ASR_TIMEOUT: 'voiceUi.errorTimeout',
  LOCAL_ASR_UNSUPPORTED: 'voiceUi.errorRecognition',
  LOCAL_ASR_CHECK_FAILED: 'voiceUi.errorRecognition',
  LOCAL_ASR_ROUTING_FAILED: 'voiceUi.errorRecognition',
  LOCAL_ASR_UNAVAILABLE: 'voiceUi.errorRecognition',
  LOCAL_ASR_UNVERIFIED: 'voiceUi.errorRecognition',
  LOCAL_ASR_START_FAILED: 'voiceUi.errorRecognition',
  LOCAL_ASR_STOP_FAILED: 'voiceUi.errorRecognition',
  VOICE_INVALID_POLICY: 'voiceUi.errorRecognition',
  LOCAL_ASR_FAILED: 'voiceUi.errorRecognition',
  network: 'voiceUi.errorRecognition',
  'not-allowed': 'voiceUi.errorPermission',
  'service-not-allowed': 'voiceUi.errorPermission',
  'audio-capture': 'voiceUi.errorMicrophone',
  'no-speech': 'voiceUi.errorNoSpeech',
  aborted: 'voiceUi.errorStopped',
});
function voiceErrorKey(reason) {
  const code = typeof reason === 'string' ? reason : reason?.code;
  return VOICE_ERROR_KEYS[code] || 'voiceUi.errorGeneric';
}
/**
 * Voice Input Layer VI-1: never calls Core, generation or provider APIs.
 * Never silently launches a spoken operation. The confirmation edits text
 * only. Nonlocal WebSpeech default is deliberately not used.
 */
export default function VoiceInputPanel({
  prompt='',onPromptChange,onFocusPrompt,onVoiceIntent,
  projectId,sourceArtifactId,disabled=false,
}){
  const { t } = useTranslation();
  const [open,setOpen]=useState(false);
  const [phase,setPhase]=useState('IDLE');
  const [transcript,setTranscript]=useState('');
  const [partial,setPartial]=useState('');
  const [transcriptSource,setTranscriptSource]=useState(null);
  const [submitting,setSubmitting]=useState(false);
  const sourceKey=JSON.stringify([projectId,sourceArtifactId]);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [missingPack,setMissingPack]=useState(false);
  const [installing,setInstalling]=useState(false);
  const sessionRef=useRef(null);
  const submittingRef=useRef(false);
  const generationRef=useRef(0);
  useEffect(()=>()=>{generationRef.current++;sessionRef.current?.abort();sessionRef.current=null;},[]);
  useEffect(()=>{
    generationRef.current++;
    sessionRef.current?.abort();sessionRef.current=null;
    setTranscript('');setPartial('');setTranscriptSource(null);
    setPhase('IDLE');
  },[sourceKey]);
  const cancel=()=>{
    generationRef.current++;
    sessionRef.current?.abort();sessionRef.current=null;
    setPhase('IDLE');setTranscript('');setPartial('');setError('');setNotice('');setTranscriptSource(null);setMissingPack(false);
  };
  useEffect(()=>{
    if(disabled && sessionRef.current){
      generationRef.current++;
      sessionRef.current.abort();sessionRef.current=null;
      setPhase('IDLE');setPartial('');
      setError(t('voiceUi.errorEditorBusy'));
    }
  },[disabled]);
  const start=async()=>{
    if(disabled||phase==='RECORDING'||phase==='PREPARING')return;
    const generation=++generationRef.current;
    sessionRef.current?.abort();sessionRef.current=null;
    setError('');setNotice('');setMissingPack(false);setTranscript('');setPartial('');setTranscriptSource(sourceKey);setPhase('PREPARING');
    try{
      const session=await createLocalVoiceSession({
        onPartial:value=>{if(generation===generationRef.current)setPartial(value);},
        onFinal:value=>{
          if(generation!==generationRef.current)return;
          setTranscript(value);setPartial('');setPhase('REVIEW');setTranscriptSource(sourceKey);
        },
        onEnd:()=>{
          if(generation!==generationRef.current)return;
          sessionRef.current=null;
          setPhase(prev=>prev==='RECORDING'||prev==='STOPPING'?'REVIEW':prev);
        },
        onError:reason=>{
          if(generation!==generationRef.current)return;
          sessionRef.current=null;
          setPhase('ERROR');setError(t(voiceErrorKey(reason)));
        },
      });
      if(generation!==generationRef.current){
        session.abort();return;
      }
      sessionRef.current=session;
      setPhase(current=>current==='PREPARING'?'RECORDING':current);
    }catch(reason){
      if(generation!==generationRef.current)return;
      setError(t(voiceErrorKey(reason)));
      setMissingPack(reason?.code==='LOCAL_ASR_PACK_MISSING');
      setPhase('ERROR');
    }
  };
  const installPack=async()=>{
    if(disabled||installing||!missingPack)return;
    setInstalling(true);setError('');setNotice('');
    try{
      await installLocalRussianVoicePack();
      setMissingPack(false);setPhase('IDLE');
      setNotice(t('voiceUi.packInstalled'));
    }catch(reason){setError(t(voiceErrorKey(reason)));}
    finally{setInstalling(false);}
  };
  const stop=()=>{
    sessionRef.current?.stop();
    if(phase==='RECORDING')setPhase('STOPPING');
  };
  let draft=null;
  try{if(transcript.trim())draft=buildVoiceIntentDraft(transcript);}catch{
    draft=null;
  }
  const confirm=async()=>{
    if(disabled||submittingRef.current||submitting||!draft||!transcriptSource ||
      transcriptSource!==sourceKey ||
      ['ACTION_NEEDS_UI','AMBIGUOUS','REQUIRES_CANONICAL_CONTEXT'].includes(draft.kind))return;
    submittingRef.current=true;
    setSubmitting(true);
    try{
      if(['PROMPT_REPLACE','PROMPT_APPEND','PROMPT_CLEAR','NAVIGATE_PROMPT'].includes(draft.kind)){
        const result=applyConfirmedVoiceDraft(draft,prompt);
        if(result.navigate)onFocusPrompt?.();
        else onPromptChange?.(result.prompt);
      }else{
        if(typeof onVoiceIntent!=='function')throw new Error('VOICE_HANDOFF_UNAVAILABLE');
        await onVoiceIntent(draft,{projectId,sourceArtifactId});
      }
      setError('');setPhase('IDLE');setTranscript('');setPartial('');
      setOpen(false);
    }catch{setError(t('voiceUi.errorConfirm'));}
    finally{submittingRef.current=false;setSubmitting(false);}
  };
  return (
    <div className="space-y-2" aria-label={t('voiceUi.panel')}>
      <Button type="button" variant="outline" size="sm"
        disabled={disabled} onClick={()=>{if(open){cancel();setOpen(false);}else setOpen(true);}}
        aria-expanded={open} aria-label={t('voiceUi.toggle')}>
        <Mic className="mr-1 h-4 w-4"/>{t('voiceUi.toggle')}
      </Button>
      {open&&(
        <div className="rounded-lg border border-border p-3 space-y-2">
          <p className="text-xs text-muted-foreground">{t('voiceUi.privacy')}</p>
          <p className="text-xs text-muted-foreground">{t('voiceUi.noGeneration')}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={disabled||phase==='RECORDING'||phase==='PREPARING'||phase==='STOPPING'}
              onClick={start}>
              <Mic className="mr-1 h-4 w-4"/>{t('voiceUi.record')}
            </Button>
            {(phase==='RECORDING'||phase==='STOPPING')&&(
              <Button type="button" variant="outline" size="sm"
                disabled={phase==='STOPPING'} onClick={stop}>
                <Square className="mr-1 h-4 w-4"/>{t('voiceUi.stop')}
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={cancel}>
              <X className="mr-1 h-4 w-4"/>{t('voiceUi.cancel')}
            </Button>
          </div>
          {phase==='PREPARING'&&<p role="status" className="text-xs">{t('voiceUi.checking')}</p>}
          {phase==='RECORDING'&&<p role="status" className="text-xs">
            <MicOff className="mr-1 inline h-4 w-4"/>{t('voiceUi.recording')}
          </p>}
          {partial&&<p className="text-xs text-muted-foreground" role="status" aria-live="polite" aria-atomic="true" aria-label={t('voiceUi.partial')}>{partial}</p>}
          <label className="block text-xs" htmlFor="bers-voice-transcript">
            {t('voiceUi.transcriptLabel')}
          </label>
          <textarea id="bers-voice-transcript" value={transcript} maxLength={MAX_TRANSCRIPT}
            onChange={event=>{setTranscript(event.target.value);setTranscriptSource(sourceKey);}} rows={2}
            className="w-full rounded-md border bg-background p-2 text-sm"
            placeholder={t('voiceUi.transcriptPlaceholder')} />
          {draft&&<p className="text-xs" role="status">
            {t(INTENT_LABEL_KEYS[draft.kind] || 'voiceUi.intentConfirm')}
            {draft.kind==='AMBIGUOUS'?' — '+t('voiceUi.ambiguousHint'):''}
            {draft.kind==='RESIZE'&&draft.params
              ?` — ${draft.params.width} × ${draft.params.height}`:''}
            
            {draft.kind==='WARDROBE_QUERY'&&draft.params?.hints
              ?` — ${t('voiceUi.searchHint',{query:draft.params.query})}`:''}
          </p>}
          {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}
          {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
          {missingPack&&(
            <Button type="button" variant="outline" size="sm"
              disabled={disabled||installing} onClick={installPack}>
              {installing?t('voiceUi.installing'):t('voiceUi.installPack')}
            </Button>
          )}
          {draft&&!['ACTION_NEEDS_UI','AMBIGUOUS','REQUIRES_CANONICAL_CONTEXT'].includes(draft.kind)&&(
            <Button type="button" size="sm" disabled={disabled||submitting||phase==='RECORDING'||phase==='PREPARING'||phase==='STOPPING'||transcriptSource!==sourceKey}
              onClick={confirm}>
              <Check className="mr-1 h-4 w-4"/>{t(getVoiceConfirmationKey(draft.kind))}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
