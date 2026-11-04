import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import enVoice from '../src/lib/i18n/locales/en/voice.js';
import ruVoice from '../src/lib/i18n/locales/ru/voice.js';
import { getVoiceConfirmationKey } from '../src/application/voice/voiceConfirmationLabel.js';
import { localizationValidator } from '../src/lib/i18n/LocalizationValidator.js';

test('Voice RU/EN locale keys and interpolation placeholders have exact parity',()=>{
  const result=localizationValidator.validate(enVoice,ruVoice);
  assert.deepEqual(result.missing,[]);
  assert.deepEqual(result.extra,[]);
  assert.deepEqual(result.brokenPlaceholders,[]);
  const en=localizationValidator.flatten(enVoice);
  const ru=localizationValidator.flatten(ruVoice);
  for(const [key,value] of Object.entries(en)){
    assert.equal(typeof value,'string',key);
    assert.ok(value.trim().length>0,key);
    assert.equal(typeof ru[key],'string',key);
    assert.ok(ru[key].trim().length>0,key);
  }
});

test('Voice panel uses the shared locale namespace for all visible and accessible copy',async()=>{
  const [panel,enIndex,ruIndex]=await Promise.all([
    readFile('src/components/editor/VoiceInputPanel.jsx','utf8'),
    readFile('src/lib/i18n/locales/en/index.js','utf8'),
    readFile('src/lib/i18n/locales/ru/index.js','utf8'),
  ]);
  assert.match(enIndex,/import voice from '\.\/voice';/);
  assert.match(enIndex,/brand, assets, voice,/);
  assert.match(ruIndex,/import voice from '\.\/voice\.js';/);
  assert.match(ruIndex,/export const modules = \{\s*voice,/);
  const en=localizationValidator.flatten(enVoice);
  const ru=localizationValidator.flatten(ruVoice);
  const keys=[...panel.matchAll(/['"]voice\.([A-Za-z0-9_.]+)['"]/g)]
    .map(match=>match[1]);
  assert.ok(keys.length>=25,'expected the panel to reference the dedicated Voice catalog');
  for(const key of keys){
    assert.ok(Object.hasOwn(en,key),`missing English voice.${key}`);
    assert.ok(Object.hasOwn(ru,key),`missing Russian voice.${key}`);
  }
  assert.match(panel,/useTranslation/);
  assert.match(panel,/role="group"[^>]*aria-label=\{t\('voice\.regionLabel'\)\}/);
  assert.match(panel,/aria-live="polite"/);
  assert.match(panel,/role="status"/);
  assert.match(panel,/aria-label=\{t\('voice\.partialTranscript'\)\}/);
  assert.match(panel,/aria-live="polite"/);
  assert.match(panel,/aria-atomic="true"/);
  assert.match(panel,/Object\.hasOwn\(ERROR_KEYS,code\)/);
  assert.match(panel,/Object\.hasOwn\(BROWSER_ERROR_KEYS,code\)/);
  assert.doesNotMatch(panel,/[А-Яа-яЁё]/u,'visible Voice copy must not be hard-coded in Russian');
  assert.doesNotMatch(panel,/String\(reason\)|reason\?\.message/,'raw browser errors must not be rendered');
  assert.doesNotMatch(panel,/coreClient|fetch\(|runGenerative|applyEdit\(|pushEdit\(/);
});

test('Voice localization does not change Russian-first LOCAL_ONLY recognition or explicit confirmation',async()=>{
  const [panel,voicePort,draft]=await Promise.all([
    readFile('src/components/editor/VoiceInputPanel.jsx','utf8'),
    readFile('src/application/voice/createLocalVoiceSession.js','utf8'),
    readFile('src/application/voice/VoiceIntentDraftV1.js','utf8'),
  ]);
  assert.match(panel,/createLocalVoiceSession/);
  assert.match(panel,/buildVoiceIntentDraft/);
  assert.match(panel,/applyConfirmedVoiceDraft/);
  assert.match(panel,/onClick=\{confirm\}/);
  assert.match(panel,/transcriptSource!==sourceKey/);
  assert.match(voicePort,/locale='ru-RU'/);
  assert.match(voicePort,/processLocally:true/);
  assert.match(draft,/privacy:'LOCAL_ONLY'/);
  assert.match(draft,/requiresConfirmation:true/);
});

test('Voice confirmation labels describe each supported action in both locales',()=>{
  const expected = {
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
  };
  // The confirmation mapper returns fully qualified TranslationProvider keys.
  const en = localizationValidator.flatten({ voice: enVoice });
  const ru = localizationValidator.flatten({ voice: ruVoice });
  for (const [kind,key] of Object.entries(expected)) {
    assert.equal(getVoiceConfirmationKey(kind),key);
    assert.ok(en[key]?.trim(),`missing English ${key}`);
    assert.ok(ru[key]?.trim(),`missing Russian ${key}`);
  }
  assert.equal(getVoiceConfirmationKey('UNKNOWN_KIND'),'voice.confirm');
});
