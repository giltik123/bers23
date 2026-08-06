import type { CreativePreset, EditOperation } from './types';

const operation = (type: EditOperation['type'], mode: EditOperation['mode'], label: string, credits = 0, reason = 'Preset operation'): EditOperation => ({ type, mode, label, credits, reason });

export class CreativePresetEngine {
  list(): CreativePreset[] {
    return [
      { name: 'Luxury Brand', operations: [operation('color', 'LOCAL', 'Color correction'), operation('lighting', 'LOCAL', 'Lighting improvement'), operation('background_improvement', 'AI', 'Background improvement', 10)], costEstimate: 10 },
      { name: 'Instagram', operations: [operation('brightness', 'LOCAL', 'Brightness'), operation('contrast', 'LOCAL', 'Contrast'), operation('color', 'LOCAL', 'Color correction')], costEstimate: 0 },
      { name: 'Studio Portrait', operations: [operation('lighting', 'LOCAL', 'Lighting improvement'), operation('portrait_retouch', 'LOCAL', 'Portrait retouch')], costEstimate: 0 },
      { name: 'Cinema', operations: [operation('color', 'LOCAL', 'Color correction'), operation('style_transformation', 'AI', 'Style transformation', 10)], costEstimate: 10 },
      { name: 'Product Catalog', operations: [operation('brightness', 'LOCAL', 'Brightness'), operation('sharpness', 'LOCAL', 'Sharpness'), operation('color', 'LOCAL', 'Color correction')], costEstimate: 0 },
    ];
  }

  find(name: string): CreativePreset | undefined {
    return this.list().find((preset) => preset.name.toLowerCase() === name.toLowerCase());
  }
}
