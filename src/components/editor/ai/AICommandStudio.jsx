import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, SlidersHorizontal, Scan, Shirt, WandSparkles, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  interpretPhotoCommand,
  sanitizePhotoAdjustmentDraft,
} from '@/application/editor/ai-first/interpretPhotoCommand';

const INITIAL_LEVELS = Object.freeze({
  inputBlack:0,inputMidpoint:128,inputWhite:255,outputBlack:3,outputWhite:255,
});
const LABELS = Object.freeze({
  MASKED_EXPOSURE:'Экспозиция · выбранная область',
  MASKED_WHITE_BALANCE:'Баланс белого · выбранная область',
  MASKED_LEVELS:'Тоновые уровни · выбранная область',
  BACKGROUND_ISOLATION:'Изолировать выбранный объект',
});
const EXAMPLES = Object.freeze([
  'Слегка осветли одежду, сохрани фактуру ткани',
  'Сделай выбранную область чуть теплее',
  'Повысь контраст выделенной области',
  'Замени небо на закат, не меняя человека',
  'Надень другое платье, сохрани лицо и позу',
]);
const field = 'w-full accent-primary disabled:opacity-40';

export default function AICommandStudio({
  project, selectedObject, instruction, onInstructionChange,
  disabled=false, selectionActive=false, pending=false,
  onSelectRegion, onExecuteAdjustment, onExecuteGenerative, onOpenFashion,
}) {
  const plan=useMemo(()=>interpretPhotoCommand(instruction),[instruction]);
  const [parameters,setParameters]=useState(null);
  const [maskConfirmed,setMaskConfirmed]=useState(false);
  const [generativeConfirmed,setGenerativeConfirmed]=useState(false);
  const [generativeScope,setGenerativeScope]=useState('MASKED');
  const [executionError,setExecutionError]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const maskId=selectedObject?.mask_artifact_id||null;
  const canEdit=!disabled&&!selectionActive&&!pending&&!submitting&&Boolean(project?.current_image_artifact_id);

  useEffect(()=>{
    setParameters(plan.parameters?{...plan.parameters}:null);
    setMaskConfirmed(false);
    setGenerativeConfirmed(false);
    setGenerativeScope('MASKED');
    setExecutionError('');
  },[plan.instruction,plan.operation,project?.current_image_artifact_id,maskId]);

  const update=(key,value)=>{
    setParameters(previous=>({...previous,[key]:value}));
    setExecutionError('');
  };
  const handleSubmit=async()=>{
    if(!canEdit||plan.kind!=='ADJUSTMENT'||!maskId||!maskConfirmed)return;
    setSubmitting(true);setExecutionError('');
    try{
      const safe=sanitizePhotoAdjustmentDraft({...plan,parameters});
      await onExecuteAdjustment(safe);
    }catch(error){
      setExecutionError(error?.message||'Не удалось применить выбранную коррекцию.');
    }finally{setSubmitting(false);}
  };
  const handleGenerate=async()=>{
    if(!canEdit||plan.kind!=='GENERATIVE'||!generativeConfirmed||
       (generativeScope==='MASKED'&&(!maskId||!maskConfirmed)))return;
    setSubmitting(true);setExecutionError('');
    try{await onExecuteGenerative({
      instruction:plan.instruction,
      mode:generativeScope,
      expectedSourceArtifactId:project.current_image_artifact_id,
      expectedMaskArtifactId:generativeScope==='MASKED'?maskId:null,
    });}
    catch(error){setExecutionError(error?.message||'Генерация недоступна для данного проекта.');}
    finally{setSubmitting(false);}
  };

  const controls=plan.kind==='ADJUSTMENT'&&parameters&&(
    <section className="space-y-4 border border-border/70 rounded-xl p-4"
      aria-label="Изменяемые параметры команды">
      <div className="flex items-center gap-2 text-sm font-medium">
        <SlidersHorizontal className="h-4 w-4" />
        {LABELS[plan.operation]||'Инструмент коррекции'}
      </div>
      {plan.operation==='MASKED_EXPOSURE'&&(
        <label className="block space-y-2 text-sm">
          <div className="flex justify-between"><span>Экспозиция</span>
            <span className="tabular-nums">{(parameters.eighthStops/8).toFixed(3)} EV</span></div>
          <input type="range" className={field} min="-32" max="32" step="1"
            value={parameters.eighthStops} disabled={!canEdit}
            onChange={e=>update('eighthStops',Number(e.target.value))}/>
        </label>
      )}
      {plan.operation==='MASKED_WHITE_BALANCE'&&(
        <>
          <label className="block space-y-2 text-sm">
            <div className="flex justify-between"><span>Температура</span>
              <span className="tabular-nums">{parameters.temperatureQ8}</span></div>
            <input type="range" className={field} min="-128" max="128" step="1"
              value={parameters.temperatureQ8} disabled={!canEdit}
              onChange={e=>update('temperatureQ8',Number(e.target.value))}/>
          </label>
          <label className="block space-y-2 text-sm">
            <div className="flex justify-between"><span>Оттенок</span>
              <span className="tabular-nums">{parameters.tintQ8}</span></div>
            <input type="range" className={field} min="-64" max="64" step="1"
              value={parameters.tintQ8} disabled={!canEdit}
              onChange={e=>update('tintQ8',Number(e.target.value))}/>
          </label>
        </>
      )}
      {plan.operation==='MASKED_LEVELS'&&(
        <>
          {[
            ['inputBlack','Точка чёрного',0,254],
            ['inputMidpoint','Средние тона',1,254],
            ['inputWhite','Точка белого',1,255],
            ['outputBlack','Выходная точка чёрного',0,254],
            ['outputWhite','Выходная точка белого',1,255],
          ].map(([key,label,min,max])=>(
            <label key={key} className="block space-y-2 text-sm">
              <div className="flex justify-between"><span>{label}</span>
                <span className="tabular-nums">{parameters[key]}</span></div>
              <input type="range" className={field} min={min} max={max} step="1"
                value={parameters[key]} disabled={!canEdit}
                onChange={e=>update(key,Number(e.target.value))}/>
            </label>
          ))}
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Значения — предложенный старт, не гарантированная правильная обработка.
        Последнее слово за вашим сравнением исходника и результата.
      </p>
    </section>
  );

  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-4"
      aria-label="AI-first редактор по текстовой команде">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          <h2 className="font-semibold">BERS · Командный редактор</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Скажите, что хотите изменить. Затем уточните область и силу эффекта.
          Это управляемый маршрут к Core, а не слепая автогенерация.
        </p>
      </header>

      <label className="block space-y-2">
        <span className="text-sm font-medium">Что изменить на фотографии?</span>
        <textarea aria-label="Команда редактирования" rows={3} maxLength={850}
          value={instruction} disabled={disabled||pending||submitting}
          placeholder="Например: слегка осветли куртку, сохрани фактуру и не меняй лицо"
          onChange={e=>onInstructionChange(e.target.value)}
          className="w-full min-h-24 rounded-xl border border-input bg-background px-3 py-2 text-sm resize-y"/>
      </label>
      <div className="flex flex-wrap gap-2" aria-label="Примеры команд">
        {EXAMPLES.map(value=><button key={value} type="button"
          disabled={disabled||pending||submitting}
          onClick={()=>onInstructionChange(value)}
          className="rounded-full border px-2.5 py-1.5 text-xs hover:bg-accent disabled:opacity-50">
          {value}
        </button>)}
      </div>

      {plan.kind==='CLARIFY'?(
        <p role="status" className="rounded-xl bg-secondary/40 p-3 text-sm">{plan.explanation}</p>
      ):(
        <div className="space-y-3">
          <p className="text-sm">{plan.explanation}</p>
          {plan.warnings.map((warning,i)=>(
            <p role="note" key={i} className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0"/>{warning}
            </p>
          ))}

          {plan.kind==='ADJUSTMENT'&&(
            <>
              {controls}
              <div className="rounded-xl border p-3 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Scan className="h-4 w-4"/>Область и маска
                </div>
                {maskId?(
                  <>
                    <p className="text-sm">
                      Core-маска выбрана: <strong>{selectedObject?.label||'Выделенная область'}</strong>.
                      Обработка не должна затронуть пиксели вне неё.
                    </p>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" checked={maskConfirmed}
                        disabled={!canEdit} onChange={e=>setMaskConfirmed(e.target.checked)}
                        className="mt-1"/>
                      Я проверил, что выбранная маска соответствует моему запросу.
                    </label>
                  </>
                ):(
                  <>
                    <p role="status" className="text-sm text-amber-700 dark:text-amber-400">
                      Нет подтверждённой Core-маски. Текст не выбирает кожу, лицо или одежду автоматически.
                    </p>
                    <Button type="button" variant="outline" disabled={!canEdit}
                      onClick={onSelectRegion}><Scan className="w-4 h-4 mr-2"/>Нарисовать / уточнить маску</Button>
                  </>
                )}
              </div>
              <Button type="button" disabled={!canEdit||!maskId||!maskConfirmed}
                onClick={handleSubmit} className="w-full">
                <SlidersHorizontal className="h-4 w-4 mr-2"/>Показать результат → принять или отклонить
              </Button>
            </>
          )}

          {plan.kind==='FASHION'&&(
            <div className="space-y-2 rounded-xl border p-3">
              <p className="text-sm">
                Надеть одежду реалистично — это не alpha-overlay. Нужны реальная фотография одежды,
                посадка по телу, контур и передний план (руки/волосы).
              </p>
              <Button type="button" disabled={!canEdit} onClick={onOpenFashion}
                className="w-full"><Shirt className="w-4 h-4 mr-2"/>Открыть Fashion / Outfit и посадку одежды</Button>
            </div>
          )}

          {plan.kind==='GENERATIVE'&&(
            <div className="space-y-3 rounded-xl border p-3">
              <p className="text-sm">
                Для этого нужна настоящая модель генерации, разрешённая Core, а не имитация.
                Существующий Creative Edit может вернуть ошибку, если провайдер не подключён.
              </p>
              <fieldset className="space-y-2 text-sm">
                <legend className="font-medium">Какие пиксели можно менять?</legend>
                <label className="flex items-start gap-2">
                  <input type="radio" name="bers-ai-generation-scope" value="MASKED"
                    checked={generativeScope==='MASKED'} disabled={!canEdit}
                    onChange={()=>{setGenerativeScope('MASKED');setGenerativeConfirmed(false);}} className="mt-1"/>
                  Только выбранный объект. Нужна сохранённая Core-маска.
                </label>
                <label className="flex items-start gap-2">
                  <input type="radio" name="bers-ai-generation-scope" value="WHOLE_IMAGE"
                    checked={generativeScope==='WHOLE_IMAGE'}
                    disabled={!canEdit||plan.target==='USER_SELECTED_OBJECT'||plan.warnings.length>0}
                    onChange={()=>{setGenerativeScope('WHOLE_IMAGE');setGenerativeConfirmed(false);setMaskConfirmed(false);}}
                    className="mt-1"/>
                  Весь кадр — только для общей обработки без требования сохранить отдельные объекты.
                </label>
                {generativeScope==='MASKED'&&(
                  <div className="space-y-2 rounded-lg border p-3">
                    {maskId?(
                      <label className="flex items-start gap-2">
                        <input type="checkbox" checked={maskConfirmed} disabled={!canEdit}
                          onChange={e=>setMaskConfirmed(e.target.checked)} className="mt-1"/>
                        Я проверил границы Core-маски: {selectedObject?.label||'выбранный объект'}.
                      </label>
                    ):(
                      <>
                        <p role="status">Нет выбранной Core-маски. ИИ не определяет точную область автоматически.</p>
                        <Button type="button" variant="outline" disabled={!canEdit}
                          onClick={onSelectRegion}><Scan className="w-4 h-4 mr-2"/>Создать / выбрать маску</Button>
                      </>
                    )}
                  </div>
                )}
              </fieldset>
              <p className="text-xs text-muted-foreground">
                Маска направляется в Core, но генеративную сохранность пикселей вне маски
                необходимо подтвердить на изображении «до/после»; этот экран не даёт
                математической гарантии работы провайдера.
              </p>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={generativeConfirmed} disabled={!canEdit}
                  onChange={e=>setGenerativeConfirmed(e.target.checked)}
                  className="mt-1"/>
                Я подтверждаю запуск существующего Core Creative Edit с указанной текстовой командой.
                Итог всё равно требует просмотра и принятия.
              </label>
              <Button type="button" disabled={!canEdit||!generativeConfirmed||
                (generativeScope==='MASKED'&&(!maskId||!maskConfirmed))}
                onClick={handleGenerate} className="w-full">
                <WandSparkles className="w-4 h-4 mr-2"/>Запросить генерацию через Core
              </Button>
            </div>
          )}
        </div>
      )}

      {executionError&&<p role="alert" className="text-sm text-destructive">{executionError}</p>}
      <p className="text-xs text-muted-foreground">
        Распознавание доступных простых команд пока ограничено правилами, а не полноценной визуальной AI-моделью.
        Редактор не утверждает, что понял скрытый смысл или видит предмет без реальной маски.
        Изменение проекта — только после Core Preview → Accept.
      </p>
    </section>
  );
}
