import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  buildVoiceIntentDraft, applyConfirmedVoiceDraft,
} from '../src/application/voice/VoiceIntentDraftV1.js';
import {
  createLocalVoiceSession,installLocalRussianVoicePack, LocalVoiceUnavailable, LOCAL_VOICE_MAX_MS,
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
  assert.equal(nav.kind,'NAVIGATE');
  assert.equal(nav.params.tab,'prompt');
  assert.throws(()=>applyConfirmedVoiceDraft(nav,'preserve'),
    /VOICE_REQUIRES_EXISTING_EDITOR_CONTROLS/);
});
test('spoken destructive and paid actions never create an executable or Project-accept command',()=>{
  for(const spoken of [
    'прими результат','удали проект','запусти примерку',
    'создай изображение','оплати подписку','сохрани результат',
  ]){
    const draft=buildVoiceIntentDraft(spoken);
    assert.ok(['ACTION_NEEDS_UI','REQUIRES_CANONICAL_CONTEXT'].includes(draft.kind),spoken);
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
test('hard local voice deadline aborts a stalled browser recognizer and drops late transcripts',async()=>{
  const f=fakeRecognizer();
  let deadline,cleared=0,finalCount=0,endCount=0;
  const failures=[];
  const session=await createLocalVoiceSession({
    SpeechRecognitionCtor:f.Recognizer,
    onFinal:()=>finalCount++,onEnd:()=>endCount++,onError:code=>failures.push(code),
    schedule:fn=>{deadline=fn;return 91;},
    unschedule:()=>cleared++,
    maxDurationMs:1000,
  });
  assert.deepEqual(f.activity,['start']);
  deadline();
  assert.deepEqual(f.activity,['start','abort']);
  assert.deepEqual(failures,['LOCAL_ASR_TIMEOUT']);
  assert.equal(cleared,1);
  assert.equal(f.instance().onresult,null);
  assert.equal(endCount,0);
  session.stop();
  deadline();
  assert.deepEqual(f.activity,['start','abort']);
  assert.equal(finalCount,0);
  assert.deepEqual(failures,['LOCAL_ASR_TIMEOUT']);
});

test('user stop still has a hard abort fallback when browser onend never fires',async()=>{
  const f=fakeRecognizer();
  // Simulate an ASR vendor that never dispatches onend after stop().
  f.Recognizer.prototype.stop=function(){f.activity.push('stop');};
  let deadline;
  const failures=[];
  const session=await createLocalVoiceSession({
    SpeechRecognitionCtor:f.Recognizer,onError:code=>failures.push(code),
    schedule:fn=>{deadline=fn;return 92;},unschedule:()=>{},
  });
  session.stop();
  assert.deepEqual(f.activity,['start','stop']);
  deadline();
  assert.deepEqual(f.activity,['start','stop','abort']);
  assert.deepEqual(failures,['LOCAL_ASR_TIMEOUT']);
});

test('OS speech error aborts the mic, drops late callbacks and only reports the failure once',async()=>{
  const f=fakeRecognizer();
  const failures=[];
  let transcriptCount=0,cleared=0;
  const session=await createLocalVoiceSession({
    SpeechRecognitionCtor:f.Recognizer,onError:code=>failures.push(code),
    onFinal:()=>transcriptCount++,
    schedule:()=>42,unschedule:()=>cleared++,
  });
  f.instance().onerror({error:'network'});
  assert.deepEqual(f.activity,['start','abort']);
  assert.equal(f.instance().onresult,null);
  assert.deepEqual(failures,['network']);
  assert.equal(cleared,1);
  session.stop();session.abort();
  assert.deepEqual(f.activity,['start','abort']);
  assert.equal(transcriptCount,0);
});

test('OS speech stop throwing fails closed instead of keeping a recording alive',async()=>{
  const f=fakeRecognizer();
  f.Recognizer.prototype.stop=function(){throw new Error('browser speech stop failed');};
  const errors=[];
  const session=await createLocalVoiceSession({
    SpeechRecognitionCtor:f.Recognizer,onError:code=>errors.push(code),
    schedule:()=>43,unschedule:()=>{},
  });
  assert.doesNotThrow(()=>session.stop());
  assert.deepEqual(f.activity,['start','abort']);
  assert.deepEqual(errors,['LOCAL_ASR_STOP_FAILED']);
  assert.equal(f.instance().onresult,null);
});

test('voice UI is Editor-wide with typed callback; confirmation never triggers generation',async()=>{
  const [bar,ui,editor]=await Promise.all([
    readFile('src/components/editor/InstructionBar.jsx','utf8'),
    readFile('src/components/editor/VoiceInputPanel.jsx','utf8'),
    readFile('src/pages/Editor.jsx','utf8'),
  ]);
  assert.doesNotMatch(bar,/<VoiceInputPanel/);
  assert.match(editor,/<VoiceInputPanel/);
  assert.match(editor,/onVoiceIntent=\{handleVoiceIntent\}/);
  assert.match(editor,/onPromptChange=\{setInstruction\}/);
  assert.match(ui,/applyConfirmedVoiceDraft\(draft,prompt\)/);
  assert.doesNotMatch(ui,/coreClient|applyEdit\(|pushEdit\(|fetch\(|runGenerative|billing/i);
  assert.match(ui,/onClick=\{confirm\}/);
});

test('local model installation only runs after a user action and re-verifies Russian on-device readiness',async()=>{
  let availableCalls=0,installCalls=0;
  class Installable {
    static async available(args){
      assert.deepEqual(args,{langs:['ru-RU'],processLocally:true});
      availableCalls++;
      return installCalls?'available':'downloadable';
    }
    static async install(args){
      assert.deepEqual(args,{langs:['ru-RU'],processLocally:true});
      installCalls++;
      return true;
    }
  }
  // Checking and showing a download button does not install or record.
  await assert.rejects(()=>createLocalVoiceSession({
    SpeechRecognitionCtor:Installable,
  }),error=>error.code==='LOCAL_ASR_PACK_MISSING');
  assert.equal(installCalls,0);
  assert.equal(await installLocalRussianVoicePack({
    SpeechRecognitionCtor:Installable,
  }),true);
  assert.equal(installCalls,1);
  assert.equal(availableCalls,3);
});
test('denied or unverified local speech installation cannot proceed to recording',async()=>{
  class Rejected {
    static async available(){return 'downloadable';}
    static async install(){return false;}
  }
  await assert.rejects(()=>installLocalRussianVoicePack({
    SpeechRecognitionCtor:Rejected,
  }),error=>error.code==='LOCAL_ASR_INSTALL_FAILED');
  class Unverified {
    static async available(){return 'downloadable';}
    static async install(){return true;}
  }
  await assert.rejects(()=>installLocalRussianVoicePack({
    SpeechRecognitionCtor:Unverified,
  }),error=>error.code==='LOCAL_ASR_INSTALL_UNVERIFIED');
  class NoInstall {static async available(){return 'downloadable';}}
  await assert.rejects(()=>installLocalRussianVoicePack({
    SpeechRecognitionCtor:NoInstall,
  }),error=>error.code==='LOCAL_ASR_INSTALL_UNSUPPORTED');
});


test('voice integration preserves canonical Core download, Scene MASK and accept ownership',async()=>{
  const [editor,voicePort,voiceUi]=await Promise.all([
    readFile('src/pages/Editor.jsx','utf8'),
    readFile('src/application/voice/createLocalVoiceSession.js','utf8'),
    readFile('src/components/editor/VoiceInputPanel.jsx','utf8'),
  ]);
  assert.match(editor,/<VoiceInputPanel/);
  assert.match(editor,/onVoiceIntent=\{handleVoiceIntent\}/);
  assert.match(editor,/confirmedSourceArtifactId:confirmedSource\?\.sourceArtifactId/);
  assert.match(editor,/hasPendingResult:Boolean\(pendingResult\)/);
  assert.match(editor,/candidateOperation=\{pendingResult\.kind\}/);
  assert.match(editor,/<AutoSceneMasksPanel/);
  assert.match(editor,/downloadCanonicalImage\(\{/);
  assert.match(voicePort,/processLocally:true/);
  assert.doesNotMatch(voicePort,/globalThis\.webkitSpeechRecognition|new\s+webkitSpeechRecognition|=\s*webkitSpeechRecognition/);
  assert.match(voiceUi,/onClick=\{confirm\}/);
  assert.doesNotMatch(voiceUi,/coreClient|applyEdit\(|pushEdit\(|runGenerative/);
});
