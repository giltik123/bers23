import { genId } from '@/lib/projectService';

// ObjectManager — pure operations on detected-object lists (project-schema shape:
// id, type, label, confidence, editable, mask_url, box, parent_object, children, metadata).
// Never mutates input arrays; always returns new ones.

export function createObject(data = {}) {
  return {
    id: data.id || genId(),
    type: data.type || 'object',
    label: data.label || 'Object',
    confidence: data.confidence ?? null,
    editable: data.editable ?? true,
    selected: data.selected ?? false,
    mask_url: data.mask_url || null,
    box: data.box || null,
    parent_object: data.parent_object || null,
    children: data.children || [],
    metadata: data.metadata || {},
  };
}

export function addObject(objects, data) {
  return [...objects, createObject(data)];
}

export function updateObject(objects, id, changes) {
  return objects.map((o) => (o.id === id ? { ...o, ...changes } : o));
}

export function deleteObject(objects, id) {
  return objects
    .filter((o) => o.id !== id)
    .map((o) => ({
      ...o,
      children: (o.children || []).filter((c) => c !== id),
      parent_object: o.parent_object === id ? null : o.parent_object,
    }));
}

// Merge several objects into one (union bounding box, combined label).
export function mergeObjects(objects, ids, label) {
  const toMerge = objects.filter((o) => ids.includes(o.id));
  if (toMerge.length < 2) return objects;
  const boxes = toMerge.map((o) => o.box).filter(Boolean);
  const merged = createObject({
    label: label || toMerge.map((o) => o.label).join(' + '),
    confidence: Math.min(...toMerge.map((o) => o.confidence ?? 1)),
    box: boxes.length ? unionBox(boxes) : null,
    metadata: { merged_from: ids },
  });
  return [...objects.filter((o) => !ids.includes(o.id)), merged];
}

// Split an object into named parts (children linked to the parent).
export function splitObject(objects, id, parts = []) {
  const parent = objects.find((o) => o.id === id);
  if (!parent || !parts.length) return objects;
  const children = parts.map((p) => createObject({ ...p, parent_object: id }));
  return [
    ...objects.map((o) => (o.id === id ? { ...o, children: children.map((c) => c.id) } : o)),
    ...children,
  ];
}

// Group objects under a new virtual group object.
export function groupObjects(objects, ids, label = 'Group') {
  const group = createObject({ type: 'group', label, children: ids, editable: false });
  return [
    group,
    ...objects.map((o) => (ids.includes(o.id) ? { ...o, parent_object: group.id } : o)),
  ];
}

export function ungroupObjects(objects, groupId) {
  const group = objects.find((o) => o.id === groupId && o.type === 'group');
  if (!group) return objects;
  return objects
    .filter((o) => o.id !== groupId)
    .map((o) => (o.parent_object === groupId ? { ...o, parent_object: null } : o));
}

export function searchObjects(objects, query) {
  const q = (query || '').toLowerCase().trim();
  if (!q) return objects;
  return objects.filter((o) => (o.label || '').toLowerCase().includes(q));
}

export function filterObjects(objects, criteria = {}) {
  return objects.filter((o) =>
    Object.entries(criteria).every(([key, value]) => o[key] === value)
  );
}

function unionBox(boxes) {
  const x1 = Math.min(...boxes.map((b) => b.x));
  const y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.w));
  const y2 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}