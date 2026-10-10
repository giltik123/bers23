import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { canonicalDownloadName, downloadCanonicalImage } from '../src/application/editor/downloadCanonicalImage.js';

const url='/api/core/artifacts/results/signed%2Btoken';
const verifiedRgba=Buffer.from([227,18,49,255,12,154,71,255,79,56,213,255,181,180,36,255]);
const verifiedPng=await sharp(verifiedRgba,{raw:{width:2,height:2,channels:4}})
  .png({compressionLevel:9}).toBuffer();
function fixture({status=200,mime='image/png',bytes=verifiedPng,urlValue=url}={}) {
  const calls=[];
  let clicked=false,removed=false,scheduled,downloadedBlob;
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
    createObjectURL:blob=>{assert.equal(blob.size,bytes.length);downloadedBlob=blob;calls.push('blob');return 'blob:generated';},
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
    state:()=>({calls,clicked,removed,filename:node.download,href:node.href,scheduled,downloadedBlob}),
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
  const pixels=await sharp(Buffer.from(await f.state().downloadedBlob.arrayBuffer()))
    .ensureAlpha().raw().toBuffer();
  assert.deepEqual(pixels,verifiedRgba);
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
test('split frontend/Core URL is accepted only for exact configured trusted Core origin',async()=>{
  const resource='/api/core/artifacts/results/signed%2Btoken';
  let used=null;
  const coreApiRoot='https://core.bers.test/api/core';
  const doc={body:{appendChild(){}},createElement:()=>({
    style:{},click(){},remove(){},
  })};
  const opts={
    imageUrl:'https://core.bers.test'+resource,
    origin:'https://studio.bers.test',coreApiRoot,
    documentApi:doc,
    urlApi:{createObjectURL:()=> 'blob:trusted',revokeObjectURL(){}},
    scheduleRevoke:()=>{},
    fetcher:async(url,init)=>{
      used={url,credentials:init.credentials};
      return new Response(new Blob([verifiedPng],{type:'image/png'}),{
        headers:{'content-type':'image/png'},
      });
    },
  };
  const saved=await downloadCanonicalImage(opts);
  assert.equal(saved,'BERS-image.png');
  assert.deepEqual(used,{
    url:'https://core.bers.test'+resource,credentials:'include',
  });
  // A visually similar but foreign host can never receive a signed URL.
  for(const invalid of [
    'https://evil.bers.test'+resource,
    'https://core.bers.test.evil.test'+resource,
    'https://core.bers.test'+resource+'#fragment',
    'https://core.bers.test'+resource+'?tracking=yes',
  ]){
    used=null;
    await assert.rejects(
      ()=>downloadCanonicalImage({...opts,imageUrl:invalid}),
      /Only a signed Core image/,
    );
    assert.equal(used,null);
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
