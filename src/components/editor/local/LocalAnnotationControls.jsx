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
  selectedIndex = null, onSelect = () => {}, onMove = () => {}, onEdit = () => {},
}) {
  const selected = Number.isInteger(selectedIndex) ? annotations[selectedIndex] : null;
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
      {mode !== 'off' && (
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
      )}

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
        {mode !== 'off' && <Button
          type="button" variant="outline"
          disabled={annotations.length >= MAX_LOCAL_ANNOTATIONS || (mode === 'text' && !options.text.trim())}
          onClick={onAddCentered}
          className="min-h-11 rounded-xl"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add centered {mode}
        </Button>}
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
                <button type="button"
                  aria-label={'Select annotation ' + (index + 1)}
                  aria-pressed={selectedIndex === index}
                  onClick={() => onSelect(selectedIndex === index ? null : index)}
                  className={'min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ' + (selectedIndex === index ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-accent')}
                >
                  {index + 1}. {annotation.type}{annotation.type === 'text' ? ': ' + annotation.text : ''}
                </button>
                <Button type="button" size="sm" variant="ghost" aria-label={'Delete annotation ' + (index + 1)} onClick={() => onDelete(index)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
                </Button>
              </li>
            ))}
          </ol>
          {selected && (
            <section aria-label="Selected annotation properties" className="space-y-3 rounded-xl border border-primary/20 bg-background p-3">
              <h5 className="text-sm font-semibold">Edit selected {selected.type}</h5>
              <p className="text-xs text-muted-foreground">Changes stay editable until export. Use arrow buttons for precise movement; each step can be undone.</p>
              <div className="grid grid-cols-4 gap-2" role="group" aria-label="Move selected annotation">
                <Button type="button" size="sm" variant="outline" aria-label="Move annotation left" onClick={() => onMove(-.01, 0)}>←</Button>
                <Button type="button" size="sm" variant="outline" aria-label="Move annotation up" onClick={() => onMove(0, -.01)}>↑</Button>
                <Button type="button" size="sm" variant="outline" aria-label="Move annotation down" onClick={() => onMove(0, .01)}>↓</Button>
                <Button type="button" size="sm" variant="outline" aria-label="Move annotation right" onClick={() => onMove(.01, 0)}>→</Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1 text-xs">
                  <span>Selected color</span>
                  <select aria-label="Selected annotation color" value={selected.color} onChange={event => onEdit({ color: event.target.value })} className="min-h-10 w-full rounded-lg border border-input bg-card px-2">
                    {LOCAL_ANNOTATION_COLORS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label className="block space-y-1 text-xs">
                  <span>Selected opacity · {Math.round(selected.opacity * 100)}%</span>
                  <input type="range" aria-label="Selected annotation opacity" min="1" max="100" step="1" value={Math.round(selected.opacity * 100)} onChange={event => onEdit({ opacity: Number(event.target.value) / 100 })} className="w-full accent-primary" />
                </label>
                {selected.type !== 'text' && (
                  <label className="block space-y-1 text-xs">
                    <span>Selected stroke thickness · {selected.thickness}%</span>
                    <input type="range" aria-label="Selected annotation thickness" min=".1" max="5" step=".1" value={selected.thickness} onChange={event => onEdit({ thickness: Number(event.target.value) })} className="w-full accent-primary" />
                  </label>
                )}
                {selected.type === 'text' && (
                  <>
                    <label className="block space-y-1 text-xs sm:col-span-2">
                      <span>Edit label</span>
                      <input type="text" aria-label="Selected annotation text" maxLength={MAX_LOCAL_ANNOTATION_TEXT} value={selected.text} onChange={event => onEdit({ text: event.target.value })} className="min-h-11 w-full rounded-lg border border-input bg-card px-3" />
                    </label>
                    <label className="block space-y-1 text-xs">
                      <span>Label size · {selected.fontSize}%</span>
                      <input type="range" aria-label="Selected annotation font size" min="1" max="16" step="1" value={selected.fontSize} onChange={event => onEdit({ fontSize: Number(event.target.value) })} className="w-full accent-primary" />
                    </label>
                  </>
                )}
              </div>
            </section>
          )}
        </div>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        Annotations can be removed individually or via Undo before export. The PNG is flattened; original photo pixels and Core project history remain untouched.
      </p>
    </section>
  );
}
