import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, SlidersHorizontal, Scan, Shirt, WandSparkles, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import {
  interpretPhotoCommand,
  sanitizePhotoAdjustmentDraft,
} from '@/application/editor/ai-first/interpretPhotoCommand';

const INITIAL_LEVELS = Object.freeze({
  inputBlack:0,inputMidpoint:128,inputWhite:255,outputBlack:3,outputWhite:255,
});
const OPERATION_LABEL_KEYS = Object.freeze({
  MASKED_EXPOSURE:'editorAi.operation.maskedExposure',
  MASKED_WHITE_BALANCE:'editorAi.operation.maskedWhiteBalance',
  MASKED_LEVELS:'editorAi.operation.maskedLevels',
  BACKGROUND_ISOLATION:'editorAi.operation.backgroundIsolation',
});
const EXAMPLE_KEYS = Object.freeze([
  'editorAi.examples.brightenFabric',
  'editorAi.examples.warmRegion',
  'editorAi.examples.increaseContrast',
  'editorAi.examples.sunsetSky',
  'editorAi.examples.changeDress',
]);
const LEVEL_FIELDS = Object.freeze([
  ['inputBlack','editorAi.labels.inputBlack',0,254],
  ['inputMidpoint','editorAi.labels.inputMidpoint',1,254],
  ['inputWhite','editorAi.labels.inputWhite',1,255],
  ['outputBlack','editorAi.labels.outputBlack',0,254],
  ['outputWhite','editorAi.labels.outputWhite',1,255],
]);
const field = 'w-full accent-primary disabled:opacity-40';

export default function AICommandStudio({
  project, selectedObject, instruction, onInstructionChange,
  disabled=false, selectionActive=false, pending=false, maskToolsEnabled=false,
  onSelectRegion, onExecuteAdjustment, onExecuteGenerative, onPrepareFreeAccount, onOpenFashion,
}) {
  const { t, language } = useTranslation();
  const plan=useMemo(()=>interpretPhotoCommand(instruction),[instruction]);
  const explanation = plan.explanationKey
    ? t(plan.explanationKey)
    : t('editorAi.explanations.unknownAdjustment');
  const warnings = Array.isArray(plan.warningKeys)
    ? plan.warningKeys.map(key => t(key))
    : [];
  const [parameters,setParameters]=useState(null);
  const [maskConfirmed,setMaskConfirmed]=useState(false);
  const [generativeConfirmed,setGenerativeConfirmed]=useState(false);
  const [generativeScope,setGenerativeScope]=useState('MASKED');
  const [executionError,setExecutionError]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const maskId=maskToolsEnabled ? (selectedObject?.mask_artifact_id||null) : null;
  const operationLabel = t(OPERATION_LABEL_KEYS[plan.operation] || 'editorAi.labels.adjustment');
  const selectedRegionName = selectedObject?.label || t('editorAi.labels.selectedRegion');
  const formatEv = value => new Intl.NumberFormat(language, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(value);
  const canEdit=!disabled&&!selectionActive&&!pending&&!submitting&&Boolean(project?.current_image_artifact_id);

  useEffect(()=>{
    setParameters(plan.parameters?{...plan.parameters}:null);
    setMaskConfirmed(false);
    setGenerativeConfirmed(false);
    setGenerativeScope('MASKED');
    setExecutionError('');
  },[plan.instruction,plan.operation,project?.id,project?.current_image_artifact_id,selectedObject?.id,maskId]);

  const update=(key,value)=>{
    setParameters(previous=>({...previous,[key]:value}));
    setExecutionError('');
  };
  const handleSubmit=async()=>{
    if(!canEdit||plan.kind!=='ADJUSTMENT'||!maskId||!maskConfirmed)return;
    setSubmitting(true);setExecutionError('');
    try{
      const safe=sanitizePhotoAdjustmentDraft({...plan,parameters});
      await onExecuteAdjustment({
        ...safe,
        expectedProjectId: project.id,
        expectedSourceArtifactId: project.current_image_artifact_id,
        expectedSelectedObjectId: selectedObject?.id,
        expectedMaskArtifactId: maskId,
      });
    }catch(error){
      setExecutionError(t('editorAi.errors.adjustmentFailed'));
    }finally{setSubmitting(false);}
  };
  const handleGenerate=async()=>{
    const scope = maskToolsEnabled ? generativeScope : 'WHOLE_IMAGE';
    // Full-frame generation is an explicit user choice, not a keyword classifier.
    // Masked generation still follows the narrower verified-intent contract.
    if(!canEdit||!generativeConfirmed||!plan.instruction||plan.kind==='FASHION'||
       (maskToolsEnabled&&plan.kind!=='GENERATIVE')||
       (scope==='MASKED'&&(!maskId||!maskConfirmed)))return;
    setSubmitting(true);setExecutionError('');
    try{
      // Idempotent server-owned FREE account setup. No client-supplied balance,
      // grant amount, subscription, billing override or payment authority.
      await onPrepareFreeAccount?.();
      await onExecuteGenerative({
      instruction:plan.instruction,
      mode:scope,
      expectedProjectId:project.id,
      expectedSourceArtifactId:project.current_image_artifact_id,
      expectedSelectedObjectId:scope==='MASKED'?selectedObject?.id:null,
      expectedMaskArtifactId:scope==='MASKED'?maskId:null,
    });}
    catch(error){
      setExecutionError(error?.code==='insufficient_credits'
        ? t('editorAi.errors.insufficientCredits')
        : t('editorAi.errors.generationUnavailable'));
    }
    finally{setSubmitting(false);}
  };

  const controls=plan.kind==='ADJUSTMENT'&&parameters&&(
    <section className="space-y-4 border border-border/70 rounded-xl p-4"
      aria-label={t('editorAi.sections.adjustableParameters')}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <SlidersHorizontal className="h-4 w-4" />
        {operationLabel}
      </div>
      {plan.operation==='MASKED_EXPOSURE'&&(
        <label className="block space-y-2 text-sm">
          <div className="flex justify-between"><span>{t('editorAi.labels.exposure')}</span>
            <span className="tabular-nums">{t('editorAi.values.ev', { value: formatEv(parameters.eighthStops/8) })}</span></div>
          <input type="range" className={field} min="-32" max="32" step="1"
            value={parameters.eighthStops} disabled={!canEdit}
            onChange={e=>update('eighthStops',Number(e.target.value))}/>
        </label>
      )}
      {plan.operation==='MASKED_WHITE_BALANCE'&&(
        <>
          <label className="block space-y-2 text-sm">
            <div className="flex justify-between"><span>{t('editorAi.labels.temperature')}</span>
              <span className="tabular-nums">{parameters.temperatureQ8}</span></div>
            <input type="range" className={field} min="-128" max="128" step="1"
              value={parameters.temperatureQ8} disabled={!canEdit}
              onChange={e=>update('temperatureQ8',Number(e.target.value))}/>
          </label>
          <label className="block space-y-2 text-sm">
            <div className="flex justify-between"><span>{t('editorAi.labels.tint')}</span>
              <span className="tabular-nums">{parameters.tintQ8}</span></div>
            <input type="range" className={field} min="-64" max="64" step="1"
              value={parameters.tintQ8} disabled={!canEdit}
              onChange={e=>update('tintQ8',Number(e.target.value))}/>
          </label>
        </>
      )}
      {plan.operation==='MASKED_LEVELS'&&(
        <>
          {LEVEL_FIELDS.map(([key,labelKey,min,max])=>(
            <label key={key} className="block space-y-2 text-sm">
              <div className="flex justify-between"><span>{t(labelKey)}</span>
                <span className="tabular-nums">{parameters[key]}</span></div>
              <input type="range" className={field} min={min} max={max} step="1"
                value={parameters[key]} disabled={!canEdit}
                onChange={e=>update(key,Number(e.target.value))}/>
            </label>
          ))}
        </>
      )}
      <p className="text-xs text-muted-foreground">
        {t('editorAi.hints.suggestedValues')}
      </p>
    </section>
  );

  if (!maskToolsEnabled) {
    // Production intentionally exposes whole-image generation only.
    // Preserve manual Core mask artifacts and controlled-edit capabilities
    // internally without presenting mask controls or silently changing scope.
    const wholeImageAdmitted = Boolean(plan.instruction) && plan.kind !== 'FASHION';
    return (
      <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-4" aria-label={t('editorAi.sections.wholeImage')}>
        <header className="space-y-1">
          <h2 className="flex items-center gap-2 font-semibold"><Sparkles className="h-5 w-5" />{t('editorAi.headings.wholeImage')}</h2>
          <p className="text-sm text-muted-foreground">{t('editorAi.descriptions.wholeImage')}</p>
        </header>
        <label className="block space-y-2">
          <span className="text-sm font-medium">{t('editorAi.fields.command')}</span>
          <textarea aria-label={t('editorAi.fields.command')} rows={3} maxLength={850}
            value={instruction} disabled={disabled||pending||submitting}
            placeholder={t('editorAi.placeholders.wholeImage')}
            onChange={e=>onInstructionChange(e.target.value)}
            className="w-full min-h-24 rounded-xl border border-input bg-background px-3 py-2 text-sm resize-y"/>
        </label>
        {wholeImageAdmitted ? (
          <div className="space-y-3">
            <p className="text-sm">{t('editorAi.descriptions.wholeImageScope')}</p>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={generativeConfirmed} disabled={!canEdit}
                onChange={e=>setGenerativeConfirmed(e.target.checked)} className="mt-1"/>
              {t('editorAi.confirmations.wholeImage')}
            </label>
            <Button type="button" disabled={!canEdit||!generativeConfirmed} onClick={handleGenerate} className="w-full">
              <WandSparkles className="mr-2 h-4 w-4"/>{t('editorAi.actions.generateFree')}
            </Button>
          </div>
        ) : plan.kind === 'FASHION' ? (
          <Button type="button" disabled={!canEdit} onClick={onOpenFashion} className="w-full">
            <Shirt className="mr-2 h-4 w-4"/>{t('editorAi.actions.openFashion')}
          </Button>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            {plan.kind === 'CLARIFY' ? explanation : t('editorAi.status.unsupportedRegion')}
          </p>
        )}
        {executionError&&<p role="alert" className="text-sm text-destructive">{executionError}</p>}
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-4"
      aria-label={t('editorAi.sections.commandEditor')}>
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          <h2 className="font-semibold">{t('editorAi.headings.commandEditor')}</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('editorAi.descriptions.commandEditor')}
        </p>
      </header>

      <label className="block space-y-2">
        <span className="text-sm font-medium">{t('editorAi.fields.command')}</span>
        <textarea aria-label={t('editorAi.fields.command')} rows={3} maxLength={850}
          value={instruction} disabled={disabled||pending||submitting}
          placeholder={t('editorAi.placeholders.masked')}
          onChange={e=>onInstructionChange(e.target.value)}
          className="w-full min-h-24 rounded-xl border border-input bg-background px-3 py-2 text-sm resize-y"/>
      </label>
      <div className="flex flex-wrap gap-2" aria-label={t('editorAi.sections.examples')}>
        {EXAMPLE_KEYS.map(key=><button key={key} type="button"
          disabled={disabled||pending||submitting}
          onClick={()=>onInstructionChange(t(key))}
          className="rounded-full border px-2.5 py-1.5 text-xs hover:bg-accent disabled:opacity-50">
          {t(key)}
        </button>)}
      </div>

      {plan.kind==='CLARIFY'?(
        <p role="status" className="rounded-xl bg-secondary/40 p-3 text-sm">{explanation}</p>
      ):(
        <div className="space-y-3">
          <p className="text-sm">{explanation}</p>
          {warnings.map((warning,i)=>(
            <p role="note" key={i} className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0"/>{warning}
            </p>
          ))}

          {plan.kind==='ADJUSTMENT'&&(
            <>
              {controls}
              <div className="rounded-xl border p-3 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Scan className="h-4 w-4"/>{t('editorAi.sections.regionAndMask')}
                </div>
                {maskId?(
                  <>
                    <p className="text-sm">
                      {t('editorAi.status.coreMaskSelected', { target: selectedRegionName })}
                    </p>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" checked={maskConfirmed}
                        disabled={!canEdit} onChange={e=>setMaskConfirmed(e.target.checked)}
                        className="mt-1"/>
                      {t('editorAi.confirmations.mask')}
                    </label>
                  </>
                ):(
                  <>
                    <p role="status" className="text-sm text-amber-700 dark:text-amber-400">
                      {t('editorAi.status.noConfirmedMask')}
                    </p>
                    <Button type="button" variant="outline" disabled={!canEdit}
                      onClick={onSelectRegion}><Scan className="w-4 h-4 mr-2"/>{t('editorAi.actions.drawMask')}</Button>
                  </>
                )}
              </div>
              <Button type="button" disabled={!canEdit||!maskId||!maskConfirmed}
                onClick={handleSubmit} className="w-full">
                <SlidersHorizontal className="h-4 w-4 mr-2"/>{t('editorAi.actions.showResult')}
              </Button>
            </>
          )}

          {plan.kind==='FASHION'&&(
            <div className="space-y-2 rounded-xl border p-3">
              <p className="text-sm">
                {t('editorAi.descriptions.fashion')}
              </p>
              <Button type="button" disabled={!canEdit} onClick={onOpenFashion}
                className="w-full"><Shirt className="w-4 h-4 mr-2"/>{t('editorAi.actions.openFashionOutfit')}</Button>
            </div>
          )}

          {plan.kind==='GENERATIVE'&&(
            <div className="space-y-3 rounded-xl border p-3">
              <p className="text-sm">
                {t('editorAi.descriptions.generative')}
              </p>
              <fieldset className="space-y-2 text-sm">
                <legend className="font-medium">{t('editorAi.fields.generationScope')}</legend>
                <label className="flex items-start gap-2">
                  <input type="radio" name="bers-ai-generation-scope" value="MASKED"
                    checked={generativeScope==='MASKED'} disabled={!canEdit}
                    onChange={()=>{setGenerativeScope('MASKED');setGenerativeConfirmed(false);}} className="mt-1"/>
                  {t('editorAi.labels.selectedObjectOnly')}
                </label>
                <label className="flex items-start gap-2">
                  <input type="radio" name="bers-ai-generation-scope" value="WHOLE_IMAGE"
                    checked={generativeScope==='WHOLE_IMAGE'}
                    disabled={!canEdit||plan.target==='USER_SELECTED_OBJECT'||plan.warnings.length>0}
                    onChange={()=>{setGenerativeScope('WHOLE_IMAGE');setGenerativeConfirmed(false);setMaskConfirmed(false);}}
                    className="mt-1"/>
                  {t('editorAi.labels.wholeFrame')}
                </label>
                {generativeScope==='MASKED'&&(
                  <div className="space-y-2 rounded-lg border p-3">
                    {maskId?(
                      <label className="flex items-start gap-2">
                        <input type="checkbox" checked={maskConfirmed} disabled={!canEdit}
                          onChange={e=>setMaskConfirmed(e.target.checked)} className="mt-1"/>
                        {t('editorAi.confirmations.maskBoundaries', { target: selectedRegionName })}
                      </label>
                    ):(
                      <>
                        <p role="status">{t('editorAi.status.noMaskSelected')}</p>
                        <Button type="button" variant="outline" disabled={!canEdit}
                          onClick={onSelectRegion}><Scan className="w-4 h-4 mr-2"/>{t('editorAi.actions.createSelectMask')}</Button>
                      </>
                    )}
                  </div>
                )}
              </fieldset>
              <p className="text-xs text-muted-foreground">
                {t('editorAi.descriptions.maskGuarantee')}
              </p>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={generativeConfirmed} disabled={!canEdit}
                  onChange={e=>setGenerativeConfirmed(e.target.checked)}
                  className="mt-1"/>
                {t('editorAi.confirmations.generative')}
              </label>
              <Button type="button" disabled={!canEdit||!generativeConfirmed||
                (generativeScope==='MASKED'&&(!maskId||!maskConfirmed))}
                onClick={handleGenerate} className="w-full">
                <WandSparkles className="w-4 h-4 mr-2"/>{t('editorAi.actions.generateViaCore')}
              </Button>
            </div>
          )}
        </div>
      )}

      {executionError&&<p role="alert" className="text-sm text-destructive">{executionError}</p>}
      <p className="text-xs text-muted-foreground">
        {t('editorAi.disclaimers.commandEditor')}
      </p>
    </section>
  );
}
