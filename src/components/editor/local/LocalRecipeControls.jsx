import React from 'react';
import { Download, FileJson2, FolderOpen, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function LocalRecipeControls({
  saving, restoring, onSave, onChooseFile, fileInputRef, notice,
}) {
  return (
    <section aria-label="Save and restore local editing session" className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <FileJson2 className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Continue editing later</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Save a small JSON recipe with your adjustments, sampled brush strokes, gradient and vector annotations. No photo pixels, account details or links are stored.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="min-h-11 rounded-xl" onClick={onSave} disabled={saving || restoring}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
          {saving ? 'Saving recipe…' : 'Save edit recipe'}
        </Button>
        <Button type="button" variant="outline" className="min-h-11 rounded-xl" onClick={() => fileInputRef.current?.click()} disabled={saving || restoring}>
          {restoring ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FolderOpen className="h-4 w-4" aria-hidden="true" />}
          {restoring ? 'Restoring recipe…' : 'Restore edit recipe'}
        </Button>
        <input
          type="file" accept=".json,application/json" className="sr-only" tabIndex={-1}
          ref={fileInputRef} onChange={onChooseFile}
          aria-label="Choose BERS local recipe JSON"
        />
      </div>
      <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        To restore edits, first open the exact original photo. The app checks its full-resolution pixel fingerprint. JSON recipes never upload anything to Core or turn into cloud projects automatically.
      </p>
      {notice && <p role="status" className="text-sm text-foreground">{notice}</p>}
    </section>
  );
}
