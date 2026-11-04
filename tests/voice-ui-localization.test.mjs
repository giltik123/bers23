import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import englishVoice from '../src/lib/i18n/locales/en/voice.js';
import russian from '../src/lib/i18n/locales/ru/index.js';
import { localizationValidator } from '../src/lib/i18n/LocalizationValidator.js';

test('Voice panel copy has complete RU/EN key and placeholder parity', async () => {
  const parity = localizationValidator.validate(englishVoice, russian.voice);
  assert.deepEqual(parity.missing, []);
  assert.deepEqual(parity.extra, []);
  assert.deepEqual(parity.brokenPlaceholders, []);

  const required = [
    'panel', 'open', 'localPrivacyHint', 'record', 'stop', 'cancel',
    'preparing', 'recording', 'partialTranscript', 'transcriptLabel',
    'transcriptPlaceholder', 'confirmText', 'installing', 'installPack',
    'installSuccess', 'intentConfirmation',
  ];
  for (const key of required) {
    assert.equal(typeof englishVoice[key], 'string', 'English voice.' + key);
    assert.equal(typeof russian.voice[key], 'string', 'Russian voice.' + key);
    assert.ok(englishVoice[key].trim().length > 0, 'English voice.' + key);
    assert.ok(russian.voice[key].trim().length > 0, 'Russian voice.' + key);
  }

  const panel = await readFile('src/components/editor/VoiceInputPanel.jsx', 'utf8');
  assert.match(panel, /useTranslation/);
  assert.match(panel, /const \{ t \} = useTranslation\(\)/);
  assert.doesNotMatch(panel, /[А-Яа-яЁё]/, 'Voice panel presentation must not contain hard-coded Russian copy');
  assert.doesNotMatch(panel, /String\(reason\)|reason\?\.message/, 'raw browser/runtime errors must not be shown');
  assert.match(panel, /createLocalVoiceSession/);
  assert.match(panel, /installLocalRussianVoicePack/);
  assert.match(panel, /sourceKey=JSON\.stringify\(\[projectId,sourceArtifactId\]\)/);
  assert.match(panel, /transcriptSource!==sourceKey/);
  assert.match(panel, /LOCAL_ASR_PACK_MISSING/);
  assert.match(panel, /voice\.localPrivacyHint/);
});
