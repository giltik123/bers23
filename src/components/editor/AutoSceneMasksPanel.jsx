import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, ScanSearch, RefreshCcw, AlertCircle } from 'lucide-react';
import { SCENE_GROUPS, SCENE_LABELS, sceneSourceKey, supportsClassicalSceneGeometry } from '@/application/scene/autoSceneMaskContract';
import { createCanonicalAutoSceneMaskRunner } from '@/application/scene/createCanonicalAutoSceneMaskRunner';
import { Button } from '@/components/ui/button';
import { coreClient } from '@/api/coreClient';

// Only Core can admit billed SAM3 and source-bound MASK provenance.
// This panel never sends a model request until the user confirms a click.
const CLOUD_TARGETS=Object.freeze([
  ['face','Лицо'],['shirt','Рубашка'],['jacket','Куртка'],
  ['pants','Брюки'],['dress','Платье'],['shoes','Обувь'],
  ['eyeglasses','Очки'],['handbag','Сумка'],['hat','Головной убор'],
  ['background','Фон'],['chair','Стул'],['table','Стол'],
]);

const MESSAGE = Object.freeze({
  MODEL_UNAVAILABLE: 'Модель автоматического разделения сцены пока не подключена. Маски не создавались.',
  NO_OBJECTS: 'Модель не обнаружила подходящих объектов: пустые маски не создаются.',
  STALE_SOURCE: 'Изображение или проект изменились. Перезапустите анализ актуальной фотографии.',
  INVALID_SOURCE: 'Исходное изображение или версия проекта недоступны.',
  FAILED: 'Не удалось выполнить автосегментацию. Данные проекта сохранены.',
});

/**
 * Runs ONLY on an explicit manual/classical or confirmed SAM3 request.
 * Opening the editor, mounting this panel, changing source image or restoring
 * a Project never launches free or paid segmentation.
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
  const [requested,setRequested] = useState({
    sourceKey:null,mode:'CLASSICAL',request:0,force:false,promptKey:null,
  });
  const [selectedCloudTarget,setSelectedCloudTarget] = useState('face');
  const [cloudCapability,setCloudCapability] = useState({available:false,credits:null});
  const CLOUD_SAM3_UI_ADMITTED=cloudCapability.available;
  const currentMode=requested.sourceKey===sourceKey?requested.mode:'CLASSICAL';
  const classicalGeometrySupported=supportsClassicalSceneGeometry(project);
  const currentRequest=requested.sourceKey===sourceKey?requested.request:0;
  const currentPromptKey=requested.sourceKey===sourceKey?requested.promptKey:null;
  const currentForce=requested.sourceKey===sourceKey&&requested.force===true;
  const attemptedRef = useRef(null);

  useEffect(() => {
    let active=true;
    coreClient.scene.capability().then(capability => {
      if(active)setCloudCapability({available:capability?.supportsSemanticInstances===true,
        credits:typeof capability?.sam3Credits==='number'?capability.sam3Credits:null});
    }).catch(() => {
      if(active)setCloudCapability({available:false,credits:null});
    });
    return () => { active=false; };
  }, [sourceKey]);

  useEffect(() => {
    if (!sourceKey || !project || currentRequest===0 || requested.sourceKey!==sourceKey) return undefined;
    if (disabled) {
      setState({ sourceKey,status:'PAUSED',
        message:'Анализ сцены начнётся, когда завершится текущее редактирование.' });
      return undefined;
    }
    if(currentMode==='CLASSICAL' && !classicalGeometrySupported){
      setState({sourceKey,status:'UNSUPPORTED_GEOMETRY',
        message:'Маски без ИИ требуют фотографию от 8×8 пикселей. Исходник и история сохранены.'});
      return undefined;
    }
    const attemptKey=JSON.stringify([sourceKey,currentMode,currentRequest,currentPromptKey]);
    // React re-render / status update must never redispatch a paid model.
    if (attemptedRef.current===attemptKey)return undefined;
    attemptedRef.current=attemptKey;
    let cancelled=false,finished=false;
    setState({ sourceKey, status:'RUNNING',message:currentMode==='CLASSICAL'
      ? 'Выделение цветовых областей без ИИ…'
      : 'Сегментация SAM3 через облачную модель…' });
    runner.start(project,{mode:currentMode,force:currentForce,promptKey:currentPromptKey}).then(result => {
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
  // Only continue an explicitly clicked request when editor becomes idle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[sourceKey,currentMode,currentRequest,currentPromptKey,currentForce,runner,disabled,classicalGeometrySupported]);

  const matching = state.sourceKey === sourceKey ? state : {
    status:'IDLE',message:'Нажмите нужную кнопку, чтобы создать маски. Автозапуск выключен.',
  };
  const running = matching.status==='RUNNING';
  const detected = (Array.isArray(project?.objects)?project.objects:[])
    .filter(object=>object?.metadata?.segmentation==='AUTO' &&
      object.metadata.sourceArtifactId===project.current_image_artifact_id &&
      typeof object.mask_artifact_id==='string' &&
      object.mask_artifact_id.length>0);

  return (
    <section id="bers-mask-tools" aria-label="Сегментация сцены по запросу"
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
          disabled={disabled || running || !sourceKey || !classicalGeometrySupported}
          onClick={()=>setRequested(prev=>({
            sourceKey,mode:'CLASSICAL',request:prev.request+1,force:true,promptKey:null,
          }))}>
          <RefreshCcw className="h-4 w-4 mr-1"/>Маски без ИИ
        </Button>
        <label className="text-xs text-muted-foreground flex items-center gap-1">
          Объект для SAM3
          <select aria-label="Объект облачной сегментации"
            value={selectedCloudTarget}
            onChange={event=>setSelectedCloudTarget(event.target.value)}
            className="rounded-md border bg-background p-1"
            disabled={disabled||running||!CLOUD_SAM3_UI_ADMITTED}>
            {CLOUD_TARGETS.map(([key,label])=>
              <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <Button type="button" variant="outline" size="sm"
          disabled={disabled || running || !sourceKey || !CLOUD_SAM3_UI_ADMITTED}
          title={CLOUD_SAM3_UI_ADMITTED ? 'Выполнить один подтверждённый облачный запрос SAM3' : 'Облачная SAM3 ещё не подключена на сервере'}
          onClick={()=>{
            if(!window.confirm('Отправить фото в SAM3 для одного выбранного объекта? Это один облачный API-вызов.'))return;
            setRequested(prev=>({
              sourceKey,mode:'SAM3',request:prev.request+1,
              force:prev.sourceKey===sourceKey&&prev.mode==='SAM3'&&
                prev.promptKey===selectedCloudTarget,
              promptKey:selectedCloudTarget,
            }));
          }}>
          {CLOUD_SAM3_UI_ADMITTED ? `SAM3 · по запросу${cloudCapability.credits != null ? ` (до ${cloudCapability.credits} кредитов)` : ''}` : 'SAM3 · недоступно'}
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
