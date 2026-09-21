#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
  hsmeFoundationBenchmarkCampaignV1Digest,
  hsmeFoundationBenchmarkCandidateMayRunV1,
  normalizeHsmeFoundationBenchmarkCampaignV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkCampaignV1.ts';
import {
  hsmeFoundationBenchmarkExecutionProfileDigestV1,
  normalizeHsmeFoundationBenchmarkCandidateTrustV1,
  normalizeHsmeFoundationBenchmarkExecutionProfileV1,
  proveHsmeFoundationBenchmarkCandidateTrustV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkCandidateTrustV1.ts';
import {
  hsmeFoundationFixturePlanDigestV1,
  normalizeHsmeFoundationFixturePlanV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkFixturePlanV1.ts';
import {
  normalizeHsmeFoundationBenchmarkCandidateRunV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkRunEvidenceV1.ts';
import {
  normalizeHsmeSanaConditioningParityPlanV1,
  proveHsmeSanaConditioningParityEvidenceV1,
} from '../src/platform/creative/local-ai/hsme/HsmeSanaConditioningParityEvidenceV1.ts';

export const EXECUTION_PLAN_SCHEMA='BERS_HSME_FOUNDATION_BENCHMARK_EXECUTION_PLAN_V1';
const BASE='src/platform/creative/local-ai/hsme';
export const PATHS=Object.freeze({
  campaign:BASE+'/hsme-foundation-benchmark-campaign.v1.json',
  trust:BASE+'/hsme-foundation-benchmark-candidate-trust.v1.json',
  fixturePlan:BASE+'/hsme-foundation-benchmark-fixture-plan.v1.json',
  fixturePack:BASE+'/hsme-foundation-fixture-pack-evidence.v1.json',
  profiles:BASE+'/hsme-foundation-benchmark-execution-profiles.v1.json',
  generated:'tests/fixtures/hsme-foundation-generated-editing-v1/fixture-manifest.json',
  d6:'tests/fixtures/tiny-sd-d6-quality-corpus-v1.json',
});
export const SUBSTRATE_PATHS=Object.freeze(Object.values(PATHS));
const HEX40=/^[0-9a-f]{40}$/;
const HEX64=/^[0-9a-f]{64}$/;
const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};

function fail(code,message){const e=new Error(message);e.code=code;throw e;}
function sha256(bytes){return createHash('sha256').update(bytes).digest('hex');}
async function bytes(root,path){return readFile(join(root,path));}
async function json(root,path){return JSON.parse(await readFile(join(root,path),'utf8'));}

function assertFalse(value,name){if(value!==false)fail('hsme_executor_authority_widened',name+' must remain false');}
export function assertProfileSet(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('hsme_executor_profile_set_invalid','profile set must be an object');
  if(raw.schemaVersion!=='BERS_HSME_FOUNDATION_BENCHMARK_EXECUTION_PROFILE_SET_V1')fail('hsme_executor_profile_set_schema','profile set schema mismatch');
  if(raw.qualityPolicy!=='QUALITY_FLOOR_BEFORE_EFFICIENCY')fail('hsme_executor_quality_policy','quality policy drift');
  assertFalse(raw.candidateOutputsObserved,'candidateOutputsObserved');
  assertFalse(raw.efficiencyUsedInQualitySelection,'efficiencyUsedInQualitySelection');
  assertFalse(raw.productionAuthorityGranted,'productionAuthorityGranted');
  assertFalse(raw.winnerSelectionAllowed,'winnerSelectionAllowed');
  assertFalse(raw.trainingOrDistillationAllowed,'trainingOrDistillationAllowed');
  if(!raw.runtimeLocks||typeof raw.runtimeLocks!=='object'||Array.isArray(raw.runtimeLocks))fail('hsme_executor_runtime_locks_invalid','runtimeLocks invalid');
  if(!Array.isArray(raw.profiles)||raw.profiles.length!==6)fail('hsme_executor_profiles_invalid','profile set must contain six frozen candidates');
  return raw;
}
export function assertFixturePack(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('hsme_executor_fixture_pack_invalid','fixture pack must be an object');
  if(raw.schemaVersion!=='BERS_HSME_FOUNDATION_FIXTURE_PACK_EVIDENCE_V1')fail('hsme_executor_fixture_pack_schema','fixture pack schema mismatch');
  assertFalse(raw.candidateOutputsObserved,'fixturePack.candidateOutputsObserved');
  assertFalse(raw.privateUserDataAllowed,'fixturePack.privateUserDataAllowed');
  assertFalse(raw.productionAuthorityGranted,'fixturePack.productionAuthorityGranted');
  assertFalse(raw.winnerSelectionAllowed,'fixturePack.winnerSelectionAllowed');
  const seeds=raw?.sources?.outputSetContract?.requiredSeeds;
  if(!Array.isArray(seeds)||seeds.length<1||seeds.some(x=>!Number.isSafeInteger(x)||x<0||x>0xffffffff))fail('hsme_executor_seed_set_invalid','frozen requiredSeeds invalid');
  return raw;
}

export async function proveSubstrateIdentity(candidateRoot,controllerRoot){
  const digests={};
  for(const path of SUBSTRATE_PATHS){
    const [a,b]=await Promise.all([bytes(candidateRoot,path),bytes(controllerRoot,path)]);
    const ad=sha256(a),bd=sha256(b);
    if(ad!==bd)fail('hsme_executor_stale_substrate','candidate substrate differs from current accepted main: '+path);
    digests[path]=ad;
  }
  return Object.freeze(digests);
}

function parseFragment(sourceRef,key){
  const marker=key+'=';
  const i=sourceRef.indexOf(marker);
  if(i<0)return null;
  const tail=sourceRef.slice(i+marker.length);
  const end=tail.indexOf(';');
  return end<0?tail:tail.slice(0,end);
}
function promptDigest(text){return sha256(Buffer.from(text,'utf8'));}
function repoRelative(value,name){
  if(typeof value!=='string'||value.length<1||value.length>320||value.startsWith('/')||value.includes('\\'))fail('hsme_executor_repo_path_invalid',name+' must be a repository-relative path');
  const parts=value.split('/');
  if(parts.some(part=>part===''||part==='.'||part==='..'))fail('hsme_executor_repo_path_invalid',name+' contains unsafe path segment');
  return value;
}

export function resolveFixtureInputs(fixturePlan,fixturePack,generated,d6,capability){
  const generatedAssets=new Map(generated.assets.map(x=>[x.relativePath,x]));
  const editingCases=new Map(generated.cases.map(x=>[x.caseId,x]));
  const generatedT2i=new Map(generated.t2iSupplement.map(x=>[x.fixtureId,x]));
  const d6Prompts=new Map(d6.prompts.map(x=>[x.promptId,x]));
  const out=[];
  for(const asset of fixturePlan.assets.filter(x=>x.capability===capability)){
    if(asset.rightsConclusion!=='ADMITTED'||!HEX64.test(asset.contentSha256)||!HEX64.test(asset.promptOrInstructionSha256)){
      fail('hsme_executor_fixture_not_admitted','fixture not fully admitted: '+asset.fixtureId);
    }
    if(capability==='TEXT_TO_IMAGE'){
      let prompt;
      const promptId=parseFragment(asset.sourceRef,'prompt');
      if(promptId){
        const source=d6Prompts.get(promptId);
        if(!source)fail('hsme_executor_prompt_missing','D6 prompt missing: '+asset.fixtureId);
        prompt=source.prompt;
      }else{
        const source=generatedT2i.get(asset.fixtureId);
        if(!source)fail('hsme_executor_prompt_missing','generated T2I prompt missing: '+asset.fixtureId);
        prompt=source.prompt;
      }
      const digest=promptDigest(prompt);
      if(digest!==asset.promptOrInstructionSha256||digest!==asset.contentSha256)fail('hsme_executor_prompt_digest_mismatch','prompt digest mismatch: '+asset.fixtureId);
      out.push(Object.freeze({fixtureId:asset.fixtureId,capability,prompt,instruction:null,references:Object.freeze([]),promptOrInstructionSha256:digest}));
      continue;
    }
    const caseId=parseFragment(asset.sourceRef,'case');
    const editCase=editingCases.get(caseId);
    if(!editCase)fail('hsme_executor_edit_case_missing','editing case missing: '+asset.fixtureId);
    const instructionSha=promptDigest(editCase.instruction);
    if(instructionSha!==asset.promptOrInstructionSha256||instructionSha!==editCase.instructionSha256)fail('hsme_executor_instruction_digest_mismatch','instruction digest mismatch: '+asset.fixtureId);
    const references=editCase.referenceOrder.map(relativePath=>{
      const ref=generatedAssets.get(relativePath);
      if(!ref||ref.privateUserData!==false||ref.rightsConclusion!=='ADMITTED'||!HEX64.test(ref.contentSha256))fail('hsme_executor_reference_invalid','editing reference invalid: '+relativePath);
      return Object.freeze({relativePath,contentSha256:ref.contentSha256});
    });
    if(references.length<1)fail('hsme_executor_reference_missing','editing fixture has no references: '+asset.fixtureId);
    out.push(Object.freeze({fixtureId:asset.fixtureId,capability,prompt:null,instruction:editCase.instruction,references:Object.freeze(references),promptOrInstructionSha256:instructionSha}));
  }
  out.sort((a,b)=>a.fixtureId.localeCompare(b.fixtureId));
  if(out.length===0)fail('hsme_executor_fixture_set_empty','no fixtures for capability '+capability);
  return Object.freeze(out);
}

export function terminalRow(plan,status){
  return normalizeHsmeFoundationBenchmarkCandidateRunV1({
    candidateId:plan.candidateId,
    capability:plan.capability,
    status,
    immutableRevision:plan.immutableRevision,
    modelContentSha256:plan.modelContentSha256,
    executionProfileSha256:plan.executionProfileSha256,
    rightsEvidenceSha256:plan.rightsEvidenceSha256,
    runtimeInventorySha256:'UNKNOWN',
    outputSetSha256:'UNKNOWN',
    reviewPackageSha256:'UNKNOWN',
    failureEvidenceSha256:'UNKNOWN',
    outputs:[],
  });
}

export async function buildExecutionPlan(args){
  const candidateRoot=resolve(args.candidateRoot);
  const controllerRoot=resolve(args.controllerRoot);
  const {candidateSha,controllerMainSha,candidateId,capability}=args;
  if(!HEX40.test(candidateSha)||!HEX40.test(controllerMainSha))fail('hsme_executor_commit_sha_invalid','candidate/controller SHA must be 40 lowercase hex');
  if(!['TEXT_TO_IMAGE','IMAGE_EDITING'].includes(capability))fail('hsme_executor_capability_invalid','unsupported benchmark capability');

  const substrateDigests=await proveSubstrateIdentity(candidateRoot,controllerRoot);
  const [campaignRaw,trustRaw,fixtureRaw,packRaw,profilesRaw,generated,d6]=await Promise.all([
    json(candidateRoot,PATHS.campaign),json(candidateRoot,PATHS.trust),json(candidateRoot,PATHS.fixturePlan),
    json(candidateRoot,PATHS.fixturePack),json(candidateRoot,PATHS.profiles),json(candidateRoot,PATHS.generated),json(candidateRoot,PATHS.d6),
  ]);
  const campaign=normalizeHsmeFoundationBenchmarkCampaignV1(campaignRaw);
  const trust=normalizeHsmeFoundationBenchmarkCandidateTrustV1(trustRaw);
  const fixturePlan=normalizeHsmeFoundationFixturePlanV1(fixtureRaw);
  const fixturePack=assertFixturePack(packRaw);
  const profileSet=assertProfileSet(profilesRaw);
  if(trust.state!=='PINNED'||fixturePlan.state!=='PINNED'||campaign.fixturePack.state!=='PINNED')fail('hsme_executor_substrate_not_pinned','campaign/trust/fixtures must be PINNED');

  const [campaignDigest,fixturePlanDigest,trustProof]=await Promise.all([
    hsmeFoundationBenchmarkCampaignV1Digest(campaign,hashPort),
    hsmeFoundationFixturePlanDigestV1(fixturePlan,hashPort),
    proveHsmeFoundationBenchmarkCandidateTrustV1(campaign,trust,hashPort),
  ]);
  if(trustProof.state!=='PINNED'||trustProof.campaignDigest!==campaignDigest)fail('hsme_executor_trust_proof_invalid','PINNED trust proof required');
  if(fixturePack.fixturePlanSha256!==fixturePlanDigest)fail('hsme_executor_fixture_plan_digest_mismatch','fixture pack not bound to fixture plan');

  const candidate=campaign.candidates.find(x=>x.candidateId===candidateId);
  const trustEntry=trust.candidates.find(x=>x.candidateId===candidateId);
  const proofEntry=trustProof.entries.find(x=>x.candidateId===candidateId);
  const profileEntry=profileSet.profiles.find(x=>x.candidateId===candidateId);
  if(!candidate||!trustEntry||!proofEntry||!profileEntry)fail('hsme_executor_candidate_binding_missing','candidate missing from frozen evidence');
  if(!hsmeFoundationBenchmarkCandidateMayRunV1(campaign,candidateId)||proofEntry.benchmarkRunnable!==true)fail('hsme_executor_candidate_not_runnable','candidate is not benchmark-runnable');

  const profile=normalizeHsmeFoundationBenchmarkExecutionProfileV1(profileEntry.executionProfile);
  const profileDigest=await hsmeFoundationBenchmarkExecutionProfileDigestV1(profile,hashPort);
  if(profileDigest!==candidate.executionProfileSha256||profileDigest!==proofEntry.executionProfileSha256||profileEntry.executionProfileSha256!==profileDigest)fail('hsme_executor_profile_digest_mismatch','execution profile binding mismatch');
  if(proofEntry.modelContentSha256!==candidate.modelContentSha256||proofEntry.rightsEvidenceSha256!==candidate.rightsEvidenceSha256)fail('hsme_executor_trust_candidate_mismatch','trust digest binding mismatch');
  if(profile.state!=='PINNED'||profile.remoteCodePolicy!=='NO_MODEL_REPOSITORY_RUNTIME_CODE')fail('hsme_executor_remote_code_policy_invalid','PINNED no-remote-code profile required');

  const runtimeLock=profileSet.runtimeLocks[profileEntry.runtimeLockId];
  if(!runtimeLock||runtimeLock.lockSha256!==profile.toolchainLockSha256||!HEX64.test(runtimeLock.lockSha256))fail('hsme_executor_runtime_lock_mismatch','runtime lock/profile mismatch');

  const supported=candidate.capabilities.includes(capability);
  let disposition=supported?'EXECUTE':'NOT_APPLICABLE';
  let sanaParity=null;
  if(supported&&candidateId==='sana-sprint-0.6b-split-v1'&&capability==='TEXT_TO_IMAGE'){
    const planPath=args.sanaPlanPath?repoRelative(args.sanaPlanPath,'sanaPlanPath'):null;
    const evidencePath=args.sanaEvidencePath?repoRelative(args.sanaEvidencePath,'sanaEvidencePath'):null;
    if(!planPath||!evidencePath||!existsSync(join(candidateRoot,planPath))||!existsSync(join(candidateRoot,evidencePath))){
      disposition='BLOCKED_PARITY_PENDING';
    }else{
      const [rawPlan,rawEvidence]=await Promise.all([json(candidateRoot,planPath),json(candidateRoot,evidencePath)]);
      const normalizedPlan=normalizeHsmeSanaConditioningParityPlanV1(rawPlan);
      const proof=await proveHsmeSanaConditioningParityEvidenceV1(rawPlan,rawEvidence,hashPort);
      if(normalizedPlan.sanaSnapshot.sourceRoot!==candidate.sourceRoot||normalizedPlan.sanaSnapshot.immutableRevision!==candidate.immutableRevision||normalizedPlan.sanaSnapshot.contentSha256!==candidate.modelContentSha256)fail('hsme_executor_sana_parity_identity_mismatch','SANA parity evidence does not bind frozen candidate');
      if(proof.exactParityAccepted!==true)disposition='BLOCKED_PARITY_PENDING';
      sanaParity=Object.freeze({outcome:proof.outcome,exactParityAccepted:proof.exactParityAccepted,planDigest:proof.planDigest,generationConfigSha256:proof.generationConfigSha256});
    }
  }

  const fixtures=resolveFixtureInputs(fixturePlan,fixturePack,generated,d6,capability);
  const requiredSeeds=Object.freeze([...fixturePack.sources.outputSetContract.requiredSeeds]);
  const runtimeArtifacts=disposition==='EXECUTE'
    ? Object.freeze(trustEntry.artifactManifest.artifacts.filter(x=>x.runtimeRequired).map(x=>{
        if(x.source.sourceRoot!==candidate.sourceRoot||x.source.immutableRevision!==candidate.immutableRevision||!HEX64.test(x.contentSha256)||!Number.isSafeInteger(x.bytes)||x.bytes<0||x.role==='RUNTIME_CODE')fail('hsme_executor_runtime_artifact_invalid','invalid runtime artifact '+x.relativePath);
        return Object.freeze({sourceRoot:x.source.sourceRoot,immutableRevision:x.source.immutableRevision,relativePath:x.relativePath,role:x.role,bytes:x.bytes,contentSha256:x.contentSha256});
      }))
    : Object.freeze([]);

  return Object.freeze({
    schemaVersion:EXECUTION_PLAN_SCHEMA,
    candidateSha,controllerMainSha,campaignId:campaign.campaignId,campaignDigest,fixturePlanDigest,
    fixtureSetSha256:campaign.fixturePack.fixtureSetSha256,outputSetContractSha256:campaign.fixturePack.outputSetContractSha256,
    candidateId,capability,disposition,
    immutableRevision:candidate.immutableRevision,modelContentSha256:candidate.modelContentSha256,
    executionProfileSha256:candidate.executionProfileSha256,rightsEvidenceSha256:candidate.rightsEvidenceSha256,
    runtimeLockId:profileEntry.runtimeLockId,runtimeLock,sourceSpec:profileEntry.sourceSpec,executionProfile:profile,
    runtimeArtifacts,fixtures,requiredSeeds,sanaParity,substrateDigests,
    ordinaryCiModelExecutionAllowed:false,productionAuthorityGranted:false,providerAuthorityGranted:false,billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,aeeExecutionAuthorityGranted:false,durableModelFleetPromotionAllowed:false,
    trainingOrDistillationAllowed:false,winnerSelectionAllowed:false,
  });
}

function parseArgs(argv){const out={};for(let i=0;i<argv.length;i+=2){const key=argv[i];const value=argv[i+1];if(!key?.startsWith('--')||value===undefined)fail('hsme_executor_cli_invalid','invalid CLI arguments');out[key.slice(2)]=value;}return out;}
async function main(){
  const [command,...rest]=process.argv.slice(2);
  if(command!=='plan')fail('hsme_executor_cli_invalid','expected plan command');
  const a=parseArgs(rest);
  for(const k of ['candidate-root','controller-root','candidate-sha','controller-main-sha','candidate-id','capability','out'])if(!a[k])fail('hsme_executor_cli_invalid','missing --'+k);
  const plan=await buildExecutionPlan({
    candidateRoot:a['candidate-root'],controllerRoot:a['controller-root'],candidateSha:a['candidate-sha'],controllerMainSha:a['controller-main-sha'],
    candidateId:a['candidate-id'],capability:a.capability,sanaPlanPath:a['sana-plan'],sanaEvidencePath:a['sana-evidence'],
  });
  await writeFile(a.out,JSON.stringify(plan,null,2)+'\n');
  if(plan.disposition!=='EXECUTE'){
    if(!a['terminal-row-out'])fail('hsme_executor_cli_invalid','non-execute plan requires --terminal-row-out');
    const status=plan.disposition==='NOT_APPLICABLE'?'NOT_APPLICABLE':'BLOCKED_PARITY_PENDING';
    await writeFile(a['terminal-row-out'],JSON.stringify(terminalRow(plan,status),null,2)+'\n');
  }
  process.stdout.write(JSON.stringify({disposition:plan.disposition,pythonVersion:String(plan.runtimeLock.python||''),runtimeLockId:plan.runtimeLockId})+'\n');
}
if(process.env.HSME_FOUNDATION_EXECUTOR_CLI==='1')main().catch(e=>{process.stderr.write((e.code||'hsme_executor_error')+': '+e.message+'\n');process.exitCode=1;});
