/**
 * Deterministic browser-only vector annotations. No remote requests or AI.
 * Coordinates and stroke/text sizes are relative to the source canvas so
 * exactly the same recipe can render on small previews and original PNGs.
 * Annotations remain separate from RGBA until the user explicitly exports.
 */
export const LOCAL_ANNOTATION_TOOLS = Object.freeze([
  { id: 'off', label: 'Inspect' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'text', label: 'Text' },
]);

export const LOCAL_ANNOTATION_COLORS = Object.freeze([
  { value: '#ef4444', label: 'Red' },
  { value: '#0f766e', label: 'Teal' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#ffffff', label: 'White' },
  { value: '#111827', label: 'Black' },
]);

export const MAX_LOCAL_ANNOTATIONS = 50;
export const MAX_LOCAL_ANNOTATION_TEXT = 120;
const TOOLS = new Set(LOCAL_ANNOTATION_TOOLS.map(tool => tool.id));
const COLORS = new Set(LOCAL_ANNOTATION_COLORS.map(color => color.value));
const DIMENSIONS_LIMIT = 12_000_000;

const finite = value => typeof value === 'number' && Number.isFinite(value);
const close = value => Math.max(0, Math.min(1, value));
const pixel = value => Math.round(value);

function point(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => key !== 'x' && key !== 'y')
      || !finite(value.x) || !finite(value.y)
      || value.x < 0 || value.x > 1 || value.y < 0 || value.y > 1) {
    throw new Error('Invalid local annotation point');
  }
  return Object.freeze({ x: value.x, y: value.y });
}

function dimension(value, min, max, name) {
  if (!finite(value) || value < min || value > max) throw new Error('Invalid local annotation ' + name);
  return value;
}

export function normalizeLocalAnnotations(input = []) {
  if (!Array.isArray(input) || input.length > MAX_LOCAL_ANNOTATIONS) {
    throw new Error('Too many local annotations (maximum 50)');
  }
  return Object.freeze(input.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid local annotation ' + index);
    if (Object.keys(item).some(key => !['type', 'from', 'to', 'color', 'thickness', 'opacity', 'text', 'fontSize'].includes(key))) {
      throw new Error('Unsupported local annotation property');
    }
    if (!TOOLS.has(item.type) || item.type === 'off') throw new Error('Invalid local annotation type');
    const from = point(item.from);
    const to = point(item.to ?? item.from);
    const color = item.color;
    if (!COLORS.has(color)) throw new Error('Invalid local annotation color');
    const thickness = dimension(item.thickness, .1, 5, 'thickness');
    const opacity = dimension(item.opacity, .01, 1, 'opacity');
    if (item.type !== 'text' && Math.hypot(to.x - from.x, to.y - from.y) < .005) {
      throw new Error('Local annotation shape must have a visible span');
    }
    let text;
    let fontSize;
    if (item.type === 'text') {
      text = item.text;
      fontSize = dimension(item.fontSize, 1, 16, 'font size');
      if (typeof text !== 'string' || text.trim().length === 0 || text.length > MAX_LOCAL_ANNOTATION_TEXT
          || /[\u0000-\u001F\u007F]/u.test(text)) {
        throw new Error('Invalid local annotation text (1–120 printable characters)');
      }
    } else if (item.text !== undefined || item.fontSize !== undefined) {
      throw new Error('Text options are only valid for a text annotation');
    }
    return Object.freeze({
      type: item.type, from, to, color, thickness, opacity,
      ...(item.type === 'text' ? { text, fontSize } : {}),
    });
  }));
}

function assertSize(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
      || width < 1 || height < 1 || width * height > DIMENSIONS_LIMIT) {
    throw new Error('Invalid local annotation raster size');
  }
}

function renderOne(ctx, width, height, item) {
  const x1 = item.from.x * width, y1 = item.from.y * height;
  const x2 = item.to.x * width, y2 = item.to.y * height;
  const shortSide = Math.min(width, height);
  const strokeWidth = Math.max(.8, shortSide * item.thickness / 100);
  ctx.save();
  try {
    ctx.globalAlpha = item.opacity;
    ctx.strokeStyle = item.color;
    ctx.fillStyle = item.color;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (item.type === 'text') {
      const size = Math.max(1, shortSide * item.fontSize / 100);
      ctx.font = '600 ' + size + 'px sans-serif';
      ctx.textBaseline = 'top';
      // Stroked letters remain readable over complex imagery. Font size and
      // outline scale together on original-resolution PNG export.
      ctx.strokeStyle = item.color === '#ffffff' ? '#111827' : '#ffffff';
      ctx.lineWidth = Math.max(.6, size * .12);
      ctx.strokeText(item.text, x1, y1, width - x1);
      ctx.fillStyle = item.color;
      ctx.fillText(item.text, x1, y1, width - x1);
      return;
    }

    ctx.beginPath();
    if (item.type === 'rectangle') {
      ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    } else if (item.type === 'ellipse') {
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      ctx.ellipse(cx, cy, Math.max(.01, Math.abs(x2 - x1) / 2), Math.max(.01, Math.abs(y2 - y1) / 2), 0, 0, Math.PI * 2);
    } else if (item.type === 'arrow') {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    if (item.type === 'arrow') {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const length = Math.max(strokeWidth * 4, shortSide * .022);
      const head = Math.min(length, Math.hypot(x2 - x1, y2 - y1) * .45);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    }
  } finally {
    ctx.restore();
  }
}

export function renderLocalAnnotations(ctx, width, height, input = []) {
  assertSize(width, height);
  if (!ctx || typeof ctx.save !== 'function' || typeof ctx.restore !== 'function' || typeof ctx.beginPath !== 'function') {
    throw new Error('Local annotation canvas context unavailable');
  }
  const items = normalizeLocalAnnotations(input);
  for (const item of items) renderOne(ctx, width, height, item);
  return items.length;
}

/**
 * Keyboard-friendly centered annotation: no pointer gesture needed.
 * Uses the same validated normalized model as drag gestures.
 */
export function centeredLocalAnnotation(type, options) {
  if (!TOOLS.has(type) || type === 'off') throw new Error('Invalid local annotation tool');
  const base = {
    type, from: { x: .24, y: .24 }, to: { x: .76, y: .76 },
    color: options.color, thickness: options.thickness, opacity: options.opacity,
  };
  if (type === 'arrow') { base.from = { x: .22, y: .50 }; base.to = { x: .78, y: .50 }; }
  if (type === 'text') {
    base.from = { x: .26, y: .44 };
    base.to = base.from;
    base.text = options.text;
    base.fontSize = options.fontSize;
  }
  return normalizeLocalAnnotations([base])[0];
}


/**
 * Edit vector objects without rasterizing them. Shifts both end-points by the
 * same bounded offset; movement is clamped against the entire object's
 * bounding box, retaining size and shape instead of squeezing at the edges.
 */
export function moveLocalAnnotation(item, dx, dy) {
  const original = normalizeLocalAnnotations([item])[0];
  if (!finite(dx) || !finite(dy) || Math.abs(dx) > 1 || Math.abs(dy) > 1) {
    throw new Error('Invalid local annotation movement');
  }
  const lowX = Math.min(original.from.x, original.to.x);
  const highX = Math.max(original.from.x, original.to.x);
  const lowY = Math.min(original.from.y, original.to.y);
  const highY = Math.max(original.from.y, original.to.y);
  const deltaX = Math.max(-lowX, Math.min(1 - highX, dx));
  const deltaY = Math.max(-lowY, Math.min(1 - highY, dy));
  return normalizeLocalAnnotations([{
    ...original,
    from: { x: original.from.x + deltaX, y: original.from.y + deltaY },
    to: { x: original.to.x + deltaX, y: original.to.y + deltaY },
  }])[0];
}

export function editLocalAnnotation(item, patch = {}) {
  const original = normalizeLocalAnnotations([item])[0];
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)
      || Object.keys(patch).some(key => !['color', 'thickness', 'opacity', 'text', 'fontSize'].includes(key))) {
    throw new Error('Invalid local annotation edit');
  }
  if (original.type !== 'text' && ('text' in patch || 'fontSize' in patch)) {
    throw new Error('Text properties require a text annotation');
  }
  return normalizeLocalAnnotations([{ ...original, ...patch }])[0];
}
