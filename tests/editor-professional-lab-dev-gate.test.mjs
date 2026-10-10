import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('professional local lab is only routable behind explicit development + auth',async()=>{
  const app=await readFile('src/App.jsx','utf8');
  assert.match(app,/EDITOR_PRO_LAB_LOCAL_ONLY = import\.meta\.env\.DEV &&/u);
  assert.match(app,/import\.meta\.env\.VITE_BERS_EDITOR_PRO_LAB === 'true'/u);
  assert.match(app,/\{EDITOR_PRO_LAB_LOCAL_ONLY && \(/u);
  assert.match(app,/<Route path="\/editor-pro-lab" element=/u);
  const auth=app.indexOf('<Route element={<ProtectedRoute');
  const lab=app.indexOf('<Route path="/editor-pro-lab"');
  const close=app.indexOf('<Route path="*"');
  assert.ok(auth>=0&&lab>auth&&lab<close,
    'experimental editor requires the same authenticated AppLayout as other app pages');
  assert.match(app,/lazy\(\(\) => import\('@\/pages\/ProfessionalEditorLabRND'\)\)/u);
});

test('local quality lab contains real algorithms, browser-only import, explicit preview and undo',async()=>{
  const lab=await readFile('src/pages/ProfessionalEditorLabRND.jsx','utf8');
  for(const module of [
    'resizeProfessionalLanczos3Rgba8RND',
    'highlightProtectedToneRgba8RND',
    'precisionCloneStampRgba8RND',
    'composeLinearLightLayersRgba8RND',
    'encodeDeterministicRgbaPng',
  ])assert.match(lab,new RegExp(module,'u'));
  for(const button of [
    'Soft tone','Lanczos3 resize','Linear light blend','Undo','Redo',
    'Select Clone source point','Save local PNG',
  ])assert.ok(lab.includes(button),button);
  assert.match(lab,/MAX_HISTORY = 5/u);
  assert.match(lab,/MAX_PIXELS = 2_097_152/u);
  assert.match(lab,/image\/png', 'image\/jpeg', 'image\/webp'/u);
  assert.match(lab,/new Uint8ClampedArray\(rgba\)/u);
  assert.match(lab,/\['image\/png', 'image\/jpeg', 'image\/webp'\]/u);
  assert.match(lab,/getImageData\(0, 0, bitmap\.width, bitmap\.height\)/u);
  assert.match(lab,/role="status"/u);
  assert.match(lab,/onClick=\{exportLocalPng\}/u);
  for(const forbidden of [
    'Core.UploadFile','coreClient','fetch(','axios','useProject','commitFinal',
    'AcceptFinal','Billing','invokeProvider','FormData(', 'localStorage',
  ])assert.equal(lab.includes(forbidden),false,
    `unreviewed local editing network or state side effect: ${forbidden}`);
  assert.match(lab,/No upload, AI, billing, Project modification or Core Accept/u);
});
