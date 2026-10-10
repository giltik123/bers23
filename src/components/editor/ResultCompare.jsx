import React, { useEffect, useState } from 'react';
import { Check, Trash2, RotateCcw, Loader2, ScanEye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdaptiveGestures } from '@/components/adaptive/AdaptiveGestures';
import {
  reviewCandidateIdentity, canAcceptReviewedCandidate,
} from '@/application/editor/ai-first/resultReviewGate';

const FASHION_REVIEW = Object.freeze([
  ['fit', 'Одежда сидит по телу, плечам и талии естественно'],
  ['occlusion', 'Руки, волосы и контуры тела правильно перекрывают ткань'],
  ['texture', 'Ткань, принт, швы и логотипы без заметных искажений'],
  ['identity', 'Лицо, освещение и фон остались естественными'],
]);
const EMPTY_REVIEW = Object.freeze({ fit: false, occlusion: false, texture: false, identity: false });

/**
 * Visual accept/reject is owned by the user. The browser cannot infer fit
 * quality from pixel identity or Core deterministic success. A photo not
 * visually reviewed should never be described as an accepted Fashion output.
 */
export default function ResultCompare({
  beforeUrl, result, kind = null, editScope = null, onAccept, onDiscard, onRetry, busy,
}) {
  const [view, setView] = useState('after');
  const [split, setSplit] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [fashionReview, setFashionReview] = useState(EMPTY_REVIEW);
  const [scopedReview, setScopedReview] = useState(false);
  const [acknowledgedIdentity, setAcknowledgedIdentity] = useState(null);
  const [loaded, setLoaded] = useState({ before: null, after: null });
  const [failed, setFailed] = useState({ before: null, after: null });
  const imageUrl = result?.preview_url || result?.image_url;
  const fashion = kind === 'FASHION_TRYON';
  const scopedGeneration = kind === 'AI_SCOPED_GENERATION';
  const allFashionAccepted = !fashion || Object.values(fashionReview).every(Boolean);
  const identity = reviewCandidateIdentity({
    beforeUrl, afterUrl: imageUrl, finalArtifactId: result?.finalArtifactId,
    executionId: result?.executionId, kind, scope: editScope,
  });
  const needsHumanReview = scopedGeneration || fashion;
  // A quality checklist is meaningful only after the current pair was
  // displayed and both images decoded successfully in this candidate.
  const reviewImagesReady = loaded.before === identity && loaded.after === identity
    && failed.before !== identity && failed.after !== identity;
  const markLoaded = role => {
    setLoaded(previous => ({ ...previous, [role]: identity }));
    setFailed(previous => ({ ...previous, [role]: null }));
  };
  const markFailed = role => {
    setFailed(previous => ({ ...previous, [role]: identity }));
    setLoaded(previous => ({ ...previous, [role]: null }));
  };
  const acceptDisabled = !imageUrl || !canAcceptReviewedCandidate({
    identity, acknowledgedIdentity,
    afterLoadedIdentity: loaded.after, beforeLoadedIdentity: loaded.before,
    afterErrorIdentity: failed.after, beforeErrorIdentity: failed.before,
    requiresBefore: scopedGeneration || fashion,
    requiresReview: needsHumanReview,
    reviewComplete: scopedGeneration ? scopedReview : allFashionAccepted,
    busy,
  });
  const gestures = useAdaptiveGestures({
    onSwipeLeft: () => setView('after'),
    onSwipeRight: () => setView('before'),
  });

  useEffect(() => {
    setFashionReview(EMPTY_REVIEW);
    setScopedReview(false);
    setAcknowledgedIdentity(identity);
    // Loaded/error flags carry the candidate identity. Do not reset them
    // here: a cached image may fire onLoad before this passive effect runs.
    setSplit(50);
    setView('after');
    setZoom(1);
  }, [identity]);

  return (
    <section className="border border-border/60 rounded-2xl p-3 space-y-4"
      aria-label="Просмотр готовой обработки перед сохранением">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-lg border border-border overflow-hidden text-xs"
          aria-label="Режим сравнения фотографии">
          {[['before','До'], ['after','После'], ['split','Сравнить границу']].map(([mode,label])=>(
            <button key={mode} type="button" onClick={()=>setView(mode)}
              aria-pressed={view===mode}
              className={`px-3 py-2 ${view===mode?'bg-primary text-primary-foreground':'hover:bg-accent'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <ScanEye className="w-4 h-4"/>
          <button type="button" aria-pressed={zoom===1}
            onClick={()=>setZoom(1)}
            className={zoom===1?'font-semibold underline':'hover:underline'}>1×</button>
          <button type="button" aria-pressed={zoom===2}
            onClick={()=>setZoom(2)}
            className={zoom===2?'font-semibold underline':'hover:underline'}>2×</button>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {result?.provider || 'Core result'} · {result?.credits_used ?? 0} credits
        {result?.generation_time_ms ? ` · ${(result.generation_time_ms/1000).toFixed(1)}s` : ''}
        {' · '}2× увеличивает видимую область, но не добавляет деталей в исходное изображение.
      </p>

      {view==='split'&&(
        <label className="flex items-center gap-3 text-xs" htmlFor="bers-photo-compare-boundary">
          <span>Граница сравнения</span>
          <input id="bers-photo-compare-boundary" type="range" min="0" max="100"
            className="flex-1" value={split}
            onChange={e=>setSplit(Number(e.target.value))}
            aria-label="Граница сравнения до и после"/>
          <span className="tabular-nums w-10 text-right">{split}%</span>
        </label>
      )}

      <div className="rounded-xl overflow-auto bg-muted border touch-pan-y" {...gestures.handlers}
        aria-label="Фактические изображения до и после">
        <div className="relative" style={{width:zoom===2?'200%':'100%'}}>
          {view==='before' ? (
            <img src={beforeUrl} alt="Исходная фотография до обработки"
              onLoad={()=>markLoaded('before')} onError={()=>markFailed('before')}
              className="block w-full h-auto max-h-[620px] object-contain"/>
          ) : view==='after' ? (
            <img src={imageUrl} alt="Результат обработки до принятия"
              onLoad={()=>markLoaded('after')} onError={()=>markFailed('after')}
              className="block w-full h-auto max-h-[620px] object-contain"/>
          ) : (
            <div className="relative">
              <img src={beforeUrl} alt="Исходная фотография; сравните с результатом"
                onLoad={()=>markLoaded('before')} onError={()=>markFailed('before')}
                className="block w-full h-auto max-h-[620px] object-contain"/>
              <img src={imageUrl} alt="Результат обработки справа от границы сравнения"
                onLoad={()=>markLoaded('after')} onError={()=>markFailed('after')}
                className="absolute inset-0 w-full h-full object-contain"
                style={{clipPath:`inset(0 0 0 ${split}%)`}}/>
              <div className="absolute inset-y-0 border-l-2 border-white pointer-events-none shadow-lg"
                style={{left:`${split}%`}} aria-hidden="true"/>
            </div>
          )}
        </div>
      </div>
      {view==='split'&&(
        <p className="text-xs text-muted-foreground">
          Для изменения размера или ориентации изображения граница является приблизительной:
          исходник и результат могут иметь разную геометрию.
        </p>
      )}

      {(failed.before === identity || failed.after === identity)&&(
        <p role="alert" className="text-xs text-destructive">
          Не удалось загрузить исходник или результат. Принятие заблокировано:
          отклоните обработку либо повторите её.
        </p>
      )}
      {needsHumanReview && (
        loaded.before !== identity || loaded.after !== identity
      ) && (
        <p role="status" className="text-xs text-muted-foreground">
          Для принятия откройте «До» и «После» либо «Сравнить границу».
          Подтверждение доступно только после загрузки обоих изображений.
        </p>
      )}
      {scopedGeneration&&(
        <div className="rounded-xl border border-amber-600/35 p-3 space-y-3"
          aria-label="Проверка результата генеративного ИИ">
          <h3 className="font-medium text-sm">ИИ · качество готовой фотографии</h3>
          <p className="text-xs text-muted-foreground">
            {editScope==='MASKED'
              ? 'Проверьте в сравнении, что вне выбранной маски человек, фон, текстуры и мелкие детали не изменились. Если изменения заметны — отклоните результат.'
              : 'Проверьте весь кадр: нет ли искажений лица, рук, объектов, текста, света и текстур.'}
            {' '}Галочка означает только вашу проверку, а не автоматическую оценку качества.
          </p>
          <label className="flex gap-2 items-start text-sm">
            <input type="checkbox" className="mt-1" disabled={busy || !reviewImagesReady}
              checked={scopedReview} onChange={e=>setScopedReview(e.target.checked)}/>
            <span>Я просмотрел итоговое изображение и считаю результат подходящим для принятия.</span>
          </label>
        </div>
      )}
      {fashion&&(
        <div className="rounded-xl border border-amber-600/35 p-3 space-y-3"
          aria-label="Ручная оценка реализма Fashion">
          <h3 className="font-medium text-sm">Fashion · проверка готовой примерки</h3>
          <p className="text-xs text-muted-foreground">
            Технический успех не означает реалистичную посадку. Если хоть один пункт не выполнен,
            отклоните результат и исправьте контур/якоря тела. Блокировка не подтверждает
            качество автоматически — решение остаётся за вами.
          </p>
          {FASHION_REVIEW.map(([key,label])=>(
            <label key={key} className="flex gap-2 items-start text-sm">
              <input type="checkbox" className="mt-1" disabled={busy || !reviewImagesReady}
                checked={fashionReview[key]}
                onChange={event=>setFashionReview(current=>({
                  ...current,[key]:event.target.checked,
                }))}/>
              <span>{label}</span>
            </label>
          ))}
          {!allFashionAccepted&&(
            <p role="status" className="text-xs text-amber-700 dark:text-amber-400">
              Примерка не принята по визуальным критериям. Можно исправить посадку, повторить
              генерацию или отказаться от результата.
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <Button type="button" onClick={onAccept} disabled={acceptDisabled}
          className="flex-1 min-w-28 rounded-xl">
          {busy?<Loader2 className="w-4 h-4 mr-2 animate-spin"/>:
            <Check className="w-4 h-4 mr-2"/>} Принять в историю
        </Button>
        <Button type="button" variant="outline" onClick={onRetry} disabled={busy}
          className="rounded-xl">
          <RotateCcw className="w-4 h-4 mr-2"/> Изменить / повторить
        </Button>
        <Button type="button" variant="outline" onClick={onDiscard} disabled={busy}
          className="rounded-xl text-destructive hover:text-destructive">
          <Trash2 className="w-4 h-4 mr-2"/> Отклонить
        </Button>
      </div>
    </section>
  );
}
