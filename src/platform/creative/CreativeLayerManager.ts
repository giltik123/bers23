import type { CreativeCanvas, CreativeLayer, CreativeLayerType } from './CreativeTypes';
import { immutableCreativeSnapshot } from './CreativeSnapshot';

export class CreativeLayerManager {
  private sequence = 0;

  createLayer(input: { id?: string; type: CreativeLayerType; name: string; visible?: boolean; opacity?: number; order?: number; locked?: boolean; metadata?: Record<string, unknown> }): CreativeLayer {
    return Object.freeze({
      id: input.id || `creative-layer-${++this.sequence}`,
      type: input.type,
      name: input.name,
      visible: input.visible ?? true,
      opacity: input.opacity ?? 1,
      order: input.order ?? 0,
      locked: input.locked ?? false,
      metadata: immutableCreativeSnapshot(input.metadata || {}),
    });
  }

  addLayer(canvas: CreativeCanvas, input: Parameters<CreativeLayerManager['createLayer']>[0]): { canvas: CreativeCanvas; layer: CreativeLayer } {
    const layer = this.createLayer({ ...input, order: input.order ?? canvas.layers.length });
    const layers = Object.freeze([...canvas.layers, layer].sort((left, right) => left.order - right.order));
    return { canvas: Object.freeze({ ...canvas, layers, selectedLayerId: layer.id, status: 'EDITING' }), layer };
  }

  removeLayer(canvas: CreativeCanvas, layerId: string): CreativeCanvas {
    const layer = canvas.layers.find((candidate) => candidate.id === layerId);
    if (!layer) throw new Error('Layer not found');
    if (layer.locked) throw new Error('Layer is locked');
    const layers = Object.freeze(canvas.layers.filter((candidate) => candidate.id !== layerId).map((candidate, order) => Object.freeze({ ...candidate, order })));
    return Object.freeze({ ...canvas, layers, selectedLayerId: canvas.selectedLayerId === layerId ? null : canvas.selectedLayerId, masks: Object.freeze(canvas.masks.filter((mask) => mask.layerId !== layerId)), adjustments: Object.freeze(canvas.adjustments.filter((adjustment) => adjustment.targetLayer !== layerId)), status: 'EDITING' });
  }

  reorderLayer(canvas: CreativeCanvas, layerId: string, order: number): CreativeCanvas {
    if (!canvas.layers.some((layer) => layer.id === layerId)) throw new Error('Layer not found');
    const targetOrder = Math.max(0, Math.min(order, canvas.layers.length - 1));
    const withoutLayer = canvas.layers.filter((layer) => layer.id !== layerId);
    const targetLayer = canvas.layers.find((layer) => layer.id === layerId)!;
    withoutLayer.splice(targetOrder, 0, targetLayer);
    const layers = Object.freeze(withoutLayer.map((layer, index) => Object.freeze({ ...layer, order: index })));
    return Object.freeze({ ...canvas, layers, status: 'EDITING' });
  }
}
