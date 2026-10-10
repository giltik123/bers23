import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, ScanSearch, RefreshCcw, AlertCircle } from 'lucide-react';
import { SCENE_GROUPS, SCENE_LABELS, sceneSourceKey } from '@/application/scene/autoSceneMaskContract';
import { createCanonicalAutoSceneMaskRunner } from '@/application/scene/createCanonicalAutoSceneMaskRunner';
import { Button } from '@/components/ui/button';

const MESSAGE = Object.freeze({
  MODEL_UNAVAILABLE: 'Модель автоматического разделения сцены пока не подключена. Маски не создавались.',
  NO_OBJECTS: 'Модель не обнаружила подходящих объектов: пустые маски не создаются.',
  STALE_SOURCE: 'Изображение или проект изменились. Перезапустите анализ актуальной фотографии.',
  INVALID_SOURCE: 'Исходное изображение или версия проекта недоступны.',
  FAILED: 'Не удалось выполнить автосегментацию. Данные проекта сохранены.',
});

/**
 * Runs once per immutable Core image identity, including after a newly
 * accepted FINAL. This is a capability-gated control surface, not a fake
 * segmentation preview. Providers must be admitted independently.
 */
export default function AutoSceneMasksPanel({
  project, provider = null, disabled = false, onComplete, onManualSelect,
}) {
  const sourceKey = sceneSourceKey(project);
  const runner = useMemo(
    () => createCanonicalAutoSceneMaskRunner(provider), [provider],
  );
  const [state,setState] = useState({
    sourceKey:null,status:'IDLE',message:'',
  });
  const [requested,setRequested] = useState({sourceKey:null,mode:'CLASSICAL',request:0});
  const currentMode=requested.sourceKey===sourceKey?requested.mode:'CLASSICAL';
  const currentRequest=requested.sourceKey===sourceKey?requested.request:0;
  const attemptedRef = useRef(null);

  useEffect(() => {
    if (!sourceKey || !project) return undefined;
    if (disabled) {
      setState({ sourceKey,status:'PAUSED',
        message:'Анализ сцены начнётся, когда завершится текущее редактирование.' });
      return undefined;
    }
    const attemptKey=JSON.stringify([sourceKey,currentMode,currentRequest]);
    // React re-render / status update must never redispatch a paid model.
    if (attemptedRef.current===attemptKey)return undefined;
    attemptedRef.current=attemptKey;
    let cancelled=false,finished=false;
    setState({ sourceKey, status:'RUNNING',message:currentMode==='CLASSICAL'
      ? 'Выделение цветовых областей без ИИ…'
      : 'Сегментация SAM3 через облачную модель…' });
    runner.start(project,{mode:currentMode,force:currentRequest>0 && state.sourceKey===sourceKey}).then(result => {
      finished=true;
      if(cancelled)return;
      setState({ sourceKey,status:result.status,message:result.message });
      if(result.status==='COMPLETED')onComplete?.();
    }).catch(error => {
      finished=true;
      if(!cancelled)setState({ sourceKey,status:'FAILED',
        message:error?.message||MESSAGE.FAILED });
    });
    return () => {
      cancelled=true;
      runner.cancel();
      if(!finished && attemptedRef.current===attemptKey)attemptedRef.current=null;
    };
  // Re-run on image identity, explicit retry or when the editor becomes idle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[sourceKey,currentMode,currentRequest,runner,disabled]);

  const matching = state.sourceKey === sourceKey ? state : {
    status:'RUNNING',message:'Ожидание проверки новой фотографии',
  };
  const running = matching.status==='RUNNING';
  const detected = (Array.isArray(project?.objects)?project.objects:[])
    .filter(object=>object?.metadata?.segmentation==='AUTO' &&
      object.metadata.sourceArtifactId===project.current_image_artifact_id &&
      typeof object.mask_artifact_id==='string' &&
      object.mask_artifact_id.length>0);

  return (
    <section aria-label="Автоматическая сегментация сцены"
      className="rounded-xl border border-border bg-card p-3 space-y-3">
      <div className="flex items-center gap-2">
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> :
          <ScanSearch className="h-4 w-4" />}
        <h2 className="font-medium text-sm">Маски сцены</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {detected.length} сохранено в Core
        </span>
      </div>
      <p className="text-xs text-muted-foreground" role="status">
        {matching.message || MESSAGE[matching.status] ||
         'Готовые маски привязаны к текущей фотографии.'}
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {SCENE_GROUPS.map(group=>{
          const count=detected.filter(obj=>obj.group===group).length;
          return (
            <div key={group} className="flex justify-between rounded-md border px-2 py-1 text-xs">
              <span>{SCENE_LABELS[group]}</span>
              <span className="tabular-nums text-muted-foreground">{count || '—'}</span>
            </div>
          );
        })}
      </div>
      {matching.status==='MODEL_UNAVAILABLE'&&(
        <p role="note" className="flex gap-1.5 text-xs text-amber-600">
          <AlertCircle className="h-4 w-4 shrink-0"/>
          Классическая сегментация без ИИ распознаёт цветовые области, а не лица или одежду.
          Для подписанных семантических масок требуется отдельная модель.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm"
          disabled={disabled || running || !sourceKey}
          onClick={()=>setRequested(prev=>({
            sourceKey,mode:'CLASSICAL',request:prev.request+1,
          }))}>
          <RefreshCcw className="h-4 w-4 mr-1"/>Маски без ИИ
        </Button>
        <Button type="button" variant="outline" size="sm"
          disabled={disabled || running || !sourceKey}
          title="Облачный платный анализ только по вашему запросу"
          onClick={()=>setRequested(prev=>({
            sourceKey,mode:'SAM3',request:prev.request+1,
          }))}>
          SAM3 (облако)
        </Button>
        <Button type="button" variant="outline" size="sm"
          disabled={disabled||!sourceKey||typeof onManualSelect!=='function'}
          onClick={onManualSelect}>
          Уточнить маску вручную
        </Button>
      </div>
    </section>
  );
}
