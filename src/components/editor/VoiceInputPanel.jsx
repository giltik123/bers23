import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Check, X, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import {
  buildVoiceIntentDraft,applyConfirmedVoiceDraft,
} from '@/application/voice/VoiceIntentDraftV1';
import { createLocalVoiceSession, installLocalRussianVoicePack } from '@/application/voice/createLocalVoiceSession';

const MAX_TRANSCRIPT=1024;
const VOICE_INTENT_KEYS={
  PROMPT_REPLACE:'voice.intents.promptReplace',
  PROMPT_APPEND:'voice.intents.promptAppend',
  PROMPT_CLEAR:'voice.intents.promptClear',
  NAVIGATE_PROMPT:'voice.intents.navigatePrompt',
  ACTION_NEEDS_UI:'voice.intents.actionNeedsUi',
  NAVIGATE:'voice.intents.navigate',
  HISTORY_UNDO:'voice.intents.historyUndo',
  HISTORY_REDO:'voice.intents.historyRedo',
  HISTORY_RESTORE:'voice.intents.historyRestore',
  TRANSFORM:'voice.intents.transform',
  RESIZE:'voice.intents.resize',
  WARDROBE_QUERY:'voice.intents.wardrobeQuery',
  TRYON_SELECT_PROPOSAL:'voice.intents.tryOnSelectProposal',
  REQUIRES_CANONICAL_CONTEXT:'voice.intents.requiresCanonicalContext',
  AGENT_PROPOSAL:'voice.intents.agentProposal',
  AMBIGUOUS:'voice.intents.ambiguous',
};
const TRANSFORM_MODE_KEYS={
  ROTATE_90_CW:'rotate90Cw',
  ROTATE_270_CW:'rotate270Cw',
  ROTATE_180:'rotate180',
  FLIP_HORIZONTAL:'flipHorizontal',
  FLIP_VERTICAL:'flipVertical',
};
const VOICE_ERROR_KEYS={
  'not-allowed':'voice.errors.permissionDenied',
  'service-not-allowed':'voice.errors.permissionDenied',
  'no-speech':'voice.errors.noSpeech',
  'audio-capture':'voice.errors.audioCapture',
  'network':'voice.errors.network',
  'language-not-supported':'voice.errors.asrUnavailable',
  'LOCAL_ASR_UNSUPPORTED':'voice.errors.asrUnsupported',
  'LOCAL_ASR_CHECK_FAILED':'voice.errors.asrCheckFailed',
  'LOCAL_ASR_ROUTING_FAILED':'voice.errors.asrRoutingFailed',
  'LOCAL_ASR_PACK_MISSING':'voice.errors.asrPackMissing',
  'LOCAL_ASR_UNAVAILABLE':'voice.errors.asrUnavailable',
  'LOCAL_ASR_UNVERIFIED':'voice.errors.asrUnverified',
  'LOCAL_ASR_START_FAILED':'voice.errors.asrStartFailed',
  'LOCAL_ASR_STOP_FAILED':'voice.errors.asrStopFailed',
  'LOCAL_ASR_TIMEOUT':'voice.errors.asrTimeout',
  'LOCAL_ASR_FAILED':'voice.errors.recognition',
  'LOCAL_ASR_INSTALL_UNSUPPORTED':'voice.errors.installUnsupported',
  'LOCAL_ASR_INSTALL_UNAVAILABLE':'voice.errors.installUnavailable',
  'LOCAL_ASR_INSTALL_FAILED':'voice.errors.installFailed',
  'LOCAL_ASR_INSTALL_UNVERIFIED':'voice.errors.installUnverified',
};
function voiceErrorKey(reason,fallback='voice.errors.generic'){
  const code=typeof reason==='string'?reason:reason?.code;
  return typeof code==='string'?(VOICE_ERROR_KEYS[code]||fallback):fallback;
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
      setError(t('voice.errors.editorBusy'));
    }
  },[disabled,t]);
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
          setPhase('ERROR');setError(t(voiceErrorKey(reason,'voice.errors.recognition')));
        },
      });
      if(generation!==generationRef.current){
        session.abort();return;
      }
      sessionRef.current=session;
      setPhase(current=>current==='PREPARING'?'RECORDING':current);
    }catch(reason){
      if(generation!==generationRef.current)return;
      const code=reason?.code;
      setError(t(voiceErrorKey(reason)));
      setMissingPack(code==='LOCAL_ASR_PACK_MISSING');
      setPhase('ERROR');
    }
  };
  const installPack=async()=>{
    if(disabled||installing||!missingPack)return;
    setInstalling(true);setError('');setNotice('');
    try{
      await installLocalRussianVoicePack();
      setMissingPack(false);setPhase('IDLE');
      setNotice(t('voice.installSuccess'));
    }catch(reason){setError(t(voiceErrorKey(reason,'voice.errors.installFailed')));}
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
        if(typeof onVoiceIntent!=='function')throw new Error('VOICE_ACTION_NOT_SUPPORTED');
        await onVoiceIntent(draft,{projectId,sourceArtifactId});
      }
      setError('');setPhase('IDLE');setTranscript('');setPartial('');
      setOpen(false);
    }catch(reason){setError(t(voiceErrorKey(reason,'voice.errors.confirmFailed')));}
    finally{submittingRef.current=false;setSubmitting(false);}
  };
  const transformModeKey=TRANSFORM_MODE_KEYS[draft?.params?.mode]||'unknown';
  return (
    <div role="group" className="space-y-2" aria-label={t('voice.panel')}>
      <Button type="button" variant="outline" size="sm"
        disabled={disabled} onClick={()=>{if(open){cancel();setOpen(false);}else setOpen(true);}}
        aria-expanded={open}>
        <Mic className="mr-1 h-4 w-4"/>{t('voice.open')}
      </Button>
      {open&&(
        <div className="rounded-lg border border-border p-3 space-y-2">
          <p className="text-xs text-muted-foreground">{t('voice.localPrivacyHint')}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={disabled||phase==='RECORDING'||phase==='PREPARING'||phase==='STOPPING'}
              onClick={start}>
              <Mic className="mr-1 h-4 w-4"/>{t('voice.record')}
            </Button>
            {(phase==='RECORDING'||phase==='STOPPING')&&(
              <Button type="button" variant="outline" size="sm"
                disabled={phase==='STOPPING'} onClick={stop}>
                <Square className="mr-1 h-4 w-4"/>{t('voice.stop')}
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={cancel}>
              <X className="mr-1 h-4 w-4"/>{t('voice.cancel')}
            </Button>
          </div>
          {phase==='PREPARING'&&<p role="status" className="text-xs">{t('voice.preparing')}</p>}
          {phase==='RECORDING'&&<p role="status" className="text-xs">
            <MicOff className="mr-1 inline h-4 w-4"/>{t('voice.recording',{seconds:30})}
          </p>}
          {partial&&<p className="text-xs text-muted-foreground" aria-label={t('voice.partialTranscript')}>{partial}</p>}
          <label className="block text-xs" htmlFor="bers-voice-transcript">{t('voice.transcriptLabel')}</label>
          <textarea id="bers-voice-transcript" value={transcript} maxLength={MAX_TRANSCRIPT}
            onChange={event=>{setTranscript(event.target.value);setTranscriptSource(sourceKey);}} rows={2}
            className="w-full rounded-md border bg-background p-2 text-sm"
            placeholder={t('voice.transcriptPlaceholder')} />
          {draft&&<p className="text-xs" role="status">
            {t(VOICE_INTENT_KEYS[draft.kind]||'voice.intentConfirmation')}
            {draft.kind==='RESIZE'&&draft.params
              ?' · '+t('voice.details.resize',{width:draft.params.width,height:draft.params.height}):''}
            {draft.kind==='TRANSFORM'&&draft.params
              ?' · '+t('voice.details.transform',{mode:t('voice.transformModes.'+transformModeKey)}):''}
            {draft.kind==='WARDROBE_QUERY'&&draft.params?.hints
              ?' · '+t('voice.details.search',{query:draft.params.query}):''}
          </p>}
          {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}
          {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
          {missingPack&&(
            <Button type="button" variant="outline" size="sm"
              disabled={disabled||installing} onClick={installPack}>
              {installing?t('voice.installing'):t('voice.installPack')}
            </Button>
          )}
          {draft&&!['ACTION_NEEDS_UI','AMBIGUOUS','REQUIRES_CANONICAL_CONTEXT'].includes(draft.kind)&&(
            <Button type="button" size="sm" disabled={disabled||submitting||phase==='RECORDING'||phase==='PREPARING'||phase==='STOPPING'||transcriptSource!==sourceKey}
              onClick={confirm}>
              <Check className="mr-1 h-4 w-4"/>{t('voice.confirmText')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
