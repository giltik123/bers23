import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Check, X, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  buildVoiceIntentDraft,applyConfirmedVoiceDraft,
} from '@/application/voice/VoiceIntentDraftV1';
import { createLocalVoiceSession, installLocalRussianVoicePack } from '@/application/voice/createLocalVoiceSession';

const MAX_TRANSCRIPT=1024;
const INTENT_LABELS={
  PROMPT_REPLACE:'Вставить текст в промпт (без запуска ИИ)',
  PROMPT_APPEND:'Добавить текст к промпту (без запуска ИИ)',
  PROMPT_CLEAR:'Очистить промпт (после подтверждения)',
  NAVIGATE_PROMPT:'Открыть поле промпта',
  ACTION_NEEDS_UI:'Команда требует ручного действия в редакторе',
  NAVIGATE:'Перейти к разделу редактора',
  HISTORY_UNDO:'Отменить последнее редактирование',
  HISTORY_REDO:'Повторить отменённое редактирование',
  HISTORY_RESTORE:'Вернуть оригинал фотографии',
  TRANSFORM:'Создать предпросмотр поворота/отражения',
  RESIZE:'Создать предпросмотр изменения размера',
  WARDROBE_QUERY:'Открыть Fashion с поисковыми подсказками',
  TRYON_SELECT_PROPOSAL:'Нужно выбрать реальную вещь в примерке',
  REQUIRES_CANONICAL_CONTEXT:'Нужно подтвердить действие в штатной панели BERS',
  AMBIGUOUS:'Неоднозначная команда: уточните фразу',
};
/**
 * Voice Input Layer VI-1: never calls Core, generation or provider APIs.
 * Never silently launches a spoken operation. The confirmation edits text
 * only. Nonlocal WebSpeech default is deliberately not used.
 */
export default function VoiceInputPanel({
  prompt='',onPromptChange,onFocusPrompt,onVoiceIntent,
  projectId,sourceArtifactId,disabled=false,
}){
  const [open,setOpen]=useState(false);
  const [phase,setPhase]=useState('IDLE');
  const [transcript,setTranscript]=useState('');
  const [partial,setPartial]=useState('');
  const [transcriptSource,setTranscriptSource]=useState(null);
  const [submitting,setSubmitting]=useState(false);
  const sourceKey=JSON.stringify([projectId,sourceArtifactId]);
  const [error,setError]=useState('');
  const [missingPack,setMissingPack]=useState(false);
  const [installing,setInstalling]=useState(false);
  const sessionRef=useRef(null);
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
    setPhase('IDLE');setTranscript('');setPartial('');setError('');setTranscriptSource(null);setMissingPack(false);
  };
  useEffect(()=>{
    if(disabled && sessionRef.current){
      generationRef.current++;
      sessionRef.current.abort();sessionRef.current=null;
      setPhase('IDLE');setPartial('');
      setError('Редактор занят: запись остановлена без выполнения команды.');
    }
  },[disabled]);
  const start=async()=>{
    if(disabled||phase==='RECORDING'||phase==='PREPARING')return;
    const generation=++generationRef.current;
    sessionRef.current?.abort();sessionRef.current=null;
    setError('');setMissingPack(false);setTranscript('');setPartial('');setTranscriptSource(sourceKey);setPhase('PREPARING');
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
          setPhase('ERROR');setError('Ошибка локального распознавания: '+String(reason).slice(0,100));
        },
      });
      if(generation!==generationRef.current){
        session.abort();return;
      }
      sessionRef.current=session;
      setPhase(current=>current==='PREPARING'?'RECORDING':current);
    }catch(reason){
      if(generation!==generationRef.current)return;
      setError(reason?.message||'Локальный голосовой ввод недоступен.');
      setMissingPack(reason?.code==='LOCAL_ASR_PACK_MISSING');
      setPhase('ERROR');
    }
  };
  const installPack=async()=>{
    if(disabled||installing||!missingPack)return;
    setInstalling(true);setError('');
    try{
      await installLocalRussianVoicePack();
      setMissingPack(false);setPhase('IDLE');
      setError('Русская модель установлена. Нажмите «Записать» для начала.');
    }catch(reason){setError(reason?.message||'Не удалось установить локальную модель.');}
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
    if(disabled||submitting||!draft||!transcriptSource ||
      transcriptSource!==sourceKey ||
      ['ACTION_NEEDS_UI','AMBIGUOUS','REQUIRES_CANONICAL_CONTEXT'].includes(draft.kind))return;
    setSubmitting(true);
    try{
      if(['PROMPT_REPLACE','PROMPT_APPEND','PROMPT_CLEAR','NAVIGATE_PROMPT'].includes(draft.kind)){
        const result=applyConfirmedVoiceDraft(draft,prompt);
        if(result.navigate)onFocusPrompt?.();
        else onPromptChange?.(result.prompt);
      }else{
        if(typeof onVoiceIntent!=='function')throw new Error('Голосовое управление здесь не подключено');
        await onVoiceIntent(draft,{projectId,sourceArtifactId});
      }
      setError('');setPhase('IDLE');setTranscript('');setPartial('');
      setOpen(false);
    }catch(reason){setError(reason?.message||'Не удалось подтвердить голосовой ввод');}
    finally{setSubmitting(false);}
  };
  return (
    <div className="space-y-2" aria-label="Голосовой ввод BERS">
      <Button type="button" variant="outline" size="sm"
        disabled={disabled} onClick={()=>{if(open){cancel();setOpen(false);}else setOpen(true);}}
        aria-expanded={open}>
        <Mic className="mr-1 h-4 w-4"/>Голос · локально
      </Button>
      {open&&(
        <div className="rounded-lg border border-border p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Русский язык · только на устройстве · без облачного API.
            Распознанный текст не запускает генерацию.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={disabled||phase==='RECORDING'||phase==='PREPARING'||phase==='STOPPING'}
              onClick={start}>
              <Mic className="mr-1 h-4 w-4"/>Записать
            </Button>
            {(phase==='RECORDING'||phase==='STOPPING')&&(
              <Button type="button" variant="outline" size="sm"
                disabled={phase==='STOPPING'} onClick={stop}>
                <Square className="mr-1 h-4 w-4"/>Остановить
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={cancel}>
              <X className="mr-1 h-4 w-4"/>Отмена
            </Button>
          </div>
          {phase==='PREPARING'&&<p role="status" className="text-xs">Проверка локальной модели речи…</p>}
          {phase==='RECORDING'&&<p role="status" className="text-xs">
            <MicOff className="mr-1 inline h-4 w-4"/>Запись с микрофона (не более 30 секунд)
          </p>}
          {partial&&<p className="text-xs text-muted-foreground" aria-label="Промежуточная расшифровка">{partial}</p>}
          <label className="block text-xs" htmlFor="bers-voice-transcript">
            Распознанная фраза — можно исправить перед подтверждением
          </label>
          <textarea id="bers-voice-transcript" value={transcript} maxLength={MAX_TRANSCRIPT}
            onChange={event=>{setTranscript(event.target.value);setTranscriptSource(sourceKey);}} rows={2}
            className="w-full rounded-md border bg-background p-2 text-sm"
            placeholder="Распознанный текст появится здесь" />
          {draft&&<p className="text-xs" role="status">
            {INTENT_LABELS[draft.kind]||'Нужно подтверждение'}
            {draft.kind==='AMBIGUOUS'&&draft.ambiguities?.[0]
              ?' — '+draft.ambiguities[0]:''}
            {draft.kind==='RESIZE'&&draft.params
              ?` — ${draft.params.width} × ${draft.params.height}`:''}
            {draft.kind==='TRANSFORM'&&draft.params
              ?' — '+draft.params.mode:''}
            {draft.kind==='WARDROBE_QUERY'&&draft.params?.hints
              ?` — поиск: ${draft.params.query}`:''}
          </p>
          {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
          {missingPack&&(
            <Button type="button" variant="outline" size="sm"
              disabled={disabled||installing} onClick={installPack}>
              {installing?'Установка…':'Скачать модель русского языка на устройство'}
            </Button>
          )}
          {draft&&!['ACTION_NEEDS_UI','AMBIGUOUS','REQUIRES_CANONICAL_CONTEXT'].includes(draft.kind)&&(
            <Button type="button" size="sm" disabled={disabled||submitting||phase==='RECORDING'||phase==='PREPARING'||phase==='STOPPING'||transcriptSource!==sourceKey}
              onClick={confirm}>
              <Check className="mr-1 h-4 w-4"/>Подтвердить текст
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
