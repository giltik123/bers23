import {createHash} from 'node:crypto';
import {lstat,readFile,readdir,realpath,writeFile} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';

import {
  normalizeHsmeFoundationBenchmarkCampaignV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkCampaignV1.ts';
import {
  hsmeFoundationBenchmarkRunEvidenceV1Digest,
  normalizeHsmeFoundationBenchmarkRunEvidenceV1,
  proveHsmeFoundationBenchmarkRunEvidenceV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkRunEvidenceV1.ts';
import {
  HSME_FOUNDATION_RESOURCE_EVIDENCE_V1_SCHEMA,
  hsmeFoundationResourceEvidenceV1Digest,
  normalizeHsmeFoundationResourceMeasurementV1,
  proveHsmeFoundationResourceEvidenceV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationResourceEvidenceV1.ts';
import {
  verifyResourceFragment,
} from './hsme-foundation-resource-fragment-verify.mjs';

export const HSME_FOUNDATION_RESOURCE_COLLECTION_MANIFEST_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_RESOURCE_COLLECTION_MANIFEST_V1';
export const HSME_FOUNDATION_RESOURCE_COLLECTION_REPORT_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_RESOURCE_COLLECTION_REPORT_V1';

const PATHS=Object.freeze({
  campaign:'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json',
  trust:'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-candidate-trust.v1.json',
  fixturePlan:'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-fixture-plan.v1.json',
  fixturePack:'src/platform/creative/local-ai/hsme/hsme-foundation-fixture-pack-evidence.v1.json',
});
const FILES=Object.freeze([
  'execution-plan.json',
  'candidate-run.json',
  'runtime-inventory.json',
  'resource-measurement.json',
  'resource-hardware-profile.json',
  'resource-measurement-method.json',
  'resource-measurement-evidence.json',
]);
const HEX64=/^[0-9a-f]{64}$/;
const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};

function fail(code,message){const e=new Error(message);e.code=code;throw e;}
function lexical(a,b){return a<b?-1:a>b?1:0;}
function stable(value){return JSON.stringify(value,null,2)+'\n';}
function sha256(bytes){return createHash('sha256').update(bytes).digest('hex');}
async function loadJson(path){return JSON.parse(await readFile(path,'utf8'));}
async function fileDigest(path){return sha256(await readFile(path));}
function key(candidateId,capability){return candidateId+'\0'+capability;}
function displayKey(candidateId,capability){return candidateId+'::'+capability;}
function safePositiveInteger(value,path){
  if(!Number.isSafeInteger(value)||value<1)fail('hsme_resource_collector_integer',path+' must be positive safe integer');
  return value;
}
function safeName(value,path,max=180){
  if(typeof value!=='string'||value.length<1||value.length>max||!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)){
    fail('hsme_resource_collector_name',path+' invalid');
  }
  return value;
}
function exactKeys(value,keys,path){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('hsme_resource_collector_shape',path+' must be object');
  const actual=Object.keys(value).sort(),expected=[...keys].sort();
  if(JSON.stringify(actual)!==JSON.stringify(expected))fail('hsme_resource_collector_shape',path+' keys mismatch');
  return value;
}
function safeRel(value,path){
  if(typeof value!=='string'||value.length<1||value.length>420||value.startsWith('/')||value.includes('\\'))fail('hsme_resource_collector_path',path+' invalid');
  const parts=value.split('/');
  if(parts.some(x=>!x||x==='.'||x==='..'))fail('hsme_resource_collector_path',path+' unsafe');
  return value;
}
async function contained(root,relative,path){
  const rootReal=await realpath(root);
  const candidate=resolve(rootReal,safeRel(relative,path));
  let stat;
  try{stat=await lstat(candidate);}catch{fail('hsme_resource_collector_path_missing',path+' missing');}
  if(stat.isSymbolicLink())fail('hsme_resource_collector_symlink',path+' may not be symlink');
  if(!stat.isDirectory())fail('hsme_resource_collector_bundle_type',path+' must be a real directory');
  const real=await realpath(candidate);
  if(real!==rootReal&&!real.startsWith(rootReal+sep))fail('hsme_resource_collector_escape',path+' escapes artifact root');
  return real;
}
async function assertExactBundleRoster(dir){
  const entries=await readdir(dir,{withFileTypes:true});
  const names=[];
  for(const entry of entries){
    if(entry.isSymbolicLink()||!entry.isFile())fail('hsme_resource_collector_bundle_shape','resource bundle must contain regular files only');
    names.push(entry.name);
  }
  names.sort(lexical);
  const expected=[...FILES].sort(lexical);
  if(JSON.stringify(names)!==JSON.stringify(expected))fail('hsme_resource_collector_bundle_roster','resource bundle file roster mismatch');
}
function normalizeManifest(raw,campaignId){
  const record=exactKeys(raw,['schemaVersion','campaignId','rows','productionAuthorityGranted','winnerSelectionAllowed'],'manifest');
  if(record.schemaVersion!==HSME_FOUNDATION_RESOURCE_COLLECTION_MANIFEST_V1_SCHEMA)fail('hsme_resource_collector_manifest_schema','manifest schema mismatch');
  if(record.campaignId!==campaignId)fail('hsme_resource_collector_campaign','manifest campaign mismatch');
  if(record.productionAuthorityGranted!==false||record.winnerSelectionAllowed!==false)fail('hsme_resource_collector_authority','manifest authority must remain false');
  if(!Array.isArray(record.rows)||record.rows.length>16)fail('hsme_resource_collector_manifest_rows','manifest rows invalid');
  const rows=record.rows.map((rawRow,index)=>{
    const row=exactKeys(rawRow,['candidateId','capability','workflowRunId','artifactId','artifactName','bundlePath'],'manifest.rows['+index+']');
    if(typeof row.candidateId!=='string'||!row.candidateId)fail('hsme_resource_collector_candidate','candidateId invalid');
    if(!['TEXT_TO_IMAGE','IMAGE_EDITING'].includes(row.capability))fail('hsme_resource_collector_capability','capability invalid');
    const workflowRunId=safePositiveInteger(row.workflowRunId,'manifest.rows['+index+'].workflowRunId');
    const artifactId=safePositiveInteger(row.artifactId,'manifest.rows['+index+'].artifactId');
    const artifactName=safeName(row.artifactName,'manifest.rows['+index+'].artifactName');
    const expectedArtifactName='hsme-foundation-resource-evidence-'+workflowRunId;
    if(artifactName!==expectedArtifactName)fail('hsme_resource_collector_artifact_name','artifactName must bind exact workflowRunId');
    return Object.freeze({
      candidateId:row.candidateId,
      capability:row.capability,
      workflowRunId,
      artifactId,
      artifactName,
      bundlePath:safeRel(row.bundlePath,'manifest.rows['+index+'].bundlePath'),
    });
  });
  const keys=rows.map(x=>key(x.candidateId,x.capability));
  if(new Set(keys).size!==keys.length)fail('hsme_resource_collector_duplicate_key','duplicate candidate/capability resource row');
  if(new Set(rows.map(x=>x.workflowRunId)).size!==rows.length)fail('hsme_resource_collector_duplicate_run','workflowRunId must be unique');
  if(new Set(rows.map(x=>x.artifactId)).size!==rows.length)fail('hsme_resource_collector_duplicate_artifact','artifactId must be unique');
  if(new Set(rows.map(x=>x.bundlePath)).size!==rows.length)fail('hsme_resource_collector_duplicate_bundle_path','bundlePath must be unique');
  return Object.freeze({schemaVersion:record.schemaVersion,campaignId:record.campaignId,rows:Object.freeze([...rows].sort((a,b)=>lexical(key(a.candidateId,a.capability),key(b.candidateId,b.capability)))),productionAuthorityGranted:false,winnerSelectionAllowed:false});
}
async function verifyBundle(artifactRoot,row){
  const dir=await contained(artifactRoot,row.bundlePath,'bundlePath');
  await assertExactBundleRoster(dir);
  const paths={
    planPath:join(dir,'execution-plan.json'),
    runPath:join(dir,'candidate-run.json'),
    inventoryPath:join(dir,'runtime-inventory.json'),
    resourcePath:join(dir,'resource-measurement.json'),
    hardwareProfilePath:join(dir,'resource-hardware-profile.json'),
    measurementMethodPath:join(dir,'resource-measurement-method.json'),
    measurementEvidencePath:join(dir,'resource-measurement-evidence.json'),
  };
  const verified=await verifyResourceFragment(paths);
  if(verified.candidateId!==row.candidateId||verified.capability!==row.capability)fail('hsme_resource_collector_bundle_identity','verified bundle identity differs from manifest row');
  const fragment=await loadJson(paths.resourcePath);
  const record=normalizeHsmeFoundationResourceMeasurementV1(fragment.record);
  if(record.candidateId!==row.candidateId||record.capability!==row.capability)fail('hsme_resource_collector_record_identity','resource record identity differs from manifest');
  const files=[];
  for(const name of FILES)files.push({path:name,sha256:await fileDigest(join(dir,name))});
  files.sort((a,b)=>lexical(a.path,b.path));
  const evidenceSetSha256=sha256(Buffer.from(JSON.stringify(files),'utf8'));
  const sourceBase={
    candidateId:row.candidateId,
    capability:row.capability,
    workflowRunId:row.workflowRunId,
    artifactId:row.artifactId,
    artifactName:row.artifactName,
    bundlePath:row.bundlePath,
    evidenceSetSha256,
    files:Object.freeze(files),
  };
  const sourceSha256=sha256(Buffer.from(stable(sourceBase),'utf8'));
  return Object.freeze({
    record,
    source:Object.freeze({...sourceBase,sourceSha256}),
  });
}

export async function collectFoundationResourceEvidence(repoRoot,artifactRoot,rawRunEvidence,rawManifest){
  const root=resolve(repoRoot);
  const artifacts=resolve(artifactRoot);
  const [rawCampaign,rawTrust,rawFixturePlan,rawFixturePack]=await Promise.all([
    loadJson(join(root,PATHS.campaign)),
    loadJson(join(root,PATHS.trust)),
    loadJson(join(root,PATHS.fixturePlan)),
    loadJson(join(root,PATHS.fixturePack)),
  ]);
  const campaign=normalizeHsmeFoundationBenchmarkCampaignV1(rawCampaign);
  const runEvidence=normalizeHsmeFoundationBenchmarkRunEvidenceV1(rawRunEvidence);
  await proveHsmeFoundationBenchmarkRunEvidenceV1(rawCampaign,rawTrust,rawFixturePlan,rawFixturePack,runEvidence,hashPort);
  const runEvidenceSha256=await hsmeFoundationBenchmarkRunEvidenceV1Digest(runEvidence,hashPort);
  const completeRuns=runEvidence.runs.filter(x=>x.status==='COMPLETE');
  const expectedMap=new Map(completeRuns.map(x=>[key(x.candidateId,x.capability),x]));
  const expectedKeys=[...expectedMap.keys()].sort(lexical);
  let manifest;
  let collectionManifestSha256='UNKNOWN';
  try{
    manifest=normalizeManifest(rawManifest,campaign.campaignId);
    collectionManifestSha256=sha256(Buffer.from(stable(manifest),'utf8'));
  }catch(error){
    return Object.freeze({
      report:Object.freeze({
        schemaVersion:HSME_FOUNDATION_RESOURCE_COLLECTION_REPORT_V1_SCHEMA,
        campaignId:campaign.campaignId,
        runEvidenceSha256,
        state:'FAILED_EVIDENCE',
        expectedCompleteKeys:Object.freeze(expectedKeys.map(x=>x.replace('\0','::'))),
        verifiedKeys:Object.freeze([]),
        missingKeys:Object.freeze(expectedKeys.map(x=>x.replace('\0','::'))),
        rejected:Object.freeze([{candidateId:'UNKNOWN',capability:'UNKNOWN',workflowRunId:0,code:String(error?.code||'hsme_resource_collector_manifest_invalid')}]),
        sources:Object.freeze([]),
        collectionManifestSha256,
        resourceEvidenceSha256:'UNKNOWN',
        productionAuthorityGranted:false,
        providerAuthorityGranted:false,
        billingAuthorityGranted:false,
        projectArtifactMutationAllowed:false,
        aeeExecutionAuthorityGranted:false,
        durableModelFleetPromotionAllowed:false,
        trainingOrDistillationAllowed:false,
        winnerSelectionAllowed:false,
      }),
      evidence:null,
      proof:null,
    });
  }

  const verified=[];
  const rejected=[];

  for(const row of manifest.rows){
    const rowKey=key(row.candidateId,row.capability);
    if(!expectedMap.has(rowKey)){
      rejected.push({candidateId:row.candidateId,capability:row.capability,workflowRunId:row.workflowRunId,code:'hsme_resource_collector_unexpected_row'});
      continue;
    }
    try{
      const item=await verifyBundle(artifacts,row);
      const run=expectedMap.get(rowKey);
      const inventoryDigest=item.source.files.find(x=>x.path==='runtime-inventory.json')?.sha256;
      if(inventoryDigest!==run.runtimeInventorySha256)fail('hsme_resource_collector_run_inventory','bundle runtime inventory differs from canonical COMPLETE run');
      verified.push(item);
    }catch(error){
      rejected.push({candidateId:row.candidateId,capability:row.capability,workflowRunId:row.workflowRunId,code:String(error?.code||'hsme_resource_collector_bundle_invalid')});
    }
  }

  const verifiedKeys=verified.map(x=>key(x.record.candidateId,x.record.capability)).sort(lexical);
  const missingKeys=expectedKeys.filter(x=>!verifiedKeys.includes(x));
  const sources=verified.map(x=>x.source).sort((a,b)=>lexical(key(a.candidateId,a.capability),key(b.candidateId,b.capability)));
  const state=rejected.length>0?'FAILED_EVIDENCE':missingKeys.length>0?'RESOURCE_EVIDENCE_INCOMPLETE':'RESOURCE_EVIDENCE_COMPLETE';

  const baseReport={
    schemaVersion:HSME_FOUNDATION_RESOURCE_COLLECTION_REPORT_V1_SCHEMA,
    campaignId:campaign.campaignId,
    runEvidenceSha256,
    state,
    expectedCompleteKeys:Object.freeze(expectedKeys.map(x=>x.replace('\0','::'))),
    verifiedKeys:Object.freeze(verifiedKeys.map(x=>x.replace('\0','::'))),
    missingKeys:Object.freeze(missingKeys.map(x=>x.replace('\0','::'))),
    rejected:Object.freeze(rejected),
    sources:Object.freeze(sources),
    collectionManifestSha256,
    resourceEvidenceSha256:'UNKNOWN',
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,
    trainingOrDistillationAllowed:false,
    winnerSelectionAllowed:false,
  };

  if(state!=='RESOURCE_EVIDENCE_COMPLETE'){
    return Object.freeze({report:Object.freeze(baseReport),evidence:null,proof:null});
  }

  const rawEvidence={
    schemaVersion:HSME_FOUNDATION_RESOURCE_EVIDENCE_V1_SCHEMA,
    campaignId:campaign.campaignId,
    campaignDigest:runEvidence.campaignDigest,
    runEvidenceSha256,
    records:verified.map(x=>x.record),
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
  };
  const proof=await proveHsmeFoundationResourceEvidenceV1(
    rawCampaign,rawTrust,rawFixturePlan,rawFixturePack,runEvidence,rawEvidence,hashPort,
  );
  const resourceEvidenceSha256=await hsmeFoundationResourceEvidenceV1Digest(proof,hashPort);
  const report=Object.freeze({...baseReport,resourceEvidenceSha256});
  return Object.freeze({report,evidence:Object.freeze(rawEvidence),proof});
}

function args(argv){
  const out={};
  for(let i=0;i<argv.length;i+=2){
    if(!argv[i]?.startsWith('--')||argv[i+1]===undefined)fail('hsme_resource_collector_cli','invalid args');
    out[argv[i].slice(2)]=argv[i+1];
  }
  return out;
}
async function main(){
  const a=args(process.argv.slice(2));
  for(const key of ['repo-root','artifact-root','run-evidence','manifest','report-out','resource-evidence-out','resource-proof-out'])if(!a[key])fail('hsme_resource_collector_cli','missing --'+key);
  const runEvidence=await loadJson(a['run-evidence']);
  const manifest=await loadJson(a.manifest);
  const result=await collectFoundationResourceEvidence(a['repo-root'],a['artifact-root'],runEvidence,manifest);
  await writeFile(a['report-out'],stable(result.report));
  if(result.evidence)await writeFile(a['resource-evidence-out'],stable(result.evidence));
  if(result.proof)await writeFile(a['resource-proof-out'],stable(result.proof));
  process.stdout.write(JSON.stringify({state:result.report.state,runEvidenceSha256:result.report.runEvidenceSha256,resourceEvidenceSha256:result.report.resourceEvidenceSha256})+'\n');
  if(result.report.state==='FAILED_EVIDENCE')process.exitCode=1;
}
if(process.env.HSME_FOUNDATION_RESOURCE_COLLECTOR_CLI==='1')main().catch(error=>{process.stderr.write(String(error?.code||'hsme_resource_collector_error')+': '+String(error?.message||error)+'\n');process.exitCode=1;});
