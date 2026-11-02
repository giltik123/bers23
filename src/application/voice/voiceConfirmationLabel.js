const KEYS = Object.freeze({
  PROMPT_REPLACE: 'voiceUi.confirmPrompt',
  PROMPT_APPEND: 'voiceUi.confirmAppend',
  PROMPT_CLEAR: 'voiceUi.confirmClear',
  NAVIGATE: 'voiceUi.confirmNavigate',
  NAVIGATE_PROMPT: 'voiceUi.confirmPromptOpen',
  WARDROBE_QUERY: 'voiceUi.confirmWardrobe',
  TRYON_SELECT_PROPOSAL: 'voiceUi.confirmTryOn',
  AGENT_PROPOSAL: 'voiceUi.confirmAgent',
  HISTORY_UNDO: 'voiceUi.confirmUndo',
  HISTORY_REDO: 'voiceUi.confirmRedo',
  HISTORY_RESTORE: 'voiceUi.confirmRestore',
  TRANSFORM: 'voiceUi.confirmTransform',
  RESIZE: 'voiceUi.confirmResize',
});

export function getVoiceConfirmationKey(kind) {
  return typeof kind === 'string' && Object.hasOwn(KEYS, kind)
    ? KEYS[kind]
    : 'voiceUi.confirmAction';
}
