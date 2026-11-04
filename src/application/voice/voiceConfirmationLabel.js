const KEYS = Object.freeze({
  PROMPT_REPLACE: 'voice.confirmations.promptReplace',
  PROMPT_APPEND: 'voice.confirmations.promptAppend',
  PROMPT_CLEAR: 'voice.confirmations.promptClear',
  NAVIGATE_PROMPT: 'voice.confirmations.navigatePrompt',
  NAVIGATE: 'voice.confirmations.navigate',
  HISTORY_UNDO: 'voice.confirmations.historyUndo',
  HISTORY_REDO: 'voice.confirmations.historyRedo',
  HISTORY_RESTORE: 'voice.confirmations.historyRestore',
  TRANSFORM: 'voice.confirmations.transform',
  RESIZE: 'voice.confirmations.resize',
  WARDROBE_QUERY: 'voice.confirmations.wardrobeQuery',
  TRYON_SELECT_PROPOSAL: 'voice.confirmations.tryOnSelectProposal',
  AGENT_PROPOSAL: 'voice.confirmations.agentProposal',
});

export function getVoiceConfirmationKey(kind) {
  return typeof kind === 'string' && Object.hasOwn(KEYS, kind)
    ? KEYS[kind]
    : 'voice.confirm';
}
