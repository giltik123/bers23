import React from 'react';
import { Layers, MousePointer, Scan, Shapes, Database } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

// Read-only status of the current Editor selection; never grants mask authority.
export default function EditorStatusBar({ objectCount, selectionCount, selectionMode, maskedCount, segmentationStatus, cacheStatus }) {
  const { t } = useTranslation();
  const mode = selectionMode === 'single' ? t('editorStatusUi.single') : selectionMode;
  const segmentation = segmentationStatus === 'completed' ? t('editorStatusUi.completed')
    : segmentationStatus === 'idle' ? t('editorStatusUi.idle') : segmentationStatus;
  const cache = cacheStatus === 'empty' ? t('editorStatusUi.empty') : cacheStatus;
  const items = [
    { icon: Shapes, label: t('editorStatusUi.objects', { count: objectCount }) },
    { icon: MousePointer, label: t('editorStatusUi.selected', { count: selectionCount, mode }) },
    { icon: Layers, label: t('editorStatusUi.masks', { masked: maskedCount, total: objectCount }) },
    { icon: Scan, label: t('editorStatusUi.segmentation', { state: segmentation }) },
    { icon: Database, label: t('editorStatusUi.cache', { state: cache }) },
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground" aria-label={t('editorStatusUi.selectionStatus')}>
      {items.map(({ icon: Icon, label }) => (
        <span key={label} className="flex items-center gap-1">
          <Icon className="w-3 h-3" aria-hidden="true" /> {label}
        </span>
      ))}
    </div>
  );
}
