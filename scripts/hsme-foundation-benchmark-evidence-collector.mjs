#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

import {
  HSME_FOUNDATION_BENCHMARK_RUN_EVIDENCE_V1_SCHEMA,
  hsmeFoundationBenchmarkRunEvidenceV1Digest,
  normalizeHsmeFoundationBenchmarkCandidateRunV1,
  normalizeHsmeFoundationBenchmarkRunEvidenceV1,
  proveHsmeFoundationBenchmarkRunEvidenceV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkRunEvidenceV1.ts';
import {
  hsmeFoundationFixturePlanDigestV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkFixturePlanV1.ts';

export const COLLECTOR_SCHEMA='BERS_HSME_FOUNDATION_BENCHMARK_EVIDENCE_COLLECTION_PROOF_V1';
export const MANIFEST_SCHEMA='BERS_HSME_FOUNDATION_BENCHMARK_DISPATCH_EVIDENCE_MANIFEST_V1';
export const ACCEPTED_EXECUTOR_BASE_SHA='5913e2b0975aa4cef17a1a41ede2c5a78f54b95d';
const PLAN_SCHEMA='BERS_HSME_FOUNDATION_BENCHMARK_EXECUTION_PLAN_V1';
const INVENTORY_SCHEMA='BERS_HSME_FOUNDATION_RUNTIME_INVENTORY_V1';
const REVIEW_SCHEMA='BERS_HSME_FOUNDATION_BLINDED_REVIEW_PACKAGE_V1';
const FAILURE_SCHEMA='BERS_HSME_FOUNDATION_BENCHMARK_FAILURE_EVIDENCE_V1';
const OUTPUT_DOMAIN='bers:hsme:foundation-benchmark-output-set:v1\0';
const BASE='src/platform/creative/local-ai/hsme';
const PATHS=Object.freeze({
  campaign:BASE+'/hsme-foundation-benchmark-campaign.v1.json',
  trust:BASE+'/hsme-foundation-benchmark-candidate-trust.v1.json',
  fixturePlan:BASE+'/hsme-foundation-benchmark-fixture-plan.v1.json',
  fixturePack:BASE+'/hsme-foundation-fixture-pack-evidence.v1.json',
  profiles:BASE+'/hsme-foundation-benchmark-execution-profiles.v1.json',
  generated:'tests/fixtures/hsme-foundation-generated-editing-v1/fixture-manifest.json',
  d6:'tests/fixtures/tiny-sd-d6-quality-corpus-v1.json',
});
const SUBSTRATE_PATHS=Object.freeze(Object.values(PATHS));
const CAPABILITIES=Object.freeze(['TEXT_TO_IMAGE','IMAGE_EDITING']);
const AUTHORITY_FIELDS=Object.freeze([
  'productionAuthorityGranted','providerAuthorityGranted','billingAuthorityGranted',
  'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
  'durableModelFleetPromotionAllowed','trainingOrDistillationAllowed','winnerSelectionAllowed',
]);
const HEX40=/^[0-9a-f]{40}$/;
const HEX64=/^[0-9a-f]{64}$/;
const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};

function fail(code,message){const e=new Error(message);e.code=code;throw e;}
function sha256(bytes){return createHash('sha256').update(bytes).digest('hex');}
async function loadJson(path){return JSON.parse(await readFile(path,'utf8'));}
async function fileDigest(path){return sha256(await readFile(path));}
function stable(value){return JSON.stringify(value,null,2)+'\n';}
function exactKeys(value,keys,name){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('hsme_collector_shape_invalid',name+' must be an object');
  const actual=Object.keys(value).sort(),expected=[...keys].sort();
  if(JSON.stringify(actual)!==JSON.stringify(expected))fail('hsme_collector_shape_invalid',name+' keys mismatch');
  return value;
}
function safeRel(value,name){
  if(typeof value!=='string'||value.length<1||value.length>420||value.startsWith('/')||value.includes('\\'))fail('hsme_collector_path_invalid',name+' must be repository/workspace relative');
  const parts=value.split('/');
  if(parts.some(x=>x===''||x==='.'||x==='..'))fail('hsme_collector_path_invalid',name+' contains unsafe segment');
  return value;
}
async function resolveContained(root,value,name){
  const relative=safeRel(value,name);
  const rootReal=await realpath(root);
  const candidate=resolve(rootReal,relative);
  let stat;
  try{stat=await lstat(candidate);}catch{fail('hsme_collector_path_missing',name+' does not exist: '+relative);}
  if(stat.isSymbolicLink())fail('hsme_collector_symlink_forbidden',name+' may not be a symlink: '+relative);
  const real=await realpath(candidate);
  if(real!==rootReal&&!real.startsWith(rootReal+sep))fail('hsme_collector_path_escape',name+' escapes root');
  return real;
}
function assertFalseAuthorities(value,name){
  for(const field of AUTHORITY_FIELDS){
    if(Object.prototype.hasOwnProperty.call(value,field)&&value[field]!==false)fail('hsme_collector_authority_widened',name+'.'+field+' must be false');
  }
}
function compareRows(a,b){return a.candidateId.localeCompare(b.candidateId)||a.capability.localeCompare(b.capability);}
function outputDigest(outputs){
  const normalized=[...outputs].map(x=>({fixtureId:x.fixtureId,seed:x.seed,blindId:x.blindId,imageSha256:x.imageSha256}))
    .sort((a,b)=>a.fixtureId.localeCompare(b.fixtureId)||a.seed-b.seed||a.blindId.localeCompare(b.blindId));
  return sha256(Buffer.from(OUTPUT_DOMAIN+JSON.stringify(normalized),'utf8'));
}
function evidenceSetDigest(files){
  const normalized=[...files].sort((a,b)=>a.path.localeCompare(b.path));
  return sha256(Buffer.from(JSON.stringify(normalized),'utf8'));
}

export function normalizeDispatchManifest(raw,campaign){
  const record=exactKeys(raw,['schemaVersion','acceptedExecutorBaseSha','campaignId','rows','productionAuthorityGranted','winnerSelectionAllowed'],'manifest');
  if(record.schemaVersion!==MANIFEST_SCHEMA)fail('hsme_collector_manifest_schema','manifest schema mismatch');
  if(record.acceptedExecutorBaseSha!==ACCEPTED_EXECUTOR_BASE_SHA)fail('hsme_collector_executor_base_mismatch','manifest executor base is not the accepted executor');
  if(record.campaignId!==campaign.campaignId)fail('hsme_collector_campaign_mismatch','manifest campaign mismatch');
  if(record.productionAuthorityGranted!==false||record.winnerSelectionAllowed!==false)fail('hsme_collector_manifest_authority','manifest authority must remain false');
  if(!Array.isArray(record.rows)||record.rows.length!==campaign.candidates.length*CAPABILITIES.length)fail('hsme_collector_manifest_row_count','manifest must contain exactly 12 rows');
  const rows=record.rows.map((row,index)=>{
    const pathName='manifest.rows['+index+']';
    exactKeys(row,['candidateId','capability','workflowRunId','bundlePath'],pathName);
    if(!campaign.candidates.some(x=>x.candidateId===row.candidateId))fail('hsme_collector_manifest_candidate','unknown candidate '+row.candidateId);
    if(!CAPABILITIES.includes(row.capability))fail('hsme_collector_manifest_capability','unknown capability '+row.capability);
    if(!Number.isSafeInteger(row.workflowRunId)||row.workflowRunId<=0)fail('hsme_collector_manifest_run_id','workflowRunId must be positive integer');
    return Object.freeze({candidateId:row.candidateId,capability:row.capability,workflowRunId:row.workflowRunId,bundlePath:safeRel(row.bundlePath,pathName+'.bundlePath')});
  });
  const keys=rows.map(x=>x.candidateId+'\0'+x.capability);
  if(new Set(keys).size!==rows.length)fail('hsme_collector_manifest_duplicate_row','duplicate candidate/capability row');
  if(new Set(rows.map(x=>x.workflowRunId)).size!==rows.length)fail('hsme_collector_manifest_duplicate_run','workflowRunId must be unique per row');
  const expected=campaign.candidates.flatMap(c=>CAPABILITIES.map(cap=>c.candidateId+'\0'+cap)).sort();
  if(JSON.stringify([...keys].sort())!==JSON.stringify(expected))fail('hsme_collector_manifest_roster','manifest does not cover frozen 12-row roster');
  return Object.freeze({...record,rows:Object.freeze([...rows].sort(compareRows))});
}

function assertPlan(plan,candidate,capability,campaign,trust,fixturePlanDigest,substrateDigests){
  if(!plan||typeof plan!=='object'||Array.isArray(plan)||plan.schemaVersion!==PLAN_SCHEMA)fail('hsme_collector_plan_schema','execution plan schema mismatch');
  if(plan.candidateSha!==ACCEPTED_EXECUTOR_BASE_SHA)fail('hsme_collector_plan_executor_base','execution plan candidateSha must equal accepted executor base');
  if(!HEX40.test(plan.controllerMainSha))fail('hsme_collector_plan_controller_sha','execution plan controllerMainSha must be lowercase SHA-1');
  if(!plan.substrateDigests||typeof plan.substrateDigests!=='object'||Array.isArray(plan.substrateDigests))fail('hsme_collector_plan_substrate','execution plan substrateDigests missing');
  const substrateKeys=Object.keys(plan.substrateDigests).sort();
  if(JSON.stringify(substrateKeys)!==JSON.stringify([...SUBSTRATE_PATHS].sort()))fail('hsme_collector_plan_substrate','execution plan substrate roster mismatch');
  for(const path of SUBSTRATE_PATHS){
    if(plan.substrateDigests[path]!==substrateDigests[path])fail('hsme_collector_plan_substrate','execution plan substrate digest mismatch: '+path);
  }
  if(plan.campaignId!==campaign.campaignId||plan.campaignDigest!==trust.campaignDigest)fail('hsme_collector_plan_campaign','execution plan campaign binding mismatch');
  if(plan.fixturePlanDigest!==fixturePlanDigest||plan.fixtureSetSha256!==campaign.fixturePack.fixtureSetSha256||plan.outputSetContractSha256!==campaign.fixturePack.outputSetContractSha256)fail('hsme_collector_plan_fixture','execution plan fixture binding mismatch');
  for(const field of ['candidateId','immutableRevision','modelContentSha256','executionProfileSha256','rightsEvidenceSha256']){
    const expected=field==='candidateId'?candidate.candidateId:candidate[field];
    if(plan[field]!==expected)fail('hsme_collector_plan_candidate','execution plan '+field+' mismatch');
  }
  if(plan.capability!==capability)fail('hsme_collector_plan_capability','execution plan capability mismatch');
  const supported=candidate.capabilities.includes(capability);
  if(!supported&&plan.disposition!=='NOT_APPLICABLE')fail('hsme_collector_plan_disposition','unsupported row must be NOT_APPLICABLE');
  if(supported&&candidate.candidateId==='sana-sprint-0.6b-split-v1'&&capability==='TEXT_TO_IMAGE'){
    if(!['EXECUTE','BLOCKED_PARITY_PENDING'].includes(plan.disposition))fail('hsme_collector_plan_disposition','SANA T2I must EXECUTE or remain parity blocked');
  }else if(supported&&plan.disposition!=='EXECUTE')fail('hsme_collector_plan_disposition','supported row must EXECUTE');
  if(plan.disposition==='EXECUTE'&&(!Array.isArray(plan.runtimeArtifacts)||plan.runtimeArtifacts.length<1))fail('hsme_collector_runtime_artifacts','EXECUTE plan requires runtime artifacts');
  if(plan.disposition!=='EXECUTE'&&(!Array.isArray(plan.runtimeArtifacts)||plan.runtimeArtifacts.length!==0))fail('hsme_collector_runtime_artifacts','non-execute plan may not carry runtime artifacts');
  assertFalseAuthorities(plan,'executionPlan');
  if(plan.ordinaryCiModelExecutionAllowed!==false)fail('hsme_collector_plan_ci_authority','ordinaryCiModelExecutionAllowed must remain false');
  return plan;
}
function assertRunIdentity(run,plan){
  for(const field of ['candidateId','capability','immutableRevision','modelContentSha256','executionProfileSha256','rightsEvidenceSha256']){
    if(run[field]!==plan[field])fail('hsme_collector_run_identity','candidate run '+field+' differs from execution plan');
  }
}
function inventoryArtifactsMatch(plan,inventory,complete){
  exactKeys(inventory,['schemaVersion','candidateId','immutableRevision','complete','artifacts'],'runtimeInventory');
  if(inventory.schemaVersion!==INVENTORY_SCHEMA||inventory.candidateId!==plan.candidateId||inventory.immutableRevision!==plan.immutableRevision||inventory.complete!==complete)fail('hsme_collector_inventory_binding','runtime inventory binding mismatch');
  if(!Array.isArray(inventory.artifacts))fail('hsme_collector_inventory_shape','runtime inventory artifacts invalid');
  const expected=new Map((plan.runtimeArtifacts||[]).map(x=>[x.relativePath,x]));
  const seen=new Set();
  for(const item of inventory.artifacts){
    exactKeys(item,['relativePath','bytes','contentSha256'],'runtimeInventory.artifact');
    const exp=expected.get(item.relativePath);
    if(!exp||seen.has(item.relativePath)||item.bytes!==exp.bytes||item.contentSha256!==exp.contentSha256)fail('hsme_collector_inventory_artifact','runtime inventory artifact mismatch');
    seen.add(item.relativePath);
  }
  if(complete&&seen.size!==expected.size)fail('hsme_collector_inventory_incomplete','complete inventory omits planned runtime artifact');
}
async function verifyReview(bundleDir,plan,run,fileRecords){
  const reviewPath=join(bundleDir,'review-package.json');
  const review=await loadJson(reviewPath);
  exactKeys(review,['schemaVersion','campaignId','capability','outputs','candidateIdentityIncluded','latencyIncluded','sizeIncluded','costIncluded'],'reviewPackage');
  const reviewSha=await fileDigest(reviewPath);
  fileRecords.push({path:'review-package.json',sha256:reviewSha});
  if(run.reviewPackageSha256!==reviewSha)fail('hsme_collector_review_digest','review package digest mismatch');
  if(review.schemaVersion!==REVIEW_SCHEMA||review.campaignId!==plan.campaignId||review.capability!==plan.capability)fail('hsme_collector_review_binding','review package binding mismatch');
  for(const field of ['candidateIdentityIncluded','latencyIncluded','sizeIncluded','costIncluded'])if(review[field]!==false)fail('hsme_collector_review_leak','review '+field+' must be false');
  if(!Array.isArray(review.outputs)||review.outputs.length!==run.outputs.length)fail('hsme_collector_review_cardinality','review output count mismatch');
  for(const item of review.outputs)exactKeys(item,['fixtureId','seed','blindId','imageSha256','relativePath'],'reviewPackage.output');
  const byBlind=new Map(review.outputs.map(x=>[x.blindId,x]));
  const serialized=JSON.stringify(review);
  for(const secret of [plan.candidateId,plan.immutableRevision,plan.modelContentSha256,plan.executionProfileSha256,plan.rightsEvidenceSha256]){
    if(serialized.includes(secret))fail('hsme_collector_review_identity_leak','review package leaks candidate identity');
  }
  for(const output of run.outputs){
    const item=byBlind.get(output.blindId);
    if(!item||item.fixtureId!==output.fixtureId||item.seed!==output.seed||item.imageSha256!==output.imageSha256||item.relativePath!==output.blindId+'.png')fail('hsme_collector_review_output','review output binding mismatch');
    const relative=safeRel('blind-review/'+item.relativePath,'review image path');
    const imagePath=await resolveContained(bundleDir,relative,'review image');
    const imageSha=await fileDigest(imagePath);
    fileRecords.push({path:relative,sha256:imageSha});
    if(imageSha!==item.imageSha256)fail('hsme_collector_review_image','review image digest mismatch');
  }
}
async function verifyFailure(bundleDir,plan,run,fileRecords){
  const failurePath=join(bundleDir,'failure-evidence.json');
  const failure=await loadJson(failurePath);
  exactKeys(failure,['schemaVersion','candidateId','capability','errorType','errorMessage','tracebackSha256','productionAuthorityGranted','winnerSelectionAllowed'],'failureEvidence');
  const digest=await fileDigest(failurePath);
  fileRecords.push({path:'failure-evidence.json',sha256:digest});
  if(run.failureEvidenceSha256!==digest)fail('hsme_collector_failure_digest','failure evidence digest mismatch');
  if(failure.schemaVersion!==FAILURE_SCHEMA||failure.candidateId!==plan.candidateId||failure.capability!==plan.capability||!HEX64.test(failure.tracebackSha256)||failure.productionAuthorityGranted!==false||failure.winnerSelectionAllowed!==false)fail('hsme_collector_failure_binding','failure evidence binding invalid');
}

export async function verifyEvidenceBundle(root,row,campaign,trust,fixturePlanDigest,substrateDigests){
  const bundleDir=await resolveContained(root,row.bundlePath,'bundlePath');
  const candidate=campaign.candidates.find(x=>x.candidateId===row.candidateId);
  if(!candidate)fail('hsme_collector_candidate_missing','candidate missing');
  const planPath=join(bundleDir,'execution-plan.json');
  const plan=assertPlan(await loadJson(planPath),candidate,row.capability,campaign,trust,fixturePlanDigest,substrateDigests);
  const fileRecords=[{path:'execution-plan.json',sha256:await fileDigest(planPath)}];
  let run;
  if(plan.disposition==='EXECUTE'){
    const runPath=join(bundleDir,'candidate-run.json');
    run=normalizeHsmeFoundationBenchmarkCandidateRunV1(await loadJson(runPath));
    fileRecords.push({path:'candidate-run.json',sha256:await fileDigest(runPath)});
    assertRunIdentity(run,plan);
    if(!['COMPLETE','FAILED'].includes(run.status))fail('hsme_collector_execute_status','EXECUTE plan must yield COMPLETE or FAILED');
    const inventoryPath=join(bundleDir,'runtime-inventory.json');
    const inventory=await loadJson(inventoryPath);
    const inventorySha=await fileDigest(inventoryPath);
    fileRecords.push({path:'runtime-inventory.json',sha256:inventorySha});
    if(run.runtimeInventorySha256!==inventorySha||!HEX64.test(inventorySha))fail('hsme_collector_inventory_digest','runtime inventory digest mismatch');
    inventoryArtifactsMatch(plan,inventory,run.status==='COMPLETE');
    if(run.outputs.length>0&&run.outputSetSha256!==outputDigest(run.outputs))fail('hsme_collector_output_digest','candidate output set digest mismatch');
    if(run.status==='COMPLETE'){
      if(run.failureEvidenceSha256!=='UNKNOWN'||!HEX64.test(run.reviewPackageSha256))fail('hsme_collector_complete_evidence','COMPLETE evidence fields invalid');
      await verifyReview(bundleDir,plan,run,fileRecords);
    }else{
      if(run.reviewPackageSha256!=='UNKNOWN'||!HEX64.test(run.failureEvidenceSha256))fail('hsme_collector_failed_evidence','FAILED evidence fields invalid');
      if(run.outputs.length!==0||run.outputSetSha256!=='UNKNOWN')fail('hsme_collector_failed_partial_output','accepted executor FAILED bundles may not carry partial outputs');
      await verifyFailure(bundleDir,plan,run,fileRecords);
    }
  }else{
    const terminalPath=join(bundleDir,'terminal-row.json');
    run=normalizeHsmeFoundationBenchmarkCandidateRunV1(await loadJson(terminalPath));
    fileRecords.push({path:'terminal-row.json',sha256:await fileDigest(terminalPath)});
    assertRunIdentity(run,plan);
    const supported=candidate.capabilities.includes(row.capability);
    if(plan.disposition==='NOT_APPLICABLE'){
      if(supported||run.status!=='NOT_APPLICABLE')fail('hsme_collector_terminal_not_applicable','invalid NOT_APPLICABLE row');
    }else if(plan.disposition==='BLOCKED_PARITY_PENDING'){
      if(row.candidateId!=='sana-sprint-0.6b-split-v1'||row.capability!=='TEXT_TO_IMAGE'||run.status!=='BLOCKED_PARITY_PENDING')fail('hsme_collector_terminal_blocked','invalid parity-blocked row');
    }else fail('hsme_collector_disposition','unsupported execution plan disposition');
  }
  return Object.freeze({run,source:Object.freeze({candidateId:row.candidateId,capability:row.capability,workflowRunId:row.workflowRunId,bundlePath:row.bundlePath,evidenceSetSha256:evidenceSetDigest(fileRecords),files:Object.freeze([...fileRecords].sort((a,b)=>a.path.localeCompare(b.path)))})});
}

export async function collectFoundationEvidence(root,rawManifest){
  const rootPath=resolve(root);
  const [campaign,trust,fixturePlan,fixturePack]=await Promise.all([
    loadJson(join(rootPath,PATHS.campaign)),loadJson(join(rootPath,PATHS.trust)),
    loadJson(join(rootPath,PATHS.fixturePlan)),loadJson(join(rootPath,PATHS.fixturePack)),
  ]);
  const manifest=normalizeDispatchManifest(rawManifest,campaign);
  const substrateDigests={};
  for(const path of SUBSTRATE_PATHS)substrateDigests[path]=await fileDigest(join(rootPath,path));
  const fixturePlanDigest=await hsmeFoundationFixturePlanDigestV1(fixturePlan,hashPort);
  if(fixturePack.fixturePlanSha256!==fixturePlanDigest)fail('hsme_collector_fixture_plan_digest','fixture pack/plan digest mismatch');
  if(trust.state!=='PINNED'||trust.campaignId!==campaign.campaignId)fail('hsme_collector_trust','PINNED campaign trust required');
  const verified=[];
  for(const row of manifest.rows)verified.push(await verifyEvidenceBundle(rootPath,row,campaign,trust,fixturePlanDigest,substrateDigests));
  const runs=verified.map(x=>x.run);
  const rawEvidence={
    schemaVersion:HSME_FOUNDATION_BENCHMARK_RUN_EVIDENCE_V1_SCHEMA,
    campaignId:campaign.campaignId,
    campaignDigest:trust.campaignDigest,
    fixtureSetSha256:campaign.fixturePack.fixtureSetSha256,
    outputSetContractSha256:campaign.fixturePack.outputSetContractSha256,
    requiredSeeds:[...fixturePack.sources.outputSetContract.requiredSeeds],
    candidateOutputsObserved:runs.some(x=>x.outputs.length>0),
    runs,
    productionAuthorityGranted:false,providerAuthorityGranted:false,billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,aeeExecutionAuthorityGranted:false,durableModelFleetPromotionAllowed:false,
    trainingOrDistillationAllowed:false,winnerSelectionAllowed:false,
  };
  const evidence=normalizeHsmeFoundationBenchmarkRunEvidenceV1(rawEvidence);
  const proof=await proveHsmeFoundationBenchmarkRunEvidenceV1(campaign,trust,fixturePlan,fixturePack,evidence,hashPort);
  const evidenceSha256=await hsmeFoundationBenchmarkRunEvidenceV1Digest(evidence,hashPort);
  return Object.freeze({
    evidence,
    collectionProof:Object.freeze({
      schemaVersion:COLLECTOR_SCHEMA,
      acceptedExecutorBaseSha:ACCEPTED_EXECUTOR_BASE_SHA,
      campaignId:campaign.campaignId,
      runEvidenceSha256:evidenceSha256,
      state:proof.state,
      completeRunCount:proof.completeRunCount,
      blockedRunCount:proof.blockedRunCount,
      notApplicableRunCount:proof.notApplicableRunCount,
      failedRunCount:proof.failedRunCount,
      observedOutputCount:proof.observedOutputCount,
      sources:Object.freeze(verified.map(x=>x.source).sort(compareRows)),
      candidateOutputsObserved:proof.candidateOutputsObserved,
      productionAuthorityGranted:false,
      providerAuthorityGranted:false,
      billingAuthorityGranted:false,
      projectArtifactMutationAllowed:false,
      aeeExecutionAuthorityGranted:false,
      durableModelFleetPromotionAllowed:false,
      trainingOrDistillationAllowed:false,
      winnerSelectionAllowed:false,
    }),
  });
}
function parseArgs(argv){const out={};for(let i=0;i<argv.length;i+=2){if(!argv[i]?.startsWith('--')||argv[i+1]===undefined)fail('hsme_collector_cli','invalid arguments');out[argv[i].slice(2)]=argv[i+1];}return out;}
async function main(){
  const a=parseArgs(process.argv.slice(2));
  for(const key of ['root','manifest','run-evidence-out','collection-proof-out'])if(!a[key])fail('hsme_collector_cli','missing --'+key);
  const manifest=await loadJson(a.manifest);
  const result=await collectFoundationEvidence(a.root,manifest);
  await writeFile(a['run-evidence-out'],stable(result.evidence));
  await writeFile(a['collection-proof-out'],stable(result.collectionProof));
  process.stdout.write(JSON.stringify({state:result.collectionProof.state,runEvidenceSha256:result.collectionProof.runEvidenceSha256})+'\n');
}
if(process.env.HSME_FOUNDATION_COLLECTOR_CLI==='1')main().catch(e=>{process.stderr.write((e.code||'hsme_collector_error')+': '+e.message+'\n');process.exitCode=1;});
