/**
 * Bounded, browser-pure local undo history commit helper.
 *
 * Each physical slider or text-edit gesture gets a unique group ID. The first
 * change appends one undo state; later changes of THAT gesture replace only its
 * last state. Unrelated changes, selection changes and imported recipes append
 * new states. No pixels, network, localStorage or Core authority.
 */
export function commitGroupedLocalHistory(state, action, next, appended) {
  if (!state || !Array.isArray(state.entries) || !Number.isInteger(state.index)
      || state.index < 0 || state.index >= state.entries.length
      || !Array.isArray(appended) || !appended.length || appended.length > 40) {
    throw new Error('Invalid local history state');
  }
  const group = typeof action?.groupId === 'string' && action.groupId.length <= 80 && action.groupId
    ? action.groupId : null;
  const canReplace = group !== null
    && state.activeGroup === group
    && state.index === state.entries.length - 1
    && state.index >= 1;
  if (canReplace) {
    const previous = state.entries[state.index - 1];
    if (JSON.stringify(next) === JSON.stringify(previous)) {
      // Gesture moved back to its original setting: leave no fake undo step.
      return { entries: state.entries.slice(0, -1), index: state.index - 1, activeGroup: null };
    }
    const entries = [...state.entries.slice(0, -1), next];
    return { entries, index: state.index, activeGroup: group };
  }
  return { entries: appended, index: appended.length - 1, activeGroup: group };
}
