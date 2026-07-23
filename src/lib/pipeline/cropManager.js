// CropManager — computes safe, object-centered crops with padding and expansion margins.
// Works on normalized 0-1 boxes from the Object Model; supports multiple selected objects.
const DEFAULT_PADDING = 0.08;      // 8% of the box on each side
const EXPANSION_MARGIN = 0.04;     // extra context for the AI provider

class CropManager {
  // objects: [{ box: {x,y,w,h} }] — returns one crop covering all of them, clamped to the image.
  cropFor(objects, { padding = DEFAULT_PADDING, expansion = EXPANSION_MARGIN } = {}) {
    const boxes = (objects || []).map((o) => o.box).filter(Boolean);
    if (!boxes.length) return { x: 0, y: 0, w: 1, h: 1, full: true };

    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (const b of boxes) {
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
    }

    const pad = padding + expansion;
    const padX = (maxX - minX) * pad, padY = (maxY - minY) * pad;
    const x = Math.max(0, minX - padX);
    const y = Math.max(0, minY - padY);
    return {
      x, y,
      w: Math.min(1 - x, maxX - minX + padX * 2),
      h: Math.min(1 - y, maxY - minY + padY * 2),
      full: false,
    };
  }

  toPixels(crop, width, height) {
    return {
      x: Math.round(crop.x * width), y: Math.round(crop.y * height),
      w: Math.round(crop.w * width), h: Math.round(crop.h * height),
    };
  }
}

export const cropManager = new CropManager();