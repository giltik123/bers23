import { deepFreeze } from './immutable';

const patterns = deepFreeze({
  'luxury-portrait': ['load image', 'segmentation', 'soft lighting', 'warm grading', 'skin preservation', 'details', 'upscale', 'export'],
  catalog: ['load image', 'background cleanup', 'color accuracy', 'details', 'export'],
  fashion: ['load image', 'segmentation', 'dramatic lighting', 'contrast', 'skin', 'export'],
  restoration: ['load image', 'damage analysis', 'repair', 'color restoration', 'details', 'export'],
  repair: ['load image', 'defect analysis', 'local repair', 'verification', 'export'],
  background: ['load image', 'segmentation', 'mask cleanup', 'background operation', 'edge verification', 'export'],
  studio: ['load image', 'subject mask', 'key lighting', 'fill lighting', 'white balance', 'export'],
  'try-on': ['load image', 'body segmentation', 'garment alignment', 'virtual try-on', 'fit verification', 'export'],
  product: ['load image', 'background cleanup', 'lighting', 'reflection control', 'color accuracy', 'export'],
  marketing: ['load image', 'composition analysis', 'brand validation', 'visual hierarchy', 'export'],
}) as Readonly<Record<string, readonly string[]>>;

export class ExecutionPatternLibrary {
  names(): readonly string[] { return deepFreeze(Object.keys(patterns).sort()); }
  get(name: string): readonly string[] { return deepFreeze([...(patterns[name.trim().toLowerCase()] ?? [])]); }
  all(): Readonly<Record<string, readonly string[]>> { return patterns; }
}
