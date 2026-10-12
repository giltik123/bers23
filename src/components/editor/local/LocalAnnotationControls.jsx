import React from 'react';
import { ArrowUpRight, RectangleHorizontal, Circle, Type, MousePointer2, Trash2, Plus } from 'lucide-react';
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
});

export default function LocalAnnotationControls({
  mode, onMode, annotations, onAddCentered, onDelete, onClear,
  options, onOptionsChange,
}) {
  return (
    <section aria-label="Local photo annotations" className="space-y-4 rounded-2xl border border-border/70 bg-card p-4">
      <header>
        <h3 className="text-lg font-semibold">Text & shapes</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Draw arrows and outlines or place a short label on your photo. Items stay separate until export, so you can remove them individually or use Undo.
        </p>
      </header>
      <div role="group" aria-label="Annotation drawing tools" className="flex flex-wrap gap-2">
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
              <Icon className="h-4 w-4" aria-hidden="true" /> {tool.label}
            </Button>
          );
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Color</span>
          <select
            aria-label="Annotation color"
            value={options.color}
            onChange={event => onOptionsChange({ ...options, color: event.target.value })}
            className="min-h-11 w-full rounded-xl border border-input bg-background px-3"
          >
            {LOCAL_ANNOTATION_COLORS.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="flex justify-between font-medium"><span>Stroke thickness</span><output>{options.thickness}%</output></span>
          <input aria-label="Annotation thickness" className="w-full accent-primary" type="range" min=".1" max="5" step=".1" value={options.thickness} onChange={event => onOptionsChange({ ...options, thickness: Number(event.target.value) })} />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="flex justify-between font-medium"><span>Opacity</span><output>{Math.round(options.opacity * 100)}%</output></span>
          <input aria-label="Annotation opacity" className="w-full accent-primary" type="range" min="1" max="100" step="1" value={Math.round(options.opacity * 100)} onChange={event => onOptionsChange({ ...options, opacity: Number(event.target.value) / 100 })} />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="flex justify-between font-medium"><span>Font size</span><output>{options.fontSize}%</output></span>
          <input aria-label="Annotation font size" className="w-full accent-primary" type="range" min="1" max="16" step="1" value={options.fontSize} onChange={event => onOptionsChange({ ...options, fontSize: Number(event.target.value) })} />
        </label>
      </div>

      {mode === 'text' && (
        <label className="block space-y-2 text-sm">
          <span className="font-medium">Label text (up to 120 characters)</span>
          <input
            type="text"
            maxLength={MAX_LOCAL_ANNOTATION_TEXT}
            aria-label="Annotation text"
            value={options.text}
            onChange={event => onOptionsChange({ ...options, text: event.target.value })}
            placeholder="Type a label to place on the image"
            className="min-h-11 w-full rounded-xl border border-input bg-background px-3"
          />
        </label>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-xs leading-5 text-muted-foreground">
          {mode === 'off' ? 'Inspect the image without drawing.' :
            mode === 'text' ? 'Click or tap the image to place your label.' :
              'Drag over the image to draw. Release to add the shape.'}
          {' '}{annotations.length}/{MAX_LOCAL_ANNOTATIONS} annotations.
        </p>
        <Button
          type="button" variant="outline"
          disabled={mode === 'off' || annotations.length >= MAX_LOCAL_ANNOTATIONS || (mode === 'text' && !options.text.trim())}
          onClick={onAddCentered}
          className="min-h-11 rounded-xl"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add centered {mode === 'off' ? 'shape' : mode}
        </Button>
      </div>
      {!!annotations.length && (
        <div className="space-y-2 border-t border-border/70 pt-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Your annotations</h4>
            <Button type="button" variant="outline" size="sm" onClick={onClear}>Clear all</Button>
          </div>
          <ol className="space-y-2" aria-label="Annotation list">
            {annotations.map((annotation, index) => (
              <li key={index} className="flex min-w-0 items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{index + 1}. {annotation.type}{annotation.type === 'text' ? ': ' + annotation.text : ''}</span>
                <Button type="button" size="sm" variant="ghost" aria-label={'Delete annotation ' + (index + 1)} onClick={() => onDelete(index)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
                </Button>
              </li>
            ))}
          </ol>
        </div>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        Annotations can be removed individually or via Undo before export. The PNG is flattened; original photo pixels and Core project history remain untouched.
      </p>
    </section>
  );
}
