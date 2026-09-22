import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {
  hsmeFoundationRuntimeInventoryStableJsonV1,
  normalizeHsmeFoundationResourceMeasurementV1,
  normalizeHsmeFoundationRuntimeInventoryV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationResourceEvidenceV1.ts';
import {
  normalizeHsmeFoundationBenchmarkCandidateRunV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkRunEvidenceV1.ts';

const FRAGMENT_SCHEMA='BERS_HSME_FOUNDATION_RESOURCE_MEASUREMENT_FRAGMENT_V1';
const HARDWARE_SCHEMA='BERS_HSME_FOUNDATION_RESOURCE_HARDWARE_PROFILE_V1';
const METHOD_SCHEMA='BERS_HSME_FOUNDATION_RESOURCE_MEASUREMENT_METHOD_V1';
const EVIDENCE_SCHEMA='BERS_HSME_FOUNDATION_RESOURCE_MEASUREMENT_EVIDENCE_V1';
const HEX64=/^[0-9a-f]{64}$/;

class VerifyError extends Error{
  constructor(code,message){super(message);this.name='HsmeFoundationResourceFragmentVerifyError';this.code=code;}
}
function fail(code,message){throw new VerifyError(code,message);}
function exactKeys(value,keys,path){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('hsme_resource_verify_shape',path+' must be object');
  const actual=Object.keys(value).sort();
  const expected=[...keys].sort();
  if(JSON.stringify(actual)!==JSON.stringify(expected))fail('hsme_resource_verify_shape',path+' keys mismatch');
  return value;
}
async function json(path){return JSON.parse(await readFile(path,'utf8'));}
async function digestFile(path){return createHash('sha256').update(await readFile(path)).digest('hex');}
function assertSha(value,path){if(typeof value!=='string'||!HEX64.test(value))fail('hsme_resource_verify_sha',path+' invalid');}

export async function verifyResourceFragment({
  planPath,runPath,inventoryPath,resourcePath,hardwareProfilePath,measurementMethodPath,measurementEvidencePath,
}){
  const [plan,rawRun,rawInventory,fragment,hardware,method,evidence]=await Promise.all([
    json(planPath),json(runPath),json(inventoryPath),json(resourcePath),json(hardwareProfilePath),json(measurementMethodPath),json(measurementEvidencePath),
  ]);
  const run=normalizeHsmeFoundationBenchmarkCandidateRunV1(rawRun);
  const inventory=normalizeHsmeFoundationRuntimeInventoryV1(rawInventory);
  if(run.status!=='COMPLETE')fail('hsme_resource_verify_run_status','resource fragment requires COMPLETE candidate run');

  exactKeys(fragment,['schemaVersion','campaignId','record','productionAuthorityGranted','winnerSelectionAllowed'],'resourceFragment');
  if(fragment.schemaVersion!==FRAGMENT_SCHEMA||fragment.productionAuthorityGranted!==false||fragment.winnerSelectionAllowed!==false){
    fail('hsme_resource_verify_fragment','resource fragment schema/authority invalid');
  }
  const record=normalizeHsmeFoundationResourceMeasurementV1(fragment.record);
  if(fragment.campaignId!==plan.campaignId)fail('hsme_resource_verify_campaign','resource fragment campaign mismatch');

  for(const field of ['candidateId','capability','immutableRevision','modelContentSha256','executionProfileSha256']){
    if(record[field]!==run[field]||record[field]!==plan[field])fail('hsme_resource_verify_identity','resource '+field+' binding mismatch');
  }

  const inventoryFileSha=await digestFile(inventoryPath);
  if(inventoryFileSha!==run.runtimeInventorySha256)fail('hsme_resource_verify_inventory_sha','runtime inventory file digest differs from candidate run');
  const canonicalInventorySha=createHash('sha256').update(hsmeFoundationRuntimeInventoryStableJsonV1(record.runtimeInventory)).digest('hex');
  if(canonicalInventorySha!==inventoryFileSha)fail('hsme_resource_verify_inventory_record','resource record inventory differs from verified inventory file');
  if(JSON.stringify(record.runtimeInventory)!==JSON.stringify(inventory))fail('hsme_resource_verify_inventory_object','resource record inventory object mismatch');

  exactKeys(hardware,[
    'schemaVersion','deviceIndex','gpuName','computeCapabilityMajor','computeCapabilityMinor',
    'totalMemoryBytes','nvidiaDriverVersion','torchVersion','torchCudaVersion','workingMemoryKind',
  ],'hardwareProfile');
  if(
    hardware.schemaVersion!==HARDWARE_SCHEMA
    || hardware.workingMemoryKind!=='CUDA_PEAK_RESERVED_BYTES'
    || !Number.isSafeInteger(hardware.deviceIndex)||hardware.deviceIndex<0
    || typeof hardware.gpuName!=='string'||hardware.gpuName.length<1
    || !Number.isSafeInteger(hardware.computeCapabilityMajor)||hardware.computeCapabilityMajor<1
    || !Number.isSafeInteger(hardware.computeCapabilityMinor)||hardware.computeCapabilityMinor<0
    || !Number.isSafeInteger(hardware.totalMemoryBytes)||hardware.totalMemoryBytes<1
    || typeof hardware.nvidiaDriverVersion!=='string'||hardware.nvidiaDriverVersion.length<1||hardware.nvidiaDriverVersion.length>64
    || typeof hardware.torchVersion!=='string'||hardware.torchVersion.length<1
    || typeof hardware.torchCudaVersion!=='string'||hardware.torchCudaVersion.length<1
  ) fail('hsme_resource_verify_hardware','hardware profile invalid');

  exactKeys(method,[
    'schemaVersion','clock','cudaSynchronization','coldLatencyDefinition','warmLatencyDefinition',
    'warmAggregation','nanosecondsToMicroseconds','workingMemoryKind','workingMemoryMetric',
    'artifactAcquisitionIncludedInLatency','pngEncodingIncludedInLatency','reviewPackageReceivesResourceMetadata',
  ],'measurementMethod');
  if(
    method.schemaVersion!==METHOD_SCHEMA
    || method.clock!=='PYTHON_TIME_PERF_COUNTER_NS'
    || method.cudaSynchronization!=='BEFORE_AND_AFTER_TIMED_INFERENCE'
    || method.coldLatencyDefinition!=='PIPELINE_LOAD_PLUS_FIRST_FROZEN_INFERENCE'
    || method.warmLatencyDefinition!=='FROZEN_INFERENCE_AFTER_PIPELINE_LOAD'
    || method.warmAggregation!=='MEDIAN_EVEN_ARITHMETIC_MEAN_HALF_UP'
    || method.nanosecondsToMicroseconds!=='POSITIVE_CEILING'
    || method.workingMemoryKind!=='CUDA_PEAK_RESERVED_BYTES'
    || method.workingMemoryMetric!=='TORCH_CUDA_MAX_MEMORY_RESERVED'
    || method.artifactAcquisitionIncludedInLatency!==false
    || method.pngEncodingIncludedInLatency!==false
    || method.reviewPackageReceivesResourceMetadata!==false
  ) fail('hsme_resource_verify_method','measurement method drift');

  const hardwareSha=await digestFile(hardwareProfilePath);
  const methodSha=await digestFile(measurementMethodPath);
  const evidenceSha=await digestFile(measurementEvidencePath);
  if(record.hardwareProfileSha256!==hardwareSha)fail('hsme_resource_verify_hardware_sha','hardware profile digest mismatch');
  if(record.measurementMethodSha256!==methodSha)fail('hsme_resource_verify_method_sha','measurement method digest mismatch');
  if(record.measurementEvidenceSha256!==evidenceSha)fail('hsme_resource_verify_evidence_sha','measurement evidence digest mismatch');

  exactKeys(evidence,[
    'schemaVersion','candidateId','capability','runtimeInventorySha256','hardwareProfileSha256',
    'measurementMethodSha256','workingMemoryKind','peakWorkingMemoryBytes',
    'coldEndToEndLatencyMicros','warmEndToEndLatencyMicros','warmLatencySamplesMicros',
    'acceptedOutputCostMicrousd','costKind','costEvidenceSha256',
    'productionAuthorityGranted','winnerSelectionAllowed',
  ],'measurementEvidence');
  if(
    evidence.schemaVersion!==EVIDENCE_SCHEMA
    || evidence.candidateId!==record.candidateId
    || evidence.capability!==record.capability
    || evidence.runtimeInventorySha256!==run.runtimeInventorySha256
    || evidence.hardwareProfileSha256!==record.hardwareProfileSha256
    || evidence.measurementMethodSha256!==record.measurementMethodSha256
    || evidence.workingMemoryKind!==record.workingMemoryKind
    || evidence.peakWorkingMemoryBytes!==record.peakWorkingMemoryBytes
    || evidence.coldEndToEndLatencyMicros!==record.coldEndToEndLatencyMicros
    || evidence.warmEndToEndLatencyMicros!==record.warmEndToEndLatencyMicros
    || evidence.acceptedOutputCostMicrousd!==record.acceptedOutputCostMicrousd
    || evidence.costKind!==record.costKind
    || evidence.productionAuthorityGranted!==false
    || evidence.winnerSelectionAllowed!==false
  ) fail('hsme_resource_verify_evidence_binding','measurement evidence binding mismatch');
  assertSha(evidence.costEvidenceSha256,'measurementEvidence.costEvidenceSha256');
  if(!Array.isArray(evidence.warmLatencySamplesMicros)||evidence.warmLatencySamplesMicros.length<1){
    fail('hsme_resource_verify_warm_samples','warm latency samples missing');
  }
  for(const value of evidence.warmLatencySamplesMicros){
    if(!Number.isSafeInteger(value)||value<1)fail('hsme_resource_verify_warm_samples','warm latency sample invalid');
  }
  const ordered=[...evidence.warmLatencySamplesMicros].sort((a,b)=>a-b);
  const middle=Math.floor(ordered.length/2);
  const median=ordered.length%2?ordered[middle]:Math.floor((ordered[middle-1]+ordered[middle]+1)/2);
  if(median!==record.warmEndToEndLatencyMicros)fail('hsme_resource_verify_warm_median','warm median mismatch');

  return Object.freeze({
    candidateId:record.candidateId,
    capability:record.capability,
    runtimeInventorySha256:inventoryFileSha,
    hardwareProfileSha256:hardwareSha,
    measurementMethodSha256:methodSha,
    measurementEvidenceSha256:evidenceSha,
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  });
}

function args(argv){
  const out={};
  for(let i=0;i<argv.length;i+=2){
    if(!argv[i]?.startsWith('--')||argv[i+1]===undefined)fail('hsme_resource_verify_args','invalid CLI args');
    out[argv[i].slice(2)]=argv[i+1];
  }
  for(const key of ['plan','run','inventory','resource','hardware-profile','measurement-method','measurement-evidence']){
    if(!out[key])fail('hsme_resource_verify_args','missing --'+key);
  }
  return out;
}
if(process.env.HSME_FOUNDATION_RESOURCE_VERIFY_CLI==='1'){
  const a=args(process.argv.slice(2));
  const result=await verifyResourceFragment({
    planPath:a.plan,
    runPath:a.run,
    inventoryPath:a.inventory,
    resourcePath:a.resource,
    hardwareProfilePath:a['hardware-profile'],
    measurementMethodPath:a['measurement-method'],
    measurementEvidencePath:a['measurement-evidence'],
  });
  process.stdout.write(JSON.stringify(result)+'\n');
}
