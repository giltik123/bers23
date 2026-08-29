export function isOrthogonalTransformStartBlocked({
  editorBusy = false,
  detecting = false,
  committing = false,
  pendingResult = null,
  selection = null,
  cropInteractionActive = false,
  resizeInteractionActive = false,
} = {}, { allowPendingResult = false } = {}) {
  return Boolean(
    editorBusy
    || detecting
    || committing
    || (!allowPendingResult && pendingResult)
    || selection
    || cropInteractionActive
    || resizeInteractionActive
  );
}
