import React from 'react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { ArrowUpRight, RectangleHorizontal, Circle, Type, MousePointer2, Trash2, Plus, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  LOCAL_ANNOTATION_TOOLS, LOCAL_ANNOTATION_COLORS,
  MAX_LOCAL_ANNOTATIONS, MAX_LOCAL_ANNOTATION_TEXT,
} from '@/lib/local-editor/localAnnotations';

const ICONS = Object.freeze({
  off: MousePointer2,
  arrow: ArrowUpRight,
  rectangle: RectangleHorizontal,
  ellipse: Circle,
  text: Type,
  redact: ShieldAlert,
});

export default function LocalAnnotationControls({
  mode, onMode, annotations, onAddCentered, onDelete, onClear,
  options, onOptionsChange,
  selectedIndex = null, onSelect = () => {}, onMove = () => {}, onEdit = () => {},
}) {
  const { t } = useTranslation();
  const selected = Number.isInteger(selectedIndex) ? annotations[selectedIndex] : null;
  const toolLabel = type => t('localEditorUi.annotationTool.' + type);
  const colorLabel = value => {
    const key = ({ '#ef4444': 'red', '#0f766e': 'teal', '#f59e0b': 'amber', '#ffffff': 'white', '#111827': 'black' })[value] || 'black';
    return t('localEditorUi.annotationColor.' + key);
  };
  return (
    <section aria-label={t('localEditorUi.annotationSection')} className="space-y-4 rounded-2xl border border-border/70 bg-card p-4">
      <header>
        <h3 className="text-lg font-semibold">{t('localEditorUi.annotationTitle')}</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {t('localEditorUi.annotationDescription')}
        </p>
      </header>
      <div role="group" aria-label={t('localEditorUi.annotationTools')} className="flex flex-wrap gap-2">
        {LOCAL_ANNOTATION_TOOLS.map(tool => {
          const Icon = ICONS[tool.id];
          return (
            <Button
              key={tool.id}
              type="button"
              size="sm"
              variant={mode === tool.id ? 'default' : 'outline'}
              aria-pressed={mode === tool.id}
              onClick={() => onMode(tool.id)}
              disabled={tool.id !== 'off' && annotations.length >= MAX_LOCAL_ANNOTATIONS}
              className="min-h-11 rounded-xl"
            >
              <Icon className="h-4 w-4" aria-hidden="true" /> {toolLabel(tool.id)}
            </Button>
          );
        })}
      </div>
      {mode === 'redact' && (
        <p role="note" className="rounded-xl border border-border/70 bg-muted p-3 text-xs leading-5">
          {t('localEditorUi.redactNotice')}
        </p>
      )}
      {mode !== 'off' && mode !== 'redact' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t('localEditorUi.annotationColorLabel')}</span>
          <select
            aria-label={t('localEditorUi.annotationColorInput')}
            value={options.color}
            onChange={event => onOptionsChange({ ...options, color: event.target.value })}
            className="min-h-11 w-full rounded-xl border border-input bg-background px-3"
          >
            {LOCAL_ANNOTATION_COLORS.map(item => <option value={item.value} key={item.value}>{colorLabel(item.value)}</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="flex justify-between font-medium"><span>{t('localEditorUi.annotationThickness')}</span><output>{options.thickness}%</output></span>
          <input aria-label={t('localEditorUi.annotationThicknessInput')} className="w-full accent-primary" type="range" min=".1" max="5" step=".1" value={options.thickness} onChange={event => onOptionsChange({ ...options, thickness: Number(event.target.value) })} />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="flex justify-between font-medium"><span>{t('localEditorUi.annotationOpacity')}</span><output>{Math.round(options.opacity * 100)}%</output></span>
          <input aria-label={t('localEditorUi.annotationOpacityInput')} className="w-full accent-primary" type="range" min="1" max="100" step="1" value={Math.round(options.opacity * 100)} onChange={event => onOptionsChange({ ...options, opacity: Number(event.target.value) / 100 })} />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="flex justify-between font-medium"><span>{t('localEditorUi.annotationFontSize')}</span><output>{options.fontSize}%</output></span>
          <input aria-label={t('localEditorUi.annotationFontSizeInput')} className="w-full accent-primary" type="range" min="1" max="16" step="1" value={options.fontSize} onChange={event => onOptionsChange({ ...options, fontSize: Number(event.target.value) })} />
        </label>
        </div>
      )}

      {mode === 'text' && (
        <label className="block space-y-2 text-sm">
          <span className="font-medium">{t('localEditorUi.annotationLabelText')}</span>
          <input
            type="text"
            maxLength={MAX_LOCAL_ANNOTATION_TEXT}
            aria-label={t('localEditorUi.annotationTextInput')}
            value={options.text}
            onChange={event => onOptionsChange({ ...options, text: event.target.value })}
            placeholder={t('localEditorUi.annotationPlaceholder')}
            className="min-h-11 w-full rounded-xl border border-input bg-background px-3"
          />
        </label>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-xs leading-5 text-muted-foreground">
          {t(mode === 'off' ? 'localEditorUi.inspectImageHint' : mode === 'text' ? 'localEditorUi.textImageHint' : mode === 'redact' ? 'localEditorUi.redactImageHint' : 'localEditorUi.drawImageHint')} {' '}{t('localEditorUi.annotationCount', { count: annotations.length, max: MAX_LOCAL_ANNOTATIONS })}
        </p>
        {mode !== 'off' && <Button
          type="button" variant="outline"
          disabled={annotations.length >= MAX_LOCAL_ANNOTATIONS || (mode === 'text' && !options.text.trim())}
          onClick={onAddCentered}
          className="min-h-11 rounded-xl"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> {mode === 'redact' ? t('localEditorUi.addCenteredCover') : t('localEditorUi.addCentered', { tool: toolLabel(mode) })}
        </Button>}
      </div>
      {!!annotations.length && (
        <div className="space-y-2 border-t border-border/70 pt-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">{t('localEditorUi.yourAnnotations')}</h4>
            <Button type="button" variant="outline" size="sm" onClick={onClear}>{t('localEditorUi.clearAll')}</Button>
          </div>
          <ol className="space-y-2" aria-label={t('localEditorUi.annotationList')}>
            {annotations.map((annotation, index) => (
              <li key={index} className="flex min-w-0 items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
                <button type="button"
                  aria-label={t('localEditorUi.selectAnnotation', { index: index + 1 })}
                  aria-pressed={selectedIndex === index}
                  onClick={() => onSelect(selectedIndex === index ? null : index)}
                  className={'min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ' + (selectedIndex === index ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-accent')}
                >
                  {index + 1}. {toolLabel(annotation.type)}{annotation.type === 'text' ? ': ' + annotation.text : ''}
                </button>
                <Button type="button" size="sm" variant="ghost" aria-label={t('localEditorUi.deleteAnnotation', { index: index + 1 })} onClick={() => onDelete(index)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> {t('localEditorUi.deleteAnnotationAction')}
                </Button>
              </li>
            ))}
          </ol>
          {selected && (
            <section aria-label={t('localEditorUi.selectedAnnotationProperties')} className="space-y-3 rounded-xl border border-primary/20 bg-background p-3">
              <h5 className="text-sm font-semibold">{t('localEditorUi.editSelected', { tool: toolLabel(selected.type) })}</h5>
              <p className="text-xs text-muted-foreground">{t('localEditorUi.editSelectedHint')}</p>
              <div className="grid grid-cols-4 gap-2" role="group" aria-label={t('localEditorUi.moveSelectedAnnotation')}>
                <Button type="button" size="sm" variant="outline" aria-label={t('localEditorUi.moveLeft')} onClick={() => onMove(-.01, 0)}>←</Button>
                <Button type="button" size="sm" variant="outline" aria-label={t('localEditorUi.moveUp')} onClick={() => onMove(0, -.01)}>↑</Button>
                <Button type="button" size="sm" variant="outline" aria-label={t('localEditorUi.moveDown')} onClick={() => onMove(0, .01)}>↓</Button>
                <Button type="button" size="sm" variant="outline" aria-label={t('localEditorUi.moveRight')} onClick={() => onMove(.01, 0)}>→</Button>
              </div>
              {selected.type === 'redact' ? (
                <p className="text-xs leading-5 text-muted-foreground">{t('localEditorUi.lockedCoverHint')}</p>
              ) : <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1 text-xs">
                  <span>{t('localEditorUi.selectedColor')}</span>
                  <select aria-label={t('localEditorUi.selectedColor')} value={selected.color} onChange={event => onEdit({ color: event.target.value })} className="min-h-10 w-full rounded-lg border border-input bg-card px-2">
                    {LOCAL_ANNOTATION_COLORS.map(item => <option key={item.value} value={item.value}>{colorLabel(item.value)}</option>)}
                  </select>
                </label>
                <label className="block space-y-1 text-xs">
                  <span>{t('localEditorUi.selectedOpacity', { opacity: Math.round(selected.opacity * 100) })}</span>
                  <input type="range" aria-label={t('localEditorUi.selectedOpacity', { opacity: Math.round(selected.opacity * 100) })} min="1" max="100" step="1" value={Math.round(selected.opacity * 100)} onChange={event => onEdit({ opacity: Number(event.target.value) / 100 })} className="w-full accent-primary" />
                </label>
                {selected.type !== 'text' && (
                  <label className="block space-y-1 text-xs">
                    <span>{t('localEditorUi.selectedThickness', { thickness: selected.thickness })}</span>
                    <input type="range" aria-label={t('localEditorUi.selectedThickness', { thickness: selected.thickness })} min=".1" max="5" step=".1" value={selected.thickness} onChange={event => onEdit({ thickness: Number(event.target.value) })} className="w-full accent-primary" />
                  </label>
                )}
                {selected.type === 'text' && (
                  <>
                    <label className="block space-y-1 text-xs sm:col-span-2">
                      <span>{t('localEditorUi.editLabel')}</span>
                      <input type="text" aria-label={t('localEditorUi.annotationTextInput')} maxLength={MAX_LOCAL_ANNOTATION_TEXT} value={selected.text} onChange={event => onEdit({ text: event.target.value })} className="min-h-11 w-full rounded-lg border border-input bg-card px-3" />
                    </label>
                    <label className="block space-y-1 text-xs">
                      <span>{t('localEditorUi.labelSize', { size: selected.fontSize })}</span>
                      <input type="range" aria-label={t('localEditorUi.labelSize', { size: selected.fontSize })} min="1" max="16" step="1" value={selected.fontSize} onChange={event => onEdit({ fontSize: Number(event.target.value) })} className="w-full accent-primary" />
                    </label>
                  </>
                )}
              </div>}
            </section>
          )}
        </div>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        {t('localEditorUi.annotationExportNote')}
      </p>
    </section>
  );
}
