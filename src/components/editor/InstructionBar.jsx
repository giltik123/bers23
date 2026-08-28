import React from 'react';
import { Wand2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function InstructionBar({ selectedObject, instruction, onInstructionChange, onApply, applying, allowWholeImage = false }) {
  const canEdit = Boolean(selectedObject || allowWholeImage);
  const wholeImage = !selectedObject && allowWholeImage;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3 space-y-2">
      <p className="text-xs text-muted-foreground px-1">
        {selectedObject
          ? <>Editing: <span className="text-foreground font-medium">{selectedObject.label}</span> — only this object will change</>
          : wholeImage
            ? 'Editing the whole image'
            : 'Tap an object on the photo to select it'}
      </p>
      <div className="flex gap-2">
        <Input
          value={instruction}
          onChange={(e) => onInstructionChange(e.target.value)}
          placeholder={selectedObject ? `e.g. "make the ${selectedObject.label} red"` : wholeImage ? 'e.g. "make the whole image warmer"' : 'Select an object first…'}
          disabled={!canEdit || applying}
          className="rounded-xl h-11"
          onKeyDown={(e) => e.key === 'Enter' && canEdit && !applying && instruction.trim() && onApply()}
        />
        <Button
          onClick={onApply}
          disabled={!canEdit || !instruction.trim() || applying}
          className="rounded-xl h-11 px-4 shrink-0"
        >
          {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          <span className="ml-2 hidden sm:inline">Apply</span>
        </Button>
      </div>
    </div>
  );
}