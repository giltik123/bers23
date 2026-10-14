import React from 'react';
import { Undo2, Redo2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function HistoryControls({ canUndo, canRedo, onUndo, onRedo, onRestore, disabled }) {
  const confirmRestore = () => {
    if (window.confirm('Restore the original image? You can undo this change from History.')) onRestore();
  };

  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Edit history">
      <Button type="button" variant="ghost" size="sm" onClick={onUndo} disabled={disabled || !canUndo} aria-label="Undo" className="min-h-10 rounded-xl px-3">
        <Undo2 className="h-4 w-4" aria-hidden="true" />
        Undo
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onRedo} disabled={disabled || !canRedo} aria-label="Redo" className="min-h-10 rounded-xl px-3">
        <Redo2 className="h-4 w-4" aria-hidden="true" />
        Redo
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={confirmRestore} disabled={disabled || !canUndo} aria-label="Restore original" className="min-h-10 rounded-xl px-3 text-muted-foreground">
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Reset
      </Button>
    </div>
  );
}
