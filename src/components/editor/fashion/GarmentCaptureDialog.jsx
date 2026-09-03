import React, { useEffect, useMemo, useState } from 'react';
import { Camera, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const VIEW_KINDS = Object.freeze([
  ['FRONT', 'Front'],
  ['BACK', 'Back'],
  ['LEFT', 'Left side'],
  ['RIGHT', 'Right side'],
  ['DETAIL', 'Detail'],
]);

function requestLabel(request) {
  if (request.reason === 'LOW_RESOLUTION_CARDINAL_VIEW') return `${request.viewKind}: replace with a higher-resolution image`;
  return `${request.viewKind}: missing`;
}

export default function GarmentCaptureDialog({ open, item, onClose, onAppend }) {
  const requestedKind = item?.captureAssessment?.nextCaptureRequests?.[0]?.viewKind || 'DETAIL';
  const [viewKind, setViewKind] = useState(requestedKind);
  const [image, setImage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const previewUrl = useMemo(() => image ? URL.createObjectURL(image) : '', [image]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  useEffect(() => {
    if (!open) return;
    setViewKind(requestedKind);
    setImage(null);
    setError('');
  }, [open, item?.id, item?.revision, requestedKind]);

  const resetAndClose = () => {
    setImage(null);
    setError('');
    onClose();
  };

  const close = () => {
    if (saving) return;
    resetAndClose();
  };

  const append = async () => {
    if (!item || !image || !viewKind || typeof onAppend !== 'function') return;
    setSaving(true);
    setError('');
    try {
      await onAppend(item, { viewKind, image });
      resetAndClose();
    } catch (cause) {
      setError(cause?.message || 'The view could not be appended. The wardrobe was refreshed; check the latest capture state before retrying.');
    } finally {
      setSaving(false);
    }
  };

  const requests = item?.captureAssessment?.nextCaptureRequests || [];

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4" /> Add garment view
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">{item?.name || 'Garment'}</p>
            <p className="text-xs text-muted-foreground">
              Capture evidence is server-owned. Additional views are immutable and revision-bound.
            </p>
          </div>

          {requests.length > 0 ? (
            <div className="rounded-lg bg-secondary/50 p-2 text-xs">
              <p className="font-medium mb-1">Recommended next captures</p>
              <ul className="space-y-0.5 text-muted-foreground">
                {requests.map((request) => <li key={`${request.viewKind}:${request.reason}`}>{requestLabel(request)}</li>)}
              </ul>
            </div>
          ) : (
            <p className="rounded-lg bg-secondary/50 p-2 text-xs text-muted-foreground">
              Cardinal capture requirements are satisfied. You can still add a detail or replacement view.
            </p>
          )}

          <label className="block space-y-1 text-xs">
            <span className="font-medium">View</span>
            <select
              className="h-9 w-full rounded-md border border-input bg-transparent px-2"
              value={viewKind}
              onChange={(event) => setViewKind(event.target.value)}
              disabled={saving}
            >
              {VIEW_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          <label className="block cursor-pointer rounded-xl border border-dashed border-border p-3 text-center">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={saving}
              onChange={(event) => { setImage(event.target.files?.[0] ?? null); setError(''); }}
            />
            {previewUrl ? (
              <img src={previewUrl} alt="Local capture preview" className="mx-auto max-h-56 rounded-lg object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                <Upload className="h-5 w-5" />
                Choose PNG, JPEG or WebP
              </div>
            )}
          </label>

          {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={saving}>Cancel</Button>
          <Button onClick={append} disabled={!image || saving}>
            {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Append view
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
