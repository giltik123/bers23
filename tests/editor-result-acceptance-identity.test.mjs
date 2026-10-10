import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  reviewCandidateIdentity, canAcceptReviewedCandidate,
} from '../src/application/editor/ai-first/resultReviewGate.js';

const candidate = {
  beforeUrl:'/original.jpg',afterUrl:'/generated.png',finalArtifactId:'final-a',
  executionId:'exec-a',kind:'AI_SCOPED_GENERATION',scope:'MASKED',
};
const id=reviewCandidateIdentity(candidate);
const ready = {
  identity:id, acknowledgedIdentity:id, afterLoadedIdentity:id,
  beforeLoadedIdentity:id, afterErrorIdentity:null, beforeErrorIdentity:null,
  requiresBefore:true, requiresReview:true, reviewComplete:true,busy:false,
};

test('a reviewed AI photo only accepts after both previews load and review is explicit',()=>{
  assert.equal(canAcceptReviewedCandidate(ready),true);
  for(const mutation of [
    {acknowledgedIdentity:null},{afterLoadedIdentity:null},{beforeLoadedIdentity:null},
    {reviewComplete:false},{busy:true},{afterErrorIdentity:id},{beforeErrorIdentity:id},
  ]) assert.equal(canAcceptReviewedCandidate({...ready,...mutation}),false);
});

test('replaced final URL, source, execution, mask scope or identity revokes acceptance immediately',()=>{
  for(const field of ['afterUrl','beforeUrl','executionId','finalArtifactId','scope','kind']){
    const changed = reviewCandidateIdentity({...candidate,[field]:candidate[field]+'-new'});
    assert.notEqual(changed,id);
    assert.equal(canAcceptReviewedCandidate({...ready,identity:changed}),false);
  }
});

test('normal edits still require a loaded output; ordinary operations need not load before view',()=>{
  const usual=reviewCandidateIdentity({...candidate,kind:'CROP'});
  assert.equal(canAcceptReviewedCandidate({
    ...ready,identity:usual,acknowledgedIdentity:usual,afterLoadedIdentity:usual,
    beforeLoadedIdentity:null,requiresBefore:false,requiresReview:false,reviewComplete:false,
  }),true);
});

test('invalid and empty after-image state never authorizes commit',()=>{
  for(const value of [null,'']) {
    assert.equal(canAcceptReviewedCandidate({...ready,afterLoadedIdentity:value}),false);
  }
});

test('ResultCompare image events and candidate identity drive acceptance instead of stale checkboxes',async()=>{
  const source=await readFile('src/components/editor/ResultCompare.jsx','utf8');
  assert.match(source,/reviewCandidateIdentity\(/);
  assert.match(source,/canAcceptReviewedCandidate\(/);
  assert.match(source,/onLoad=\{\(\)=>markLoaded\('after'\)\}/);
  assert.match(source,/onError=\{\(\)=>markFailed\('after'\)\}/);
  assert.match(source,/onLoad=\{\(\)=>markLoaded\('before'\)\}/);
  assert.match(source,/identity,\s*acknowledgedIdentity,/);
  assert.match(source,/requiresBefore: scopedGeneration \|\| fashion/);
  assert.match(source,/const reviewImagesReady = loaded\.before === identity && loaded\.after === identity/);
  assert.match(source,/checked=\{scopedReview\}/);
  assert.match(source,/checked=\{fashionReview\[key\]\}/);
  assert.equal((source.match(/disabled=\{busy \|\| !reviewImagesReady\}/g) || []).length, 2);

});
