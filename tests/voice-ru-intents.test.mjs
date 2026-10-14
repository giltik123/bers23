import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { buildVoiceIntentDraft,applyConfirmedVoiceDraft } from '../src/application/voice/VoiceIntentDraftV1.js';
import { parseRussianVoiceIntent,parseRussianVoiceNumber } from '../src/application/voice/parseRussianVoiceIntent.js';
import { normalizeRussianFashionVoice,resolveFashionVoiceCandidates } from '../src/application/voice/normalizeRussianFashionVoice.js';
import { admitVoiceEditorAction } from '../src/application/voice/admitVoiceEditorAction.js';

const ctx={projectId:'project-1',sourceArtifactId:'signed-image-1',
  confirmedProjectId:'project-1',confirmedSourceArtifactId:'signed-image-1',
  busy:false,selectionActive:false,hasPendingResult:false,
  canUndo:true,canRedo:true};
const cases=[
  ['открой промпт','NAVIGATE',{tab:'prompt'}],
  ['открой Creative Studio','NAVIGATE',{tab:'creative'}],
  ['открой агента','NAVIGATE',{tab:'agent'}],
  ['открой гардероб','NAVIGATE',{tab:'fashion'}],
  ['открой образы','NAVIGATE',{tab:'outfits'}],
  ['открой примерку','NAVIGATE',{tab:'outfits'}],
  ['отмени','HISTORY_UNDO',{}],
  ['повтори','HISTORY_REDO',{}],
  ['верни оригинал','HISTORY_RESTORE',{}],
  ['поверни на девяносто вправо','TRANSFORM',{mode:'ROTATE_90_CW'}],
  ['поверни на 90 влево','TRANSFORM',{mode:'ROTATE_270_CW'}],
  ['поверни на 180 градусов','TRANSFORM',{mode:'ROTATE_180'}],
  ['отрази по горизонтали','TRANSFORM',{mode:'FLIP_HORIZONTAL'}],
  ['отрази по вертикали','TRANSFORM',{mode:'FLIP_VERTICAL'}],
  ['сделай 1024 на 1024','RESIZE',{width:1024,height:1024}],
  ['измени размер на 512 x 768','RESIZE',{width:512,height:768}],
];
test('VI-2 Russian navigation, history, transforms and pixel sizes are deterministic',()=>{
  for(const [utterance,kind,params]of cases){
    const draft=buildVoiceIntentDraft(utterance);
    assert.equal(draft.kind,kind,utterance);
    assert.deepEqual(draft.params,params,utterance);
    assert.equal(draft.requiresConfirmation,true);
    assert.equal(draft.privacy,'LOCAL_ONLY');
    assert.equal(admitVoiceEditorAction(draft,ctx).kind,kind);
    assert.throws(()=>applyConfirmedVoiceDraft(draft,'old prompt'),
      /VOICE_REQUIRES_EXISTING_EDITOR_CONTROLS/);
  }
});
test('VI-2 ambiguity, invalid resize and compound commands fail closed',()=>{
  for(const utterance of [
    'поверни на 90',
    'поверни вправо',
    'сделай 99999 на 99999',
  ]){
    const result=parseRussianVoiceIntent(utterance);
    assert.equal(result.kind,'AMBIGUOUS',utterance);
    assert.throws(()=>admitVoiceEditorAction(buildVoiceIntentDraft(utterance),ctx),
      /VOICE_ACTION_NOT_SUPPORTED/);
  }
  assert.equal(parseRussianVoiceNumber('сто восемьдесят'),180);
  assert.equal(parseRussianVoiceNumber('1024'),1024);
  assert.equal(parseRussianVoiceNumber('абракадабра'),null);
});
test('VI-3 Russian fashion inflections and RU/EN style codes are read-only hints',()=>{
  for(const variant of ['чёрная куртка','черную куртку','в чёрной куртке']){
    const result=normalizeRussianFashionVoice(variant);
    assert.deepEqual(result.categories,['jackets']);
    assert.deepEqual(result.colors,['black']);
    assert.equal(result.garmentId,null);
  }
  const jeans=normalizeRussianFashionVoice('найди синие джинсы деним oversize');
  assert.deepEqual(jeans.categories,['jeans']);
  assert.ok(jeans.colors.includes('blue'));
  assert.ok(jeans.styles.includes('oversize'));
  const query=buildVoiceIntentDraft('примерь чёрную куртку');
  assert.equal(query.kind,'TRYON_SELECT_PROPOSAL');
  assert.equal(query.params.hints.garmentId,null);
});
test('VI-3 zero/one/many real canonical garment candidates never invent identity',()=>{
  const hints=normalizeRussianFashionVoice('бежевое платье');
  assert.equal(resolveFashionVoiceCandidates(hints,[]).status,'NOT_FOUND');
  assert.equal(resolveFashionVoiceCandidates(hints,[
    {id:'g1',status:'READY'},{id:'g2',status:'READY'},
  ]).status,'AMBIGUOUS');
  const unique=resolveFashionVoiceCandidates(hints,[
    {id:'g1',status:'NOT_READY'},{id:'g2',status:'READY'},
  ]);
  assert.equal(unique.status,'READY_TO_CONFIRM');
  assert.equal(unique.candidate.id,'g2');
  assert.notEqual(unique.status,'AUTOMATICALLY_SELECTED');
});
test('VI-4 immutable Project/source and busy state are mandatory on every voice action',()=>{
  const draft=buildVoiceIntentDraft('поверни на 90 вправо');
  for(const blocked of [
    {...ctx,confirmedSourceArtifactId:'old-photo'},
    {...ctx,confirmedProjectId:'other-project'},
    {...ctx,busy:true},
    {...ctx,selectionActive:true},
    {...ctx,hasPendingResult:true},
  ])assert.throws(()=>admitVoiceEditorAction(draft,blocked),/VOICE_/);
  assert.throws(()=>admitVoiceEditorAction(
    buildVoiceIntentDraft('отмени'),{...ctx,canUndo:false}),/VOICE_UNDO_UNAVAILABLE/);
  assert.throws(()=>admitVoiceEditorAction(
    buildVoiceIntentDraft('повтори'),{...ctx,canRedo:false}),/VOICE_REDO_UNAVAILABLE/);
});
test('spoken paid, Agent and Try-On run actions cannot bypass canonical admission',()=>{
  for(const speech of ['прими результат','оплати подписку','удали проект',
    'запусти примерку']){
    const draft=buildVoiceIntentDraft(speech);
    assert.throws(()=>admitVoiceEditorAction(draft,ctx),
      /VOICE_ACTION_NOT_SUPPORTED/,speech);
  }
});
test('VI-4 approved bounded Agent plan is only a proposal, not an execution',()=>{
  const draft=buildVoiceIntentDraft('поверни вправо и затем сделай 1024 на 1024');
  assert.equal(draft.kind,'AGENT_PROPOSAL');
  assert.deepEqual(draft.params,{mode:'ROTATE_90_CW',width:1024,height:1024});
  assert.equal(admitVoiceEditorAction(draft,ctx).kind,'AGENT_PROPOSAL');
  assert.throws(()=>applyConfirmedVoiceDraft(draft,''),
    /VOICE_REQUIRES_EXISTING_EDITOR_CONTROLS/);
  const nav=buildVoiceIntentDraft('сделай это через агента');
  assert.equal(nav.kind,'AGENT_PROPOSAL');
  assert.deepEqual(nav.params,{});
});

test('VI-4 browser Editor wires source-bound voice actions to existing operations only',async()=>{
  const editor=await readFile('src/pages/Editor.jsx','utf8');
  const panel=await readFile('src/components/editor/VoiceInputPanel.jsx','utf8');
  const fashion=await readFile('src/components/editor/fashion/FashionPanel.jsx','utf8');
  const tryon=await readFile('src/components/editor/outfits/CanonicalTryOnRunnerPanel.jsx','utf8');
  assert.match(editor,/admitVoiceEditorAction\(draft,/);
  assert.match(editor,/onVoiceIntent=\{handleVoiceIntent\}/);
  assert.match(editor,/await applyOrthogonalTransform\(params.mode\)/);
  assert.match(editor,/await applyResize\(\{sourceArtifactId:project.current_image_art_id|await applyResize\(\{sourceArtifactId:project.current_image_artifact_id/);
  assert.match(editor,/await undo\(\)/);
  assert.match(editor,/await redo\(\)/);
  assert.match(editor,/await restoreOriginal\(\)/);
  assert.match(editor,/setEditTab\('fashion'\)/);
  assert.match(editor,/setEditTab\('outfits'\)/);
  assert.match(fashion,/voiceQuery/);
  assert.match(tryon,/voiceMatches/);
  assert.doesNotMatch(panel,/coreClient|fetch\(|runTryOnAction|applyEdit\(/);
});
