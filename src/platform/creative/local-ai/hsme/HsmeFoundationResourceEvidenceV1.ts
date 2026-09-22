import {
  normalizeHsmeFoundationBenchmarkCampaignV1,
} from './HsmeFoundationBenchmarkCampaignV1';
import {
  normalizeHsmeFoundationBenchmarkCandidateTrustV1,
  proveHsmeFoundationBenchmarkCandidateTrustV1,
} from './HsmeFoundationBenchmarkCandidateTrustV1';
import {
  hsmeFoundationBenchmarkRunEvidenceV1Digest,
  normalizeHsmeFoundationBenchmarkRunEvidenceV1,
  proveHsmeFoundationBenchmarkRunEvidenceV1,
  type HsmeFoundationBenchmarkRunHashPortV1,
} from './HsmeFoundationBenchmarkRunEvidenceV1';

export const HSME_FOUNDATION_RESOURCE_EVIDENCE_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_RESOURCE_EVIDENCE_V1' as const;
export const HSME_FOUNDATION_RESOURCE_EVIDENCE_DIGEST_DOMAIN =
  'bers:hsme:foundation-resource-evidence:v1\0' as const;
export const HSME_FOUNDATION_RUNTIME_INVENTORY_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_RUNTIME_INVENTORY_V1' as const;

const HEX64=/^[0-9a-f]{64}$/;
const CAPABILITIES=Object.freeze(['TEXT_TO_IMAGE','IMAGE_EDITING'] as const);
const COST_KINDS=Object.freeze(['MEASURED_METERED','PROVEN_UNMETERED_LOCAL'] as const);

type Capability=typeof CAPABILITIES[number];
type CostKind=typeof COST_KINDS[number];

export type HsmeFoundationRuntimeInventoryArtifactV1=Readonly<{
  relativePath:string;
  bytes:number;
  contentSha256:string;
}>;

export type HsmeFoundationRuntimeInventoryV1=Readonly<{
  schemaVersion:typeof HSME_FOUNDATION_RUNTIME_INVENTORY_V1_SCHEMA;
  candidateId:string;
  immutableRevision:string;
  complete:true;
  artifacts:readonly HsmeFoundationRuntimeInventoryArtifactV1[];
}>;

export type HsmeFoundationResourceMeasurementV1=Readonly<{
  candidateId:string;
  capability:Capability;
  immutableRevision:string;
  modelContentSha256:string;
  executionProfileSha256:string;
  runtimeInventory:HSMEFoundationRuntimeInventoryAlias;
  hardwareProfileSha256:string;
  measurementMethodSha256:string;
  workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES';
  peakWorkingMemoryBytes:number;
  coldEndToEndLatencyMicros:number;
  warmEndToEndLatencyMicros:number;
  acceptedOutputCostMicrousd:number;
  costKind:CostKind;
  measurementEvidenceSha256:string;
}>;

type HSMEFoundationRuntimeInventoryAlias=HsmeFoundationRuntimeInventoryV1;

export type HsmeFoundationResourceEvidenceV1=Readonly<{
  schemaVersion:typeof HSME_FOUNDATION_RESOURCE_EVIDENCE_V1_SCHEMA;
  campaignId:string;
  campaignDigest:string;
  runEvidenceSha256:string;
  records:readonly HsmeFoundationResourceMeasurementV1[];
  qualityScoringAllowed:false;
  qualityOrderingMutationAllowed:false;
  aggregateEfficiencyScoreAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  durableModelFleetPromotionAllowed:false;
  trainingOrDistillationAllowed:false;
  winnerSelectionAllowed:false;
}>;

export type HsmeFoundationResourceEvidenceProofRecordV1=Readonly<{
  candidateId:string;
  capability:Capability;
  runtimeInventorySha256:string;
  mandatoryInstalledBytes:number;
  workingMemoryKind:'CUDA_PEAK_RESERVED_BYTES';
  peakWorkingMemoryBytes:number;
  coldEndToEndLatencyMicros:number;
  warmEndToEndLatencyMicros:number;
  acceptedOutputCostMicrousd:number;
  costKind:CostKind;
  hardwareProfileSha256:string;
  measurementMethodSha256:string;
  measurementEvidenceSha256:string;
}>;

export type HsmeFoundationResourceEvidenceProofV1=Readonly<{
  schemaVersion:typeof HSME_FOUNDATION_RESOURCE_EVIDENCE_V1_SCHEMA;
  campaignId:string;
  campaignDigest:string;
  runEvidenceSha256:string;
  records:readonly HsmeFoundationResourceEvidenceProofRecordV1[];
  qualityScoringAllowed:false;
  qualityOrderingMutationAllowed:false;
  aggregateEfficiencyScoreAllowed:false;
  winnerSelectionAllowed:false;
  productionAuthorityGranted:false;
}>;

export class HsmeFoundationResourceEvidenceV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeFoundationResourceEvidenceV1Error';
    this.code=code;
  }
}

export function normalizeHsmeFoundationRuntimeInventoryV1(raw:unknown):HsmeFoundationRuntimeInventoryV1{
  const record=exactRecord(raw,['schemaVersion','candidateId','immutableRevision','complete','artifacts'],'runtimeInventory');
  if(record.schemaVersion!==HSME_FOUNDATION_RUNTIME_INVENTORY_V1_SCHEMA){
    fail('hsme_resource_inventory_schema','runtime inventory schema mismatch');
  }
  if(record.complete!==true){
    fail('hsme_resource_inventory_incomplete','resource evidence requires complete runtime inventory');
  }
  if(!Array.isArray(record.artifacts)||record.artifacts.length<1||record.artifacts.length>4096){
    fail('hsme_resource_inventory_artifacts','runtime inventory artifacts must contain 1..4096 entries');
  }
  const artifacts=record.artifacts.map((value,index)=>{
    const item=exactRecord(value,['relativePath','bytes','contentSha256'],'runtimeInventory.artifacts['+index+']');
    return Object.freeze({
      relativePath:safeRelativePath(item.relativePath,'runtimeInventory.artifacts['+index+'].relativePath'),
      bytes:safeInteger(item.bytes,'runtimeInventory.artifacts['+index+'].bytes',0,Number.MAX_SAFE_INTEGER),
      contentSha256:sha256(item.contentSha256,'runtimeInventory.artifacts['+index+'].contentSha256'),
    });
  });
  const paths=artifacts.map(value=>value.relativePath);
  if(new Set(paths).size!==paths.length)fail('hsme_resource_inventory_duplicate','runtime inventory paths must be unique');
  const sorted=[...artifacts].sort((a,b)=>lexical(a.relativePath,b.relativePath));
  if(!sameStrings(paths,sorted.map(value=>value.relativePath))){
    fail('hsme_resource_inventory_order','runtime inventory artifacts must preserve runner canonical relativePath order');
  }
  return deepFreeze({
    schemaVersion:HSME_FOUNDATION_RUNTIME_INVENTORY_V1_SCHEMA,
    candidateId:identifier(record.candidateId,'runtimeInventory.candidateId',120),
    immutableRevision:hexRevision(record.immutableRevision,'runtimeInventory.immutableRevision'),
    complete:true,
    artifacts:Object.freeze(artifacts),
  });
}

export function hsmeFoundationRuntimeInventoryStableJsonV1(raw:unknown):string{
  return JSON.stringify(normalizeHsmeFoundationRuntimeInventoryV1(raw),null,2)+'\n';
}

export async function proveHsmeFoundationResourceEvidenceV1(
  rawCampaign:unknown,
  rawTrust:unknown,
  rawFixturePlan:unknown,
  rawFixturePackEvidence:unknown,
  rawRunEvidence:unknown,
  rawResourceEvidence:unknown,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<HsmeFoundationResourceEvidenceProofV1>{
  const campaign=normalizeHsmeFoundationBenchmarkCampaignV1(rawCampaign);
  const trust=normalizeHsmeFoundationBenchmarkCandidateTrustV1(rawTrust);
  await proveHsmeFoundationBenchmarkCandidateTrustV1(rawCampaign,rawTrust,hash);
  await proveHsmeFoundationBenchmarkRunEvidenceV1(
    rawCampaign,rawTrust,rawFixturePlan,rawFixturePackEvidence,rawRunEvidence,hash,
  );
  const runEvidence=normalizeHsmeFoundationBenchmarkRunEvidenceV1(rawRunEvidence);
  const runEvidenceSha256=await hsmeFoundationBenchmarkRunEvidenceV1Digest(runEvidence,hash);
  const resource=normalizeResourceEvidence(rawResourceEvidence);

  if(resource.campaignId!==campaign.campaignId){
    fail('hsme_resource_campaign_id','resource evidence campaign id mismatch');
  }
  if(resource.campaignDigest!==runEvidence.campaignDigest){
    fail('hsme_resource_campaign_digest','resource evidence campaign digest mismatch');
  }
  if(resource.runEvidenceSha256!==runEvidenceSha256){
    fail('hsme_resource_run_digest','resource evidence not bound to canonical run evidence');
  }

  const completeRuns=runEvidence.runs.filter(value=>value.status==='COMPLETE');
  const expectedKeys=completeRuns.map(value=>value.candidateId+'\0'+value.capability).sort(lexical);
  const actualKeys=resource.records.map(value=>value.candidateId+'\0'+value.capability).sort(lexical);
  if(!sameStrings(expectedKeys,actualKeys)){
    fail('hsme_resource_record_roster','resource evidence must cover every COMPLETE run exactly once and no other rows');
  }

  const proofRecords:HsmeFoundationResourceEvidenceProofRecordV1[]=[];
  for(const record of resource.records){
    const run=completeRuns.find(value=>value.candidateId===record.candidateId&&value.capability===record.capability);
    if(!run)fail('hsme_resource_run_missing','resource record has no matching COMPLETE run');
    if(
      record.immutableRevision!==run.immutableRevision
      || record.modelContentSha256!==run.modelContentSha256
      || record.executionProfileSha256!==run.executionProfileSha256
    ){
      fail('hsme_resource_candidate_identity','resource record candidate identity drift');
    }
    const trustCandidate=trust.candidates.find(value=>value.candidateId===record.candidateId);
    if(!trustCandidate||!trustCandidate.executionProfile.hardwareBackendClass.startsWith('CUDA_')){
      fail('hsme_resource_working_memory_backend','CUDA_PEAK_RESERVED_BYTES requires a PINNED CUDA execution profile');
    }
    const inventory=normalizeHsmeFoundationRuntimeInventoryV1(record.runtimeInventory);
    if(inventory.candidateId!==record.candidateId||inventory.immutableRevision!==record.immutableRevision){
      fail('hsme_resource_inventory_binding','runtime inventory candidate binding mismatch');
    }
    const runtimeInventorySha256=await digestUtf8(hsmeFoundationRuntimeInventoryStableJsonV1(inventory),hash);
    if(runtimeInventorySha256!==run.runtimeInventorySha256){
      fail('hsme_resource_inventory_digest','runtime inventory digest differs from canonical COMPLETE run');
    }
    const mandatoryInstalledBytes=sumSafe(inventory.artifacts.map(value=>value.bytes),'mandatoryInstalledBytes');
    proofRecords.push(deepFreeze({
      candidateId:record.candidateId,
      capability:record.capability,
      runtimeInventorySha256,
      mandatoryInstalledBytes,
      workingMemoryKind:record.workingMemoryKind,
      peakWorkingMemoryBytes:record.peakWorkingMemoryBytes,
      coldEndToEndLatencyMicros:record.coldEndToEndLatencyMicros,
      warmEndToEndLatencyMicros:record.warmEndToEndLatencyMicros,
      acceptedOutputCostMicrousd:record.acceptedOutputCostMicrousd,
      costKind:record.costKind,
      hardwareProfileSha256:record.hardwareProfileSha256,
      measurementMethodSha256:record.measurementMethodSha256,
      measurementEvidenceSha256:record.measurementEvidenceSha256,
    }));
  }

  proofRecords.sort((a,b)=>lexical(a.candidateId,b.candidateId)||lexical(a.capability,b.capability));
  return deepFreeze({
    schemaVersion:HSME_FOUNDATION_RESOURCE_EVIDENCE_V1_SCHEMA,
    campaignId:campaign.campaignId,
    campaignDigest:runEvidence.campaignDigest,
    runEvidenceSha256,
    records:Object.freeze(proofRecords),
    qualityScoringAllowed:false,
    qualityOrderingMutationAllowed:false,
    aggregateEfficiencyScoreAllowed:false,
    winnerSelectionAllowed:false,
    productionAuthorityGranted:false,
  });
}

export async function hsmeFoundationResourceEvidenceV1Digest(
  rawProof:HsmeFoundationResourceEvidenceProofV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<string>{
  const digest=await digestUtf8(HSME_FOUNDATION_RESOURCE_EVIDENCE_DIGEST_DOMAIN+JSON.stringify(rawProof),hash);
  if(!HEX64.test(digest))fail('hsme_resource_hash_port','hash port must return lowercase SHA-256');
  return digest;
}

function normalizeResourceEvidence(raw:unknown):HsmeFoundationResourceEvidenceV1{
  const record=exactRecord(raw,[
    'schemaVersion','campaignId','campaignDigest','runEvidenceSha256','records',
    'qualityScoringAllowed','qualityOrderingMutationAllowed','aggregateEfficiencyScoreAllowed',
    'productionAuthorityGranted','providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted','durableModelFleetPromotionAllowed',
    'trainingOrDistillationAllowed','winnerSelectionAllowed',
  ],'resourceEvidence');
  if(record.schemaVersion!==HSME_FOUNDATION_RESOURCE_EVIDENCE_V1_SCHEMA){
    fail('hsme_resource_schema','resource evidence schema mismatch');
  }
  for(const field of [
    'qualityScoringAllowed','qualityOrderingMutationAllowed','aggregateEfficiencyScoreAllowed',
    'productionAuthorityGranted','providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted','durableModelFleetPromotionAllowed',
    'trainingOrDistillationAllowed','winnerSelectionAllowed',
  ]){
    if(record[field]!==false)fail('hsme_resource_authority','resource evidence authority/quality field must remain false: '+field);
  }
  if(!Array.isArray(record.records)||record.records.length<1||record.records.length>16){
    fail('hsme_resource_records','resource evidence records must contain 1..16 entries');
  }
  const records=record.records.map((value,index)=>normalizeMeasurement(value,'resourceEvidence.records['+index+']'));
  const keys=records.map(value=>value.candidateId+'\0'+value.capability);
  if(new Set(keys).size!==keys.length)fail('hsme_resource_duplicate','resource candidate/capability records must be unique');
  return deepFreeze({
    schemaVersion:HSME_FOUNDATION_RESOURCE_EVIDENCE_V1_SCHEMA,
    campaignId:identifier(record.campaignId,'resourceEvidence.campaignId',160),
    campaignDigest:sha256(record.campaignDigest,'resourceEvidence.campaignDigest'),
    runEvidenceSha256:sha256(record.runEvidenceSha256,'resourceEvidence.runEvidenceSha256'),
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
}

export function normalizeHsmeFoundationResourceMeasurementV1(
  raw:unknown,
):HsmeFoundationResourceMeasurementV1{
  return normalizeMeasurement(raw,'resourceMeasurement');
}

function normalizeMeasurement(raw:unknown,path:string):HsmeFoundationResourceMeasurementV1{
  const record=exactRecord(raw,[
    'candidateId','capability','immutableRevision','modelContentSha256','executionProfileSha256',
    'runtimeInventory','hardwareProfileSha256','measurementMethodSha256','workingMemoryKind','peakWorkingMemoryBytes',
    'coldEndToEndLatencyMicros','warmEndToEndLatencyMicros','acceptedOutputCostMicrousd',
    'costKind','measurementEvidenceSha256',
  ],path);
  const costKind=enumValue(record.costKind,COST_KINDS,path+'.costKind');
  const cost=safeInteger(record.acceptedOutputCostMicrousd,path+'.acceptedOutputCostMicrousd',0,Number.MAX_SAFE_INTEGER);
  if(costKind==='PROVEN_UNMETERED_LOCAL'&&cost!==0){
    fail('hsme_resource_unmetered_cost','PROVEN_UNMETERED_LOCAL requires zero microusd');
  }
  if(costKind==='MEASURED_METERED'&&cost<1){
    fail('hsme_resource_metered_cost','MEASURED_METERED requires positive microusd');
  }
  return deepFreeze({
    candidateId:identifier(record.candidateId,path+'.candidateId',120),
    capability:enumValue(record.capability,CAPABILITIES,path+'.capability'),
    immutableRevision:hexRevision(record.immutableRevision,path+'.immutableRevision'),
    modelContentSha256:sha256(record.modelContentSha256,path+'.modelContentSha256'),
    executionProfileSha256:sha256(record.executionProfileSha256,path+'.executionProfileSha256'),
    runtimeInventory:normalizeHsmeFoundationRuntimeInventoryV1(record.runtimeInventory),
    hardwareProfileSha256:sha256(record.hardwareProfileSha256,path+'.hardwareProfileSha256'),
    measurementMethodSha256:sha256(record.measurementMethodSha256,path+'.measurementMethodSha256'),
    workingMemoryKind:literal(record.workingMemoryKind,'CUDA_PEAK_RESERVED_BYTES',path+'.workingMemoryKind'),
    peakWorkingMemoryBytes:safeInteger(record.peakWorkingMemoryBytes,path+'.peakWorkingMemoryBytes',1,Number.MAX_SAFE_INTEGER),
    coldEndToEndLatencyMicros:safeInteger(record.coldEndToEndLatencyMicros,path+'.coldEndToEndLatencyMicros',1,Number.MAX_SAFE_INTEGER),
    warmEndToEndLatencyMicros:safeInteger(record.warmEndToEndLatencyMicros,path+'.warmEndToEndLatencyMicros',1,Number.MAX_SAFE_INTEGER),
    acceptedOutputCostMicrousd:cost,
    costKind,
    measurementEvidenceSha256:sha256(record.measurementEvidenceSha256,path+'.measurementEvidenceSha256'),
  });
}

async function digestUtf8(value:string,hash:HsmeFoundationBenchmarkRunHashPortV1):Promise<string>{
  const digest=await hash.sha256(new TextEncoder().encode(value));
  if(!HEX64.test(digest))fail('hsme_resource_hash_port','hash port must return lowercase SHA-256');
  return digest;
}
function sumSafe(values:readonly number[],path:string):number{
  let total=0;
  for(const value of values){
    total+=value;
    if(!Number.isSafeInteger(total))fail('hsme_resource_integer_overflow',path+' overflow');
  }
  return total;
}
function exactRecord(raw:unknown,allowed:readonly string[],path:string):Record<string,any>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('hsme_resource_record',path+' must be object');
  const record=raw as Record<string,any>;
  for(const key of Object.keys(record))if(!allowed.includes(key))fail('hsme_resource_field_unknown',path+'.'+key+' is not allowed');
  for(const key of allowed)if(!Object.hasOwn(record,key))fail('hsme_resource_field_missing',path+'.'+key+' is required');
  return record;
}
function literal<T extends string>(value:unknown,expected:T,path:string):T{
  if(value!==expected)fail('hsme_resource_literal',path+' must equal '+expected);
  return expected;
}
function enumValue<T extends readonly string[]>(value:unknown,values:T,path:string):T[number]{
  if(typeof value!=='string'||!values.includes(value as T[number]))fail('hsme_resource_enum',path+' invalid');
  return value as T[number];
}
function safeInteger(value:unknown,path:string,min:number,max:number):number{
  if(!Number.isSafeInteger(value)||(value as number)<min||(value as number)>max)fail('hsme_resource_integer',path+' invalid');
  return value as number;
}
function identifier(value:unknown,path:string,max:number):string{
  if(typeof value!=='string'||value.length<1||value.length>max||!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value))fail('hsme_resource_identifier',path+' invalid');
  return value;
}
function safeRelativePath(value:unknown,path:string):string{
  if(typeof value!=='string'||value.length<1||value.length>512||value.startsWith('/')||value.includes('\\')||value.split('/').some(part=>!part||part==='.'||part==='..')){
    fail('hsme_resource_path',path+' invalid');
  }
  return value;
}
function hexRevision(value:unknown,path:string):string{
  if(typeof value!=='string'||!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value))fail('hsme_resource_revision',path+' invalid');
  return value;
}
function sha256(value:unknown,path:string):string{
  if(typeof value!=='string'||!HEX64.test(value))fail('hsme_resource_sha256',path+' invalid');
  return value;
}
function sameStrings(left:readonly string[],right:readonly string[]):boolean{
  return left.length===right.length&&left.every((value,index)=>value===right[index]);
}
function lexical(left:string,right:string):number{return left<right?-1:left>right?1:0;}
function deepFreeze<T>(value:T):T{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value as Record<string,unknown>))deepFreeze(child);
  }
  return value;
}
function fail(code:string,message:string):never{throw new HsmeFoundationResourceEvidenceV1Error(code,message);}
