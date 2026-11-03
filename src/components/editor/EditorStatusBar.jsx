import React from 'react';
import { Layers, MousePointer, Scan, Shapes, Database } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

// Compact status strip: object/selection counters, selection mode,
// mask coverage, segmentation status and cache status.
export default function EditorStatusBar({ objectCount, selectionCount, selectionMode, maskedCount, segmentationStatus, cacheStatus }) {
  const { t } = useTranslation();
  const selectionModes = {
    single: t('editor.statusBar.selectionModes.single'),
  };
  const segmentationStates = {
    completed: t('editor.statusBar.segmentationStates.completed'),
    idle: t('editor.statusBar.segmentationStates.idle'),
  };
  const cacheStates = {
    empty: t('editor.statusBar.cacheStates.empty'),
  };
  const knownLabel = (labels, value) => labels[value] || String(value ?? '');

  const items = [
    { icon: Shapes, label: t('editor.statusBar.objects', { count: objectCount }) },
    { icon: MousePointer, label: t('editor.statusBar.selection', { count: selectionCount, mode: knownLabel(selectionModes, selectionMode) }) },
    { icon: Layers, label: t('editor.statusBar.masks', { count: maskedCount, total: objectCount }) },
    { icon: Scan, label: t('editor.statusBar.segmentation', { status: knownLabel(segmentationStates, segmentationStatus) }) },
    { icon: Database, label: t('editor.statusBar.cache', { status: knownLabel(cacheStates, cacheStatus) }) },
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground"
      role="status" aria-live="polite" aria-label={t('editor.statusBar.region')}>
      {items.map(({ icon: Icon, label }, index) => (
        <span key={index} className="flex items-center gap-1">
          <Icon className="w-3 h-3" aria-hidden="true" /> {label}
        </span>
      ))}
    </div>
  );
}
