import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Check, X, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import {
  buildVoiceIntentDraft,applyConfirmedVoiceDraft,
} from '@/application/voice/VoiceIntentDraftV1';
import { createLocalVoiceSession, installLocalRussianVoicePack } from '@/application/voice/createLocalVoiceSession';
import { getVoiceConfirmationKey } from '@/application/voice/voiceConfirmationLabel';

const MAX_TRANSCRIPT=1024;
const INTENT_LABELS=Object.freeze({
  PROMPT_REPLACE:'voice.intent.promptReplace',
  PROMPT_APPEND:'voice.intent.promptAppend',
  PROMPT_CLEAR:'voice.intent.promptClear',
  NAVIGATE_PROMPT:'voice.intent.navigatePrompt',
  ACTION_NEEDS_UI:'voice.intent.actionNeedsUi',
  NAVIGATE:'voice.intent.navigate',
  HISTORY_UNDO:'voice.intent.historyUndo',
  HISTORY_REDO:'voice.intent.historyRedo',
  HISTORY_RESTORE:'voice.intent.historyRestore',
  TRANSFORM:'voice.intent.transform',
  RESIZE:'voice.intent.resize',
  WARDROBE_QUERY:'voice.intent.wardrobeQuery',
  TRYON_SELECT_PROPOSAL:'voice.intent.tryOnSelectProposal',
  REQUIRES_CANONICAL_CONTEXT:'voice.intent.requiresCanonicalContext',
  AGENT_PROPOSAL:'voice.intent.agentProposal',
  AMBIGUOUS:'voice.intent.ambiguous',
});
const MODE_LABELS=Object.freeze({
  ROTATE_90_CW:'voice.modes.rotateRight',
  ROTATE_270_CW:'voice.modes.rotateLeft',
  ROTATE_180:'voice.modes.rotate180',
  FLIP_HORIZONTAL:'voice.modes.flipHorizontal',
  FLIP_VERTICAL:'voice.modes.flipVertical',
});
const ERROR_KEYS=Object.freeze({
  LOCAL_ASR_PACK_MISSING:'voice.errors.localModelMissing',
  LOCAL_ASR_UNAVAILABLE:'voice.errors.localSpeechUnavailable',
  LOCAL_ASR_UNSUPPORTED:'voice.errors.localSpeechUnsupported',
  LOCAL_ASR_CHECK_FAILED:'voice.errors.localSpeechCheckFailed',
  LOCAL_ASR_UNVERIFIED:'voice.errors.localSpeechUnverified',
  LOCAL_ASR_START_FAILED:'voice.errors.localSpeechStartFailed',
  LOCAL_ASR_ROUTING_FAILED:'voice.errors.localSpeechRoutingFailed',
  LOCAL_ASR_FAILED:'voice.errors.localRecognitionFailed',
  LOCAL_ASR_TIMEOUT:'voice.errors.localRecognitionTimeout',
  LOCAL_ASR_STOP_FAILED:'voice.errors.localRecognitionStopFailed',
  VOICE_INVALID_POLICY:'voice.errors.localSpeechPolicyInvalid',
  LOCAL_ASR_INSTALL_UNSUPPORTED:'voice.errors.installUnsupported',
  LOCAL_ASR_INSTALL_UNAVAILABLE:'voice.errors.installUnavailable',
  LOCAL_ASR_INSTALL_FAILED:'voice.errors.installFailed',
  LOCAL_ASR_INSTALL_UNVERIFIED:'voice.errors.installUnverified',
  VOICE_ACTION_UNAVAILABLE:'voice.errors.actionUnavailable',
});
const BROWSER_ERROR_KEYS=Object.freeze({
  'no-speech':'voice.errors.browserNoSpeech',
  'audio-capture':'voice.errors.browserMicrophoneUnavailable',
  'not-allowed':'voice.errors.browserPermissionDenied',
  'service-not-allowed':'voice.errors.browserPermissionDenied',
  network:'voice.errors.browserNetworkFailure',
  aborted:'voice.errors.browserAborted',
});
function voiceErrorKey(reason){
  const code=typeof reason==='string'?reason:reason?.code;
  if(typeof code!=='string')return 'voice.errors.generic';
  if(Object.hasOwn(ERROR_KEYS,code))return ERROR_KEYS[code];
  if(Object.hasOwn(BROWSER_ERROR_KEYS,code))return BROWSER_ERROR_KEYS[code];
  return 'voice.errors.generic';
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
  const {t}=useTranslation();
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
      setNotice(t('voice.installSuccess'));
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
    if(disabled||submittingRef.current||submitting||!draft||!transcriptSource||
      transcriptSource!==sourceKey||
      ['ACTION_NEEDS_UI','AMBIGUOUS','REQUIRES_CANONICAL_CONTEXT'].includes(draft.kind))return;
    submittingRef.current=true;
    setSubmitting(true);
    try{
      if(['PROMPT_REPLACE','PROMPT_APPEND','PROMPT_CLEAR','NAVIGATE_PROMPT'].includes(draft.kind)){
        const result=applyConfirmedVoiceDraft(draft,prompt);
        if(result.navigate)onFocusPrompt?.();
        else onPromptChange?.(result.prompt);
      }else{
        if(typeof onVoiceIntent!=='function'){
          const unavailable=new Error('VOICE_ACTION_UNAVAILABLE');
          unavailable.code='VOICE_ACTION_UNAVAILABLE';
          throw unavailable;
        }
        await onVoiceIntent(draft,{projectId,sourceArtifactId});
      }
      setError('');setPhase('IDLE');setTranscript('');setPartial('');
      setOpen(false);
    }catch(reason){setError(t(voiceErrorKey(reason)));}
    finally{submittingRef.current=false;setSubmitting(false);}
  };
  const modeLabel=MODE_LABELS[draft?.params?.mode]
    ?t(MODE_LABELS[draft.params.mode])
    :t('voice.intent.transformPreview');
  return (
    <div role="group" className="space-y-2" aria-label={t('voice.regionLabel')}>
      <Button type="button" variant="outline" size="sm"
        disabled={disabled} onClick={()=>{if(open){cancel();setOpen(false);}else setOpen(true);}}
        aria-expanded={open} aria-label={t('voice.toggle')}>
        <Mic className="mr-1 h-4 w-4"/>{t('voice.toggle')}
      </Button>
      {open&&(
        <div className="rounded-lg border border-border p-3 space-y-2">
          <p className="text-xs text-muted-foreground">{t('voice.privacyHint')}</p>
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
            <MicOff className="mr-1 inline h-4 w-4"/>{t('voice.recording')}
          </p>}
          {partial&&<p role="status" className="text-xs text-muted-foreground" aria-label={t('voice.partialTranscript')} aria-live="polite" aria-atomic="true">{partial}</p>}
          <label className="block text-xs" htmlFor="bers-voice-transcript">
            {t('voice.transcriptLabel')}
          </label>
          <textarea id="bers-voice-transcript" value={transcript} maxLength={MAX_TRANSCRIPT}
            onChange={event=>{setTranscript(event.target.value);setTranscriptSource(sourceKey);}} rows={2}
            className="w-full rounded-md border bg-background p-2 text-sm"
            placeholder={t('voice.transcriptPlaceholder')} />
          {draft&&<p className="text-xs" role="status" aria-live="polite">
            {t(INTENT_LABELS[draft.kind]||'voice.intent.confirmationRequired')}
            {draft.kind==='AMBIGUOUS'?' — '+t('voice.intent.ambiguousHint'):''}
            {draft.kind==='RESIZE'&&draft.params
              ?' — '+draft.params.width+' × '+draft.params.height:''}
            {draft.kind==='TRANSFORM'&&draft.params
              ?' — '+modeLabel:''}
            {draft.kind==='WARDROBE_QUERY'&&draft.params?.hints
              ?' — '+t('voice.searchPrefix')+': '+draft.params.query:''}
          </p>}
          {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}
          {error&&<p role="alert" className="text-xs text-destructive" aria-live="assertive">{error}</p>}
          {missingPack&&(
            <Button type="button" variant="outline" size="sm"
              disabled={disabled||installing} onClick={installPack}>
              {installing?t('voice.installing'):t('voice.installModel')}
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
