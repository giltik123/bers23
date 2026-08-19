import React from 'react';
import { Button } from '@/components/ui/button';

const modes = [['SMART_SELECT', 'Smart'], ['BRUSH_ADD', 'Add'], ['BRUSH_SUBTRACT', 'Remove']];
export default function SelectionToolbar({ selection, brushSize, onBrushSize, onMode, onUndo, onRedo, onClear, onCancel, onDone, onStart }) {
  if (!selection) return <Button type="button" variant="outline" onClick={onStart}>Smart Select</Button>;
  return (
    <section className="rounded-xl border bg-card p-3 space-y-3" aria-label="Selection tools">
      <div className="flex flex-wrap gap-2">
        {modes.map(([id, label]) => <Button key={id} type="button" size="sm" variant={selection.mode === id ? 'default' : 'outline'} onClick={() => onMode(id)}>{label}</Button>)}
        <label className="flex items-center gap-2 px-2 text-xs">Brush Size
          <input aria-label="Brush Size" type="range" min="2" max="96" value={brushSize} onChange={(event) => onBrushSize(Number(event.target.value))} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={!selection.canUndo} onClick={onUndo}>Undo</Button>
        <Button type="button" size="sm" variant="outline" disabled={!selection.canRedo} onClick={onRedo}>Redo</Button>
        <Button type="button" size="sm" variant="outline" onClick={onClear}>Clear</Button>
        <span className="flex-1" />
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="button" size="sm" disabled={selection.state === 'NOTHING_SELECTED' || selection.state === 'SELECTING'} onClick={onDone}>Done</Button>
      </div>
      {selection.state === 'SELECTING' && <p className="text-xs text-muted-foreground" role="status">Preparing Smart Selection…</p>}
      {selection.warning && <p className="text-xs text-amber-600" role="status">Smart selection is unavailable. Add and Remove remain available.</p>}
    </section>
  );
}
