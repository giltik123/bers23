import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('combined #1003 UX and #1000 download retain separate View and authenticated Core save actions',async()=>{
  const [editor,helper,workflow]=await Promise.all([
    readFile('src/pages/Editor.jsx','utf8'),
    readFile('src/application/editor/downloadCanonicalImage.js','utf8'),
    readFile('.github/workflows/editor-canonical-download.yml','utf8'),
  ]);
  assert.match(editor,/LocalAdjustmentsPanel/u);
  assert.match(editor,/View image/u);
  assert.match(editor,/const handleDownload = async/u);
  assert.match(editor,/onClick=\{handleDownload\}/u);
  assert.match(editor,/fresh\.current_image_artifact_id!==project\.current_image_artifact_id/u);
  assert.match(editor,/projectService\.get\(project\.id\)/u);
  assert.match(editor,/downloadCanonicalImage\(\{/u);
  assert.match(editor,/disabled=\{downloading \|\| editorBusy/u);
  assert.doesNotMatch(editor,/<a href=\{project\.current_image_url\}[^>]*aria-label="Download"/u);
  assert.match(helper,/redirect:'error'/u);
  assert.match(helper,/const reader=response\.body\.getReader\(\)/u);
  assert.match(workflow,/editor-ux-download-integration\.test\.mjs/u);
});
