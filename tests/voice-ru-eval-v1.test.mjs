import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseVoiceRecognitionRoute } from '../src/application/voice/VoiceCapabilityRouter.js';
import { buildVoiceIntentDraft } from '../src/application/voice/VoiceIntentDraftV1.js';
import { filterCanonicalWardrobeVoice } from '../src/application/voice/filterCanonicalWardrobeVoice.js';
import { normalizeRussianFashionVoice } from '../src/application/voice/normalizeRussianFashionVoice.js';

const localPack={admission:'VERIFIED',installed:true,onDevice:true,
  locales:['ru-RU'],modelId:'verified-gigaam',modelVersion:'signed-v1',
  createSession:()=>null};
test('VI-0 capability router prefers admitted RU local pack, then OS, then multilingual',()=>{
  const preferred=chooseVoiceRecognitionRoute({
    localRussianPack:localPack,osOnDeviceAvailable:true,
  });
  assert.equal(preferred.tier,'BERS_LOCAL_RUSSIAN');
  assert.equal(chooseVoiceRecognitionRoute({osOnDeviceAvailable:true}).tier,'OS_ON_DEVICE');
  assert.equal(chooseVoiceRecognitionRoute({
    localMultilingualPack:{...localPack,modelId:'whisper-local'},
  }).tier,'BERS_LOCAL_MULTILINGUAL');
  assert.equal(chooseVoiceRecognitionRoute({
    localRussianPack:{...localPack,admission:'CANDIDATE'},
  }).tier,'BLOCKED');
});
test('VI-0 LOCAL_ONLY never silently routes to paid cloud ASR',()=>{
  for(const input of [
    {remoteConfigured:true,remoteConsent:true},
    {remoteConfigured:true,remoteConsent:false},
    {localRussianPack:{...localPack,installed:false}},
  ]) assert.equal(chooseVoiceRecognitionRoute(input).tier,'BLOCKED');
  assert.equal(chooseVoiceRecognitionRoute({
    privacy:'REMOTE_EXPLICIT',remoteConfigured:true,remoteConsent:true,
  }).tier,'REMOTE_EXPLICIT');
  assert.equal(chooseVoiceRecognitionRoute({
    privacy:'REMOTE_EXPLICIT',remoteConfigured:true,remoteConsent:false,
  }).tier,'BLOCKED');
});
test('VI-3 matching Russian names uses canonical ID and common fashion inflections',()=>{
  const clothing=[
    {id:'garment-1',name:'Чёрная кожаная куртка',category:'outerwear',
      material:'кожа',tags:['oversize'],favorite:false},
    {id:'garment-2',name:'Blue Denim Jeans',category:'jeans',tags:['denim'],favorite:true},
    {id:'garment-3',name:'Чёрные ботинки',category:'shoes',tags:[],favorite:false},
  ];
  const q=normalizeRussianFashionVoice('найди чёрную куртку');
  const result=filterCanonicalWardrobeVoice(clothing,{query:q.originalQuery,hints:q});
  assert.deepEqual(result.map(g=>g.id),['garment-1']);
  const blue=normalizeRussianFashionVoice('синие джинсы');
  assert.deepEqual(filterCanonicalWardrobeVoice(clothing,{
    query:blue.originalQuery,hints:blue,
  }).map(x=>x.id),['garment-2']);
  assert.deepEqual(filterCanonicalWardrobeVoice(clothing,{
    query:'избранное',hints:null,
  }).map(x=>x.id),['garment-2']);
  const absent=normalizeRussianFashionVoice('бежевое платье');
  assert.deepEqual(filterCanonicalWardrobeVoice(clothing,{
    query:absent.originalQuery,hints:absent,
  }),[]);
});
test('VI-5 fixed RU semantic command corpus catches class and parameter drift',()=>{
  const cases=[
    ['отмени','HISTORY_UNDO'],
    ['повтори','HISTORY_REDO'],
    ['верни оригинал','HISTORY_RESTORE'],
    ['открой Creative Studio','NAVIGATE'],
    ['открой гардероб','NAVIGATE'],
    ['найди джинсы','WARDROBE_QUERY'],
    ['примерь чёрную куртку','TRYON_SELECT_PROPOSAL'],
    ['поверни на девяносто вправо','TRANSFORM'],
    ['поверни на 90','AMBIGUOUS'],
    ['сделай 1024 на 1024','RESIZE'],
    ['Запиши в промпт: мягкий свет','PROMPT_REPLACE'],
    ['Нет, я сказала: тёмно-синюю, не чёрную','PROMPT_REPLACE'],
    ['запусти примерку','REQUIRES_CANONICAL_CONTEXT'],
    ['прими результат','ACTION_NEEDS_UI'],
  ];
  let passed=0;
  for(const [utterance,expected]of cases){
    const draft=buildVoiceIntentDraft(utterance);
    assert.equal(draft.kind,expected,utterance);
    passed++;
  }
  assert.equal(passed,cases.length);
  const correction=buildVoiceIntentDraft('Нет, я сказала: тёмно-синюю, не чёрную');
  assert.equal(correction.proposedText,'тёмно-синюю, не чёрную');
});
// ASR WER, real microphone/noise and model-pack signatures require a licensed
// recording corpus and device results; these deterministic cases do not claim
// ASR or real-device acceptance.
