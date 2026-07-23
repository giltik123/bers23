import React from 'react';
import { Undo2, Redo2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function HistoryControls({ canUndo, canRedo, onUndo, onRedo, onRestore, disabled }) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" onClick={onUndo} disabled={disabled || !canUndo} aria-label="Undo">
        <Undo2 className="w-5 h-5" />
      </Button>
      <Button variant="ghost" size="icon" onClick={onRedo} disabled={disabled || !canRedo} aria-label="Redo">
        <Redo2 className="w-5 h-5" />
      </Button>
      <Button variant="ghost" size="icon" onClick={onRestore} disabled={disabled || !canUndo} aria-label="Restore original">
        <RotateCcw className="w-5 h-5" />
      </Button>
    </div>
  );
}