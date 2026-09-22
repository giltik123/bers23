import {createHash} from 'node:crypto';
import {lstat,mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve,sep} from 'node:path';

import {
  HSME_FOUNDATION_RESOURCE_EVIDENCE_V1_SCHEMA,
  hsmeFoundationResourceEvidenceV1Digest,
  normalizeHsmeFoundationResourceMeasurementV1,
  proveHsmeFoundationResourceEvidenceV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationResourceEvidenceV1.ts';
import {
  hsmeFoundationBenchmarkRunEvidenceV1Digest,
  normalizeHsmeFoundationBenchmarkRunEvidenceV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkRunEvidenceV1.ts';
import {verifyResourceFragment} from './hsme-foundation-resource-fragment-verify.mjs';

export const RESOURCE_BUNDLE_MANIFEST_SCHEMA='BERS_HSME_FOUNDATION_RESOURCE_FRAGMENT_BUNDLE_MANIFEST_V1';
export const RESOURCE_ASSEMBLY_PROOF_SCHEMA='BERS_HSME_FOUNDATION_RESOURCE_EVIDENCE_ASSEMBLY_PROOF_V1';

const REQUIRED_FILES=Object.freeze([
  'candidate-run.json',
  'execution-plan.json',
  'resource-hardware-profile.json',
  'resource-measurement-evidence.json',
  'resource-measurement-method.json',
  'resource-measurement.json',
  'runtime-inventory.json',
]);
const HEX64=/^[0-9a-f]{64}$/;

export class HsmeFoundationResourceAssemblerError extends Error{
  constructor(code,message){super(message);this.name='HsmeFoundationResourceAssemblerError';this.code=code;}
}
function fail(code,message){throw new HsmeFoundationResourceAssemblerError(code,message);}
function lexical(a,b){return a<b?-1:a>b?1:0;}
function stableJson(value){return JSON.stringify(value,null,2)+'\n';}
function sha256Bytes(value){return createHash('sha256').update(value).digest('hex');}
async function sha256File(path){return sha256Bytes(await readFile(path));}
const hashPort={sha256:async bytes=>sha256Bytes(bytes)};

function exactRecord(raw,keys,path){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('hsme_resource_assembler_shape',path+' must be object');
  const actual=Object.keys(raw).sort(lexical);
  const expected=[...keys].sort(lexical);
  if(JSON.stringify(actual)!==JSON.stringify(expected))fail('hsme_resource_assembler_shape',path+' keys mismatch');
  return raw;
}
function safeInteger(value,path){
  if(!Number.isSafeInteger(value)||value<1)fail('hsme_resource_assembler_integer',path+' must be positive safe integer');
  return value;
}
function safeName(value,path,max=180){
  if(typeof value!=='string'||value.length<1||value.length>max||!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)){
    fail('hsme_resource_assembler_name',path+' invalid');
  }
  return value;
}
function safeRelativePath(value,path){
  if(typeof value!=='string'||value.length<1||value.length>512||value.startsWith('/')||value.includes('\\')){
    fail('hsme_resource_assembler_path',path+' invalid');
  }
  const parts=value.split('/');
  if(parts.some(part=>!part||part==='.'||part==='..'))fail('hsme_resource_assembler_path',path+' invalid');
  return value;
}
function inside(root,path){
  const r=resolve(root);
  const p=resolve(path);
  return p===r||p.startsWith(r+sep);
}
async function loadJson(path){return JSON.parse(await readFile(path,'utf8'));}

export function normalizeResourceBundleManifestV1(raw){
  const value=exactRecord(raw,[
    'schemaVersion','campaignId','bundles',
    'productionAuthorityGranted','winnerSelectionAllowed',
  ],'bundleManifest');
  if(value.schemaVersion!==RESOURCE_BUNDLE_MANIFEST_SCHEMA)fail('hsme_resource_assembler_manifest_schema','bundle manifest schema mismatch');
  if(typeof value.campaignId!=='string'||value.campaignId.length<1)fail('hsme_resource_assembler_campaign','bundle manifest campaign invalid');
  if(value.productionAuthorityGranted!==false||value.winnerSelectionAllowed!==false){
    fail('hsme_resource_assembler_authority','bundle manifest authority must remain false');
  }
  if(!Array.isArray(value.bundles)||value.bundles.length<1||value.bundles.length>16){
    fail('hsme_resource_assembler_bundles','bundle manifest requires 1..16 bundles');
  }
  const bundles=value.bundles.map((rawRow,index)=>{
    const row=exactRecord(rawRow,['workflowRunId','artifactId','artifactName','bundlePath'],'bundleManifest.bundles['+index+']');
    return Object.freeze({
      workflowRunId:safeInteger(row.workflowRunId,'workflowRunId'),
      artifactId:safeInteger(row.artifactId,'artifactId'),
      artifactName:safeName(row.artifactName,'artifactName'),
      bundlePath:safeRelativePath(row.bundlePath,'bundlePath'),
    });
  });
  const provenanceKeys=bundles.map(x=>x.workflowRunId+'\0'+x.artifactId);
  if(new Set(provenanceKeys).size!==provenanceKeys.length)fail('hsme_resource_assembler_duplicate_provenance','duplicate workflow/artifact provenance');
  if(new Set(bundles.map(x=>x.bundlePath)).size!==bundles.length)fail('hsme_resource_assembler_duplicate_bundle_path','bundle paths must be unique');
  return Object.freeze({
    schemaVersion:RESOURCE_BUNDLE_MANIFEST_SCHEMA,
    campaignId:value.campaignId,
    bundles:Object.freeze(bundles),
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  });
}

async function verifyBundleRoot(artifactRoot,bundlePath){
  const root=resolve(artifactRoot);
  const dir=resolve(root,bundlePath);
  if(!inside(root,dir))fail('hsme_resource_assembler_path_escape','bundle path escapes artifact root');
  let stat;
  try{stat=await lstat(dir);}catch{fail('hsme_resource_assembler_bundle_missing','bundle path does not exist');}
  if(!stat.isDirectory()||stat.isSymbolicLink())fail('hsme_resource_assembler_bundle_type','bundle path must be a real directory');
  const names=(await readdir(dir)).sort(lexical);
  if(JSON.stringify(names)!==JSON.stringify(REQUIRED_FILES)){
    fail('hsme_resource_assembler_bundle_files','resource bundle must contain exactly the seven approved JSON files');
  }
  for(const name of names){
    const file=join(dir,name);
    const st=await lstat(file);
    if(!st.isFile()||st.isSymbolicLink())fail('hsme_resource_assembler_file_type','bundle file must be regular and non-symlink: '+name);
  }
  return dir;
}

export async function assembleHsmeFoundationResourceEvidenceV1({
  artifactRoot,
  rawManifest,
  rawCampaign,
  rawTrust,
  rawFixturePlan,
  rawFixturePackEvidence,
  rawRunEvidence,
}){
  const manifest=normalizeResourceBundleManifestV1(rawManifest);
  const runEvidence=normalizeHsmeFoundationBenchmarkRunEvidenceV1(rawRunEvidence);
  if(manifest.campaignId!==runEvidence.campaignId)fail('hsme_resource_assembler_campaign','bundle manifest campaign differs from run evidence');

  const runEvidenceSha256=await hsmeFoundationBenchmarkRunEvidenceV1Digest(runEvidence,hashPort);
  const canonicalBundleManifest={
    schemaVersion:manifest.schemaVersion,
    campaignId:manifest.campaignId,
    bundles:[...manifest.bundles].sort((a,b)=>a.workflowRunId-b.workflowRunId||a.artifactId-b.artifactId||lexical(a.bundlePath,b.bundlePath)),
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
  const bundleManifestSha256=sha256Bytes(stableJson(canonicalBundleManifest));
  const completeRuns=runEvidence.runs.filter(x=>x.status==='COMPLETE');
  const expectedKeys=completeRuns.map(x=>x.candidateId+'\0'+x.capability).sort(lexical);

  const records=[];
  const fragments=[];
  const actualKeys=[];
  for(const source of manifest.bundles){
    const bundleDir=await verifyBundleRoot(artifactRoot,source.bundlePath);
    const paths={
      plan:join(bundleDir,'execution-plan.json'),
      run:join(bundleDir,'candidate-run.json'),
      inventory:join(bundleDir,'runtime-inventory.json'),
      resource:join(bundleDir,'resource-measurement.json'),
      hardware:join(bundleDir,'resource-hardware-profile.json'),
      method:join(bundleDir,'resource-measurement-method.json'),
      evidence:join(bundleDir,'resource-measurement-evidence.json'),
    };
    const verified=await verifyResourceFragment({
      planPath:paths.plan,
      runPath:paths.run,
      inventoryPath:paths.inventory,
      resourcePath:paths.resource,
      hardwareProfilePath:paths.hardware,
      measurementMethodPath:paths.method,
      measurementEvidencePath:paths.evidence,
    });
    const fragment=await loadJson(paths.resource);
    const root=exactRecord(fragment,['schemaVersion','campaignId','record','productionAuthorityGranted','winnerSelectionAllowed'],'resourceFragment');
    if(root.schemaVersion!=='BERS_HSME_FOUNDATION_RESOURCE_MEASUREMENT_FRAGMENT_V1'||root.campaignId!==runEvidence.campaignId){
      fail('hsme_resource_assembler_fragment_campaign','resource fragment schema/campaign mismatch');
    }
    if(root.productionAuthorityGranted!==false||root.winnerSelectionAllowed!==false){
      fail('hsme_resource_assembler_fragment_authority','resource fragment authority must remain false');
    }
    const record=normalizeHsmeFoundationResourceMeasurementV1(root.record);
    if(record.candidateId!==verified.candidateId||record.capability!==verified.capability){
      fail('hsme_resource_assembler_verified_identity','verified resource fragment identity mismatch');
    }
    const key=record.candidateId+'\0'+record.capability;
    if(actualKeys.includes(key))fail('hsme_resource_assembler_duplicate_record','duplicate candidate/capability resource fragment');
    actualKeys.push(key);
    records.push(record);

    const files=[];
    for(const name of REQUIRED_FILES){
      files.push(Object.freeze({name,sha256:await sha256File(join(bundleDir,name))}));
    }
    fragments.push(Object.freeze({
      candidateId:record.candidateId,
      capability:record.capability,
      workflowRunId:source.workflowRunId,
      artifactId:source.artifactId,
      artifactName:source.artifactName,
      files:Object.freeze(files),
    }));
  }

  const sortedActual=[...actualKeys].sort(lexical);
  if(JSON.stringify(sortedActual)!==JSON.stringify(expectedKeys)){
    fail('hsme_resource_assembler_roster','resource bundles must cover every COMPLETE run exactly once and no other row');
  }

  records.sort((a,b)=>lexical(a.candidateId,b.candidateId)||lexical(a.capability,b.capability));
  const resourceEvidence=Object.freeze({
    schemaVersion:HSME_FOUNDATION_RESOURCE_EVIDENCE_V1_SCHEMA,
    campaignId:runEvidence.campaignId,
    campaignDigest:runEvidence.campaignDigest,
    runEvidenceSha256,
    records:Object.freeze(records),
    qualityScoringAllowed:false,
    qualityOrderingMutationAllowed:false,
    aggregateEfficiencyScoreAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,
    trainingOrDistillationAllowed:false,
    winnerSelectionAllowed:false,
  });

  const resourceProof=await proveHsmeFoundationResourceEvidenceV1(
    rawCampaign,rawTrust,rawFixturePlan,rawFixturePackEvidence,rawRunEvidence,resourceEvidence,hashPort,
  );
  const resourceEvidenceProofSha256=await hsmeFoundationResourceEvidenceV1Digest(resourceProof,hashPort);
  const resourceEvidenceFileSha256=sha256Bytes(stableJson(resourceEvidence));
  fragments.sort((a,b)=>lexical(a.candidateId,b.candidateId)||lexical(a.capability,b.capability));

  const assemblyProof=Object.freeze({
    schemaVersion:RESOURCE_ASSEMBLY_PROOF_SCHEMA,
    campaignId:runEvidence.campaignId,
    runEvidenceSha256,
    bundleManifestSha256,
    resourceEvidenceFileSha256,
    resourceEvidenceProofSha256,
    fragments:Object.freeze(fragments),
    inputOrderCanonicalized:true,
    imageBytesIncluded:false,
    reviewArtifactsIncluded:false,
    modelExecutionAllowed:false,
    qualityScoringAllowed:false,
    aggregateEfficiencyScoreAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,
    trainingOrDistillationAllowed:false,
    winnerSelectionAllowed:false,
  });
  return Object.freeze({resourceEvidence,resourceProof,assemblyProof});
}

function parseArgs(argv){
  const out={};
  for(let i=0;i<argv.length;i+=2){
    if(!argv[i]?.startsWith('--')||argv[i+1]===undefined)fail('hsme_resource_assembler_args','invalid CLI arguments');
    out[argv[i].slice(2)]=argv[i+1];
  }
  for(const key of ['artifact-root','manifest','campaign','trust','fixture-plan','fixture-pack-evidence','run-evidence','out','proof-out']){
    if(!out[key])fail('hsme_resource_assembler_args','missing --'+key);
  }
  return out;
}

if(process.env.HSME_FOUNDATION_RESOURCE_ASSEMBLER_CLI==='1'){
  const a=parseArgs(process.argv.slice(2));
  const [manifest,campaign,trust,fixturePlan,fixturePackEvidence,runEvidence]=await Promise.all([
    loadJson(a.manifest),loadJson(a.campaign),loadJson(a.trust),loadJson(a['fixture-plan']),
    loadJson(a['fixture-pack-evidence']),loadJson(a['run-evidence']),
  ]);
  const result=await assembleHsmeFoundationResourceEvidenceV1({
    artifactRoot:a['artifact-root'],
    rawManifest:manifest,
    rawCampaign:campaign,
    rawTrust:trust,
    rawFixturePlan:fixturePlan,
    rawFixturePackEvidence:fixturePackEvidence,
    rawRunEvidence:runEvidence,
  });
  await mkdir(dirname(resolve(a.out)),{recursive:true});
  await mkdir(dirname(resolve(a['proof-out'])),{recursive:true});
  await writeFile(a.out,stableJson(result.resourceEvidence),'utf8');
  await writeFile(a['proof-out'],stableJson(result.assemblyProof),'utf8');
  const outputSha=sha256Bytes(await readFile(a.out));
  if(outputSha!==result.assemblyProof.resourceEvidenceFileSha256)fail('hsme_resource_assembler_output_digest','written resource evidence digest drift');
  process.stdout.write(JSON.stringify({
    campaignId:result.assemblyProof.campaignId,
    runEvidenceSha256:result.assemblyProof.runEvidenceSha256,
    bundleManifestSha256:result.assemblyProof.bundleManifestSha256,
    resourceEvidenceFileSha256:result.assemblyProof.resourceEvidenceFileSha256,
    resourceEvidenceProofSha256:result.assemblyProof.resourceEvidenceProofSha256,
  })+'\n');
}
