import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { canonicalDownloadName, downloadCanonicalImage } from '../src/application/editor/downloadCanonicalImage.js';

const url='/api/core/artifacts/results/signed%2Btoken';
function fixture({status=200,mime='image/png',bytes=new Uint8Array([137,80,78,71]),urlValue=url}={}) {
  const calls=[];
  let clicked=false,removed=false,scheduled;
  const node={
    href:'',download:'',style:{},
    click:()=>{clicked=true;calls.push('download.click');},
    remove:()=>{removed=true;calls.push('download.remove');},
  };
  const documentApi={
    createElement:tag=>{assert.equal(tag,'a');return node;},
    body:{appendChild:element=>{assert.equal(element,node);calls.push('append');}},
  };
  const urlApi={
    createObjectURL:blob=>{assert.equal(blob.size,bytes.length);calls.push('blob');return 'blob:generated';},
    revokeObjectURL:blob=>{assert.equal(blob,'blob:generated');calls.push('revoke');},
  };
  const fetcher=async(request,init)=>{
    calls.push('fetch');
    assert.equal(init.credentials,'include');
    assert.equal(request,'https://bers.test'+urlValue);
    return new Response(new Blob([bytes],{type:mime}),{status,headers:{'Content-Type':mime}});
  };
  return {
    options:{imageUrl:urlValue,projectName:'Fashion/Photos',origin:'https://bers.test',
      fetcher,documentApi,urlApi,scheduleRevoke:callback=>{scheduled=callback;}},
    state:()=>({calls,clicked,removed,filename:node.download,href:node.href,scheduled}),
  };
}
test('actual signed image pixels are downloaded to a local file, not opened in a tab',async()=>{
  const f=fixture();
  const filename=await downloadCanonicalImage(f.options);
  assert.equal(filename,'Fashion_Photos.png');
  assert.deepEqual(f.state().calls,['fetch','blob','append','download.click','download.remove']);
  assert.equal(f.state().clicked,true);
  assert.equal(f.state().removed,true);
  assert.equal(f.state().href,'blob:generated');
  assert.equal(f.state().filename,'Fashion_Photos.png');
  f.state().scheduled();
  assert.equal(f.state().calls.at(-1),'revoke');
});
test('signed Core export filenames remain safe and preserve real response encoding',()=>{
  assert.equal(canonicalDownloadName('A/B\\C?D','image/jpeg'),'A_B_C_D.jpg');
  assert.equal(canonicalDownloadName('hello','image/webp'),'hello.webp');
  assert.equal(canonicalDownloadName('..','image/png'),'BERS-image.png');
  assert.throws(()=>canonicalDownloadName('a','text/html'),/not supported/);
});
test('reject spoofed / arbitrary delivery URLs before any request',async()=>{
  for(const invalid of [
    'https://evil.test/steal', '//evil.test/api/core/artifacts/results/foo',
    '/api/core/projects/project-a', '/api/core/artifacts/results/',
    '/api/core/artifacts/results/id/other',
    '/api/core/artifacts/results/id#other',
  ]) {
    const f=fixture({urlValue:invalid});
    await assert.rejects(()=>downloadCanonicalImage(f.options),/Only a signed|URL is invalid/);
    assert.deepEqual(f.state().calls,[]);
  }
});
test('HTTP errors, HTML responses and empty downloads never click an export link',async()=>{
  for(const input of [{status:404},{mime:'text/html'},{bytes:new Uint8Array(0)}]){
    const f=fixture(input);
    await assert.rejects(()=>downloadCanonicalImage(f.options));
    assert.equal(f.state().clicked,false);
  }
});
test('Editor uses file-download handler rather than a navigation to an image tab',async()=>{
  const editor=await readFile('src/pages/Editor.jsx','utf8');
  assert.match(editor,/downloadCanonicalImage\(/);
  assert.match(editor,/onClick=\{handleDownload\}/);
  assert.doesNotMatch(editor,/<a href=\{project\.current_image_url\} target="_blank"/);
});
