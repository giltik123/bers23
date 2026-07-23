// SelectionManager — pure selection-state operations with history.
// State: { ids: string[], mode: 'single'|'multiple', history: string[][] }

export function createSelection(mode = 'single') {
  return { ids: [], mode, history: [] };
}

function push(state, ids) {
  return { ...state, ids, history: [...state.history, state.ids].slice(-20) };
}

export function selectSingle(state, id) {
  return push(state, [id]);
}

export function toggleSelection(state, id) {
  const ids = state.ids.includes(id)
    ? state.ids.filter((i) => i !== id)
    : state.mode === 'single' ? [id] : [...state.ids, id];
  return push(state, ids);
}

export function selectAll(state, objects) {
  return push({ ...state, mode: 'multiple' }, objects.filter((o) => o.editable !== false).map((o) => o.id));
}

export function clearSelection(state) {
  return push(state, []);
}

export function undoSelection(state) {
  if (!state.history.length) return state;
  return {
    ...state,
    ids: state.history[state.history.length - 1],
    history: state.history.slice(0, -1),
  };
}

export function setSelectionMode(state, mode) {
  return { ...state, mode, ids: mode === 'single' ? state.ids.slice(0, 1) : state.ids };
}

// Drops ids that no longer exist or aren't editable.
export function validateSelection(state, objects) {
  const valid = new Set(objects.filter((o) => o.editable !== false).map((o) => o.id));
  const ids = state.ids.filter((id) => valid.has(id));
  return ids.length === state.ids.length ? state : { ...state, ids };
}