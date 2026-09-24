#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { normalizeHsmeFoundationBenchmarkCandidateRunV1 } from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkRunEvidenceV1.ts';

const HEX64=/^[0-9a-f]{64}$/;
const OUTPUT_DOMAIN='bers:hsme:foundation-benchmark-output-set:v1\0';
function fail(code,message){const e=new Error(message);e.code=code;throw e;}
function sha256(bytes){return createHash('sha256').update(bytes).digest('hex');}
async function load(path){return JSON.parse(await readFile(path,'utf8'));}
async function fileDigest(path){return sha256(await readFile(path));}
function outputDigest(outputs){
  const normalized=[...outputs].map(x=>({fixtureId:x.fixtureId,seed:x.seed,blindId:x.blindId,imageSha256:x.imageSha256}))
    .sort((a,b)=>a.fixtureId.localeCompare(b.fixtureId)||a.seed-b.seed||a.blindId.localeCompare(b.blindId));
  return sha256(Buffer.from(OUTPUT_DOMAIN+JSON.stringify(normalized),'utf8'));
}
function expectedKeys(plan){
  return new Set(plan.fixtures.flatMap(f=>plan.requiredSeeds.map(seed=>f.fixtureId+'\0'+seed)));
}
function assertInventory(plan,inventory,complete){
  if(inventory.schemaVersion!=='BERS_HSME_FOUNDATION_RUNTIME_INVENTORY_V1'||inventory.candidateId!==plan.candidateId||inventory.immutableRevision!==plan.immutableRevision||inventory.complete!==complete)fail('hsme_executor_inventory_binding','runtime inventory binding mismatch');
  if(!Array.isArray(inventory.artifacts))fail('hsme_executor_inventory_invalid','runtime inventory artifacts invalid');
  const expected=new Map(plan.runtimeArtifacts.map(x=>[x.relativePath,x]));
  const seen=new Set();
  for(const item of inventory.artifacts){
    const exp=expected.get(item.relativePath);
    if(!exp||seen.has(item.relativePath)||item.bytes!==exp.bytes||item.contentSha256!==exp.contentSha256)fail('hsme_executor_inventory_artifact_mismatch','runtime inventory artifact mismatch: '+item.relativePath);
    seen.add(item.relativePath);
  }
  if(complete&&seen.size!==expected.size)fail('hsme_executor_inventory_incomplete','complete inventory missing artifacts');
}
function assertReview(plan,run,review){
  if(review.schemaVersion!=='BERS_HSME_FOUNDATION_BLINDED_REVIEW_PACKAGE_V1'||review.campaignId!==plan.campaignId||review.capability!==plan.capability)fail('hsme_executor_review_binding','review package binding mismatch');
  for(const field of ['candidateIdentityIncluded','latencyIncluded','sizeIncluded','costIncluded'])if(review[field]!==false)fail('hsme_executor_review_leak','review package '+field+' must be false');
  if(!Array.isArray(review.outputs)||review.outputs.length!==run.outputs.length)fail('hsme_executor_review_cardinality','review output cardinality mismatch');
  const byId=new Map(review.outputs.map(x=>[x.blindId,x]));
  for(const output of run.outputs){
    const item=byId.get(output.blindId);
    if(!item||item.fixtureId!==output.fixtureId||item.seed!==output.seed||item.imageSha256!==output.imageSha256||item.relativePath!==output.blindId+'.png')fail('hsme_executor_review_output_binding','review output binding mismatch');
  }
  const serialized=JSON.stringify(review);
  for(const forbidden of [plan.candidateId,plan.immutableRevision,plan.modelContentSha256,plan.executionProfileSha256,plan.rightsEvidenceSha256]){
    if(serialized.includes(forbidden))fail('hsme_executor_review_candidate_leak','review package leaks candidate identity');
  }
}
async function verify(args){
  const [plan,rawRun,inventory]=await Promise.all([load(args.plan),load(args.run),load(args.inventory)]);
  const run=normalizeHsmeFoundationBenchmarkCandidateRunV1(rawRun);
  for(const field of ['candidateId','capability','immutableRevision','modelContentSha256','executionProfileSha256','rightsEvidenceSha256']){
    if(run[field]!==plan[field])fail('hsme_executor_run_binding','run '+field+' drift');
  }
  if(!['COMPLETE','FAILED'].includes(run.status))fail('hsme_executor_run_status','EXECUTE plan must yield COMPLETE or FAILED');
  if(!HEX64.test(run.runtimeInventorySha256)||run.runtimeInventorySha256!==await fileDigest(args.inventory))fail('hsme_executor_inventory_digest','runtime inventory digest mismatch');
  assertInventory(plan,inventory,run.status==='COMPLETE');

  const expected=expectedKeys(plan);
  const actual=new Set();
  const blind=new Set();
  for(const output of run.outputs){
    const key=output.fixtureId+'\0'+output.seed;
    if(!expected.has(key)||actual.has(key)||blind.has(output.blindId))fail('hsme_executor_output_binding','unplanned/duplicate output');
    actual.add(key);blind.add(output.blindId);
  }
  if(run.outputs.length>0&&run.outputSetSha256!==outputDigest(run.outputs))fail('hsme_executor_output_digest','output set digest mismatch');

  if(run.status==='COMPLETE'){
    if(actual.size!==expected.size)fail('hsme_executor_output_incomplete','COMPLETE output set incomplete');
    if(!HEX64.test(run.reviewPackageSha256)||run.failureEvidenceSha256!=='UNKNOWN')fail('hsme_executor_complete_evidence','COMPLETE evidence digests invalid');
    const review=await load(args.review);
    if(run.reviewPackageSha256!==await fileDigest(args.review))fail('hsme_executor_review_digest','review package digest mismatch');
    assertReview(plan,run,review);
    for(const item of review.outputs){
      const imagePath=join(args.reviewDir,item.relativePath);
      if(await fileDigest(imagePath)!==item.imageSha256)fail('hsme_executor_review_image_digest','review image digest mismatch: '+item.relativePath);
    }
  }else{
    if(!HEX64.test(run.failureEvidenceSha256)||run.reviewPackageSha256!=='UNKNOWN')fail('hsme_executor_failed_evidence','FAILED evidence digests invalid');
    if(run.failureEvidenceSha256!==await fileDigest(args.failure))fail('hsme_executor_failure_digest','failure evidence digest mismatch');
    const failure=await load(args.failure);
    if(failure.schemaVersion!=='BERS_HSME_FOUNDATION_BENCHMARK_FAILURE_EVIDENCE_V1'||failure.candidateId!==plan.candidateId||failure.capability!==plan.capability||failure.productionAuthorityGranted!==false||failure.winnerSelectionAllowed!==false)fail('hsme_executor_failure_binding','failure evidence binding invalid');
  }
  return run;
}
function parse(argv){const o={};for(let i=0;i<argv.length;i+=2){if(!argv[i]?.startsWith('--')||argv[i+1]===undefined)fail('hsme_executor_verify_cli','invalid CLI');o[argv[i].slice(2)]=argv[i+1];}return o;}
async function main(){
  const a=parse(process.argv.slice(2));
  for(const k of ['plan','run','inventory'])if(!a[k])fail('hsme_executor_verify_cli','missing --'+k);
  const run=await verify(a);
  process.stdout.write(JSON.stringify({status:run.status,candidateId:run.candidateId,capability:run.capability})+'\n');
}
if(
  process.argv[1]
  &&basename(process.argv[1])==='hsme-foundation-benchmark-executor-verify.mjs'
)main().catch(e=>{process.stderr.write((e.code||'hsme_executor_verify_error')+': '+e.message+'\n');process.exitCode=1;});
export { outputDigest, verify };
