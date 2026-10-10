import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  buildVoiceIntentDraft, applyConfirmedVoiceDraft,
} from '../src/application/voice/VoiceIntentDraftV1.js';
import {
  createLocalVoiceSession, LocalVoiceUnavailable, LOCAL_VOICE_MAX_MS,
} from '../src/application/voice/createLocalVoiceSession.js';

function fakeRecognizer(status='available') {
  let instance;
  const checks=[],activity=[];
  class Recognizer {
    static async available(args){checks.push(args);return status;}
    constructor(){instance=this;this.processLocally=false;}
    start(){assert.equal(this.processLocally,true);activity.push('start');}
    stop(){activity.push('stop');this.onend?.();}
    abort(){activity.push('abort');}
  }
  return {Recognizer,checks,activity,instance:()=>instance};
}
test('VI-0 Russian voice draft is editable, confirmation-only and cannot execute AI',()=>{
  const draft=buildVoiceIntentDraft('Запиши в промпт: сделай свет мягче');
  assert.equal(draft.schemaVersion,1);
  assert.equal(draft.engine,'OS_ON_DEVICE');
  assert.equal(draft.privacy,'LOCAL_ONLY');
  assert.equal(draft.requiresConfirmation,true);
  assert.equal(draft.kind,'PROMPT_REPLACE');
  assert.equal(draft.proposedText,'сделай свет мягче');
  assert.deepEqual(applyConfirmedVoiceDraft(draft,'old'),{navigate:false,prompt:'сделай свет мягче'});
  const append=buildVoiceIntentDraft('Добавь: лицо не менять');
  assert.equal(append.kind,'PROMPT_APPEND');
  assert.equal(applyConfirmedVoiceDraft(append,'Осветли куртку').prompt,
    'Осветли куртку лицо не менять');
  const clear=buildVoiceIntentDraft('Очисти промпт');
  assert.equal(applyConfirmedVoiceDraft(clear,'existing').prompt,'');
  const nav=buildVoiceIntentDraft('открой промпт');
  assert.deepEqual(applyConfirmedVoiceDraft(nav,'preserve'),
    {navigate:true,prompt:'preserve'});
});
test('spoken destructive and paid actions never create an executable or Project-accept command',()=>{
  for(const spoken of [
    'прими результат','удали проект','запусти примерку',
    'отмени','поверни на девяносто градусов','создай изображение',
    'оплати подписку','сохрани результат',
  ]){
    const draft=buildVoiceIntentDraft(spoken);
    assert.equal(draft.kind,'ACTION_NEEDS_UI',spoken);
    assert.throws(()=>applyConfirmedVoiceDraft(draft,'unchanged'),
      /VOICE_REQUIRES_EXISTING_EDITOR_CONTROLS/);
  }
});
test('transcripts are bounded, untrusted and never accepted as execution tokens',()=>{
  assert.throws(()=>buildVoiceIntentDraft(''),/VOICE_INVALID_TRANSCRIPT/);
  assert.throws(()=>buildVoiceIntentDraft('а'.repeat(1025)),/VOICE_INVALID_TRANSCRIPT/);
  assert.throws(()=>buildVoiceIntentDraft('turn on',{engine:'CLOUD'}),/VOICE_UNADMITTED/);
  assert.throws(()=>applyConfirmedVoiceDraft({schemaVersion:1,kind:'PROMPT_CLEAR',engine:'CLOUD',
    privacy:'REMOTE',requiresConfirmation:true,proposedText:''},'original'),/VOICE_DRAFT_NOT_ADMITTED/);
});
test('offline local speech port starts only after explicit on-device RU capability proof',async()=>{
  const {Recognizer,checks,activity,instance}=fakeRecognizer();
  let transcript='',partial='',end=0,scheduled;
  const session=await createLocalVoiceSession({
    SpeechRecognitionCtor:Recognizer,
    onPartial:v=>partial=v,onFinal:v=>transcript=v,onEnd:()=>end++,
    schedule:(fn,delay)=>{scheduled={fn,delay};return 1;},
    unschedule:()=>{},
  });
  assert.deepEqual(checks,[{langs:['ru-RU'],processLocally:true}]);
  assert.deepEqual(activity,['start']);
  assert.equal(instance().processLocally,true);
  assert.equal(instance().lang,'ru-RU');
  assert.equal(scheduled.delay,LOCAL_VOICE_MAX_MS);
  const interim=[{0:{transcript:'сделай свет'},isFinal:false}];
  instance().onresult({results:interim});
  assert.equal(partial,'сделай свет');
  assert.equal(transcript,'');
  instance().onresult({results:[{0:{transcript:'сделай свет мягче'},isFinal:true}]});
  assert.equal(transcript,'сделай свет мягче');
  session.stop();
  assert.equal(end,1);
  assert.deepEqual(activity,['start','stop']);
});
test('missing/restricted local Russian model fails closed without microphone start or remote fallback',async()=>{
  for(const status of ['downloadable','downloading','unavailable']){
    const f=fakeRecognizer(status);
    await assert.rejects(()=>createLocalVoiceSession({
      SpeechRecognitionCtor:f.Recognizer,
    }),e=>e instanceof LocalVoiceUnavailable &&
      /LOCAL_ASR_PACK_MISSING|LOCAL_ASR_UNAVAILABLE/.test(e.code));
    assert.deepEqual(f.activity,[]);
    assert.equal(f.instance(),undefined);
  }
  await assert.rejects(()=>createLocalVoiceSession({
    SpeechRecognitionCtor:class Unverified{},
  }),e=>e.code==='LOCAL_ASR_UNSUPPORTED');
  class Unknown {
    static async available(){return 'available';}
    start(){throw Error('must not start');}
  }
  await assert.rejects(()=>createLocalVoiceSession({
    SpeechRecognitionCtor:Unknown,
  }),e=>e.code==='LOCAL_ASR_UNVERIFIED');
});
test('abort immediately disables transcript callbacks, cancels mic and clears maximum duration',async()=>{
  const f=fakeRecognizer();
  let calls=0,timerCancelled=0,scheduled;
  const session=await createLocalVoiceSession({
    SpeechRecognitionCtor:f.Recognizer,onFinal:()=>calls++,
    schedule:fn=>{scheduled=fn;return 9;},
    unschedule:()=>timerCancelled++,
  });
  session.abort();
  f.instance().onresult?.({results:[{0:{transcript:'IGNORE'},isFinal:true}]});
  assert.equal(calls,0);
  assert.equal(timerCancelled,1);
  scheduled();
  assert.deepEqual(f.activity,['start','abort']);
});
test('voice UI is attached only to editable prompt; confirmation never triggers generation',async()=>{
  const [bar,ui,editor]=await Promise.all([
    readFile('src/components/editor/InstructionBar.jsx','utf8'),
    readFile('src/components/editor/VoiceInputPanel.jsx','utf8'),
    readFile('src/pages/Editor.jsx','utf8'),
  ]);
  assert.match(bar,/<VoiceInputPanel/);
  assert.match(bar,/onPromptChange=\{onInstructionChange\}/);
  assert.match(editor,/onFocusPrompt=\{\(\) => setEditTab\('prompt'\)\}/);
  assert.match(ui,/applyConfirmedVoiceDraft\(draft,prompt\)/);
  assert.doesNotMatch(ui,/coreClient|applyEdit\(|pushEdit\(|fetch\(|runGenerative|billing/i);
  assert.match(ui,/onClick=\{confirm\}/);
});
