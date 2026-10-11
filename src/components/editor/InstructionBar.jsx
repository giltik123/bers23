import React from 'react';
import { Wand2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function InstructionBar({ selectedObject, instruction, onInstructionChange, onApply, applying, allowWholeImage = false }) {
  const canEdit = Boolean(selectedObject || allowWholeImage);
  const wholeImage = !selectedObject && allowWholeImage;
  const hint = selectedObject
    ? 'Selected object: ' + selectedObject.label + '. This instruction will target that object.'
    : wholeImage
      ? 'No object selected — the instruction will apply to the entire image.'
      : 'Select an object on the image to use this tool.';

  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5" aria-label="Describe your edit">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Describe an edit</p>
        <h2 className="mt-1 text-lg font-semibold">What would you like to change?</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground" role="status">{hint}</p>
      </div>
      <label htmlFor="edit-instruction" className="block text-xs font-medium text-foreground">Your instruction</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="edit-instruction"
          value={instruction}
          onChange={(event) => onInstructionChange(event.target.value)}
          placeholder={selectedObject ? 'e.g. "make the ' + selectedObject.label + ' red"' : wholeImage ? 'e.g. "make the whole image warmer"' : 'Select an object first…'}
          disabled={!canEdit || applying}
          className="h-12 flex-1 rounded-xl"
          onKeyDown={(event) => event.key === 'Enter' && canEdit && !applying && instruction.trim() && onApply()}
        />
        <Button
          type="button"
          onClick={onApply}
          disabled={!canEdit || !instruction.trim() || applying}
          className="min-h-12 shrink-0 rounded-xl px-5"
          aria-label="Preview edit"
        >
          {applying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Wand2 className="h-4 w-4" aria-hidden="true" />}
          {applying ? 'Preparing preview…' : 'Preview edit'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Your image is not changed until you review the preview and choose Accept.</p>
    </section>
  );
}
