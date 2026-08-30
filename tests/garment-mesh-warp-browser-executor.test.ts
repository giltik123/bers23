import assert from 'node:assert/strict';
import test from 'node:test';
import { CoreAuthorizedGarmentMeshWarp } from '../src/application/local-execution/CoreAuthorizedGarmentMeshWarp.ts';
import { encodeGarmentMeshWarpInputEnvelope } from '../src/platform/creative/canonical/garmentMeshWarpInputEnvelope.ts';
import type { LocalExecutionTicketV2 } from '../src/platform/creative/canonical/localExecution.ts';
import { GARMENT_MESH_WARP_TOOL_DEFINITION } from '../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import { garmentMeshWarpRgba8 } from '../src/platform/creative/deterministic/GarmentMeshWarp.ts';

const TOOL = GARMENT_MESH_WARP_TOOL_DEFINITION;
const projectId = '11111111-1111-4111-8111-111111111111';
const garmentId = '22222222-2222-4222-8222-222222222222';
const viewId = '33333333-3333-4333-8333-333333333333';
const representationId = '44444444-4444-4444-8444-444444444444';
const anchorSetId = '55555555-5555-4555-8555-555555555555';
const projectStorageId = '66666666-6666-4666-8666-666666666666';
const layerId = '77777777-7777-4777-8777-777777777777';
const sourceArtifactId = 'signed-project-source';
const projectSha = 'c'.repeat(64); const viewSha = 'a'.repeat(64); const representationSha = 'b'.repeat(64); const anchorSha = 'd'.repeat(64); const meshSha = 'e'.repeat(64); const outputSha = 'f'.repeat(64);
const q = 65536;
const sourcePointsQ16 = Object.freeze([Object.freeze([0,0] as const),Object.freeze([q,0] as const),Object.freeze([q,q] as const),Object.freeze([0,q] as const)]);
const destinationPointsQ16 = sourcePointsQ16;
const triangles = Object.freeze([Object.freeze([0,1,2] as const),Object.freeze([0,2,3] as const)]);
const basisViewRgba = Uint8Array.from([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,128]);

const viewBinding = Object.freeze({ authority:'MANAGED_GARMENT' as const, kind:'GARMENT_VIEW' as const, garmentId, viewId, contentSha256:viewSha, contentType:'image/png' as const, encoding:'PNG_RGBA8_LOSSLESS' as const, width:2, height:2 });
const representationBinding = Object.freeze({ authority:'MANAGED_GARMENT' as const, kind:'GARMENT_REPRESENTATION' as const, garmentId, representationId, tier:'PARAMETRIC' as const, format:'BERS_PARAMETRIC_V1' as const, contentType:'application/vnd.bers.garment-parametric+json' as const, contentSha256:representationSha, basisViewId:viewId, generatorId:'bers.mesh-fit', generatorVersion:'1', validatorId:'bers.parametric-topology-validator', validatorVersion:'1' });

function ticket(): LocalExecutionTicketV2 {
  return Object.freeze({
    ticketId:'warp-ticket-browser-1', version:'2', issuer:'CORE', requestId:'garment-mesh-warp:browser-test', workflowId:'garment-mesh-warp:browser-test', stepId:TOOL.operation.id,
    operation:Object.freeze({ id:TOOL.operation.id, version:TOOL.operation.version, type:TOOL.operation.type, capability:TOOL.capability, parameters:Object.freeze({
      sourceArtifactId, garmentId, viewId, representationId, anchorSetId, projectImageStorageId:projectStorageId, projectImageSha256:projectSha, viewSha256:viewSha,
      representationSha256:representationSha, anchorPayloadSha256:anchorSha, destinationMeshSha256:meshSha, ...TOOL.parameters.exact,
    }) }),
    scope:Object.freeze({tenantId:'tenant-browser-warp',userId:'user-browser-warp',projectId}),
    inputs:Object.freeze([Object.freeze({artifactId:sourceArtifactId,kind:'image',role:'COMPOSITE' as const,sha256:projectSha})]),
    managedInputs:Object.freeze([viewBinding,representationBinding]),
    expectedOutputs:Object.freeze([Object.freeze({kind:'image',role:'WORKING' as const,count:1 as const,mimeTypes:Object.freeze(['image/png']),width:2,height:2})]),
    allowedExecutors:Object.freeze([TOOL.executor]), policy:'LOCAL_ONLY', idempotencyKey:'browser-warp:local-v2', nonce:'browser-warp-nonce', issuedAt:1000, expiresAt:61000,
    cost:Object.freeze({paidCloudCredits:0 as const,providerCalls:0 as const}),
  });
}

function envelope(overrides: Record<string, unknown> = {}) {
  return encodeGarmentMeshWarpInputEnvelope({
    metadata:{
      ticketId:'warp-ticket-browser-1', projectId, sourceArtifactId, projectImageStorageId:projectStorageId, projectImageSha256:projectSha, outputWidth:2, outputHeight:2,
      garmentId, viewId, viewSha256:viewSha, representationId, representationSha256:representationSha, anchorSetId, anchorPayloadSha256:anchorSha,
      basisViewWidth:2, basisViewHeight:2, destinationMeshSha256:meshSha, sourcePointsQ16, destinationPointsQ16, triangles, ...overrides,
    } as any,
    basisViewRgba,
  });
}

function harness(inputEnvelope = envelope()) {
  const calls:{prepare?:unknown;upload?:unknown;submit?:any} = {};
  const preparedTicket = ticket();
  const core = Object.freeze({
    prepareGarmentMeshWarp: async (payload:any) => { calls.prepare=payload; return Object.freeze({executionId:preparedTicket.requestId,ticket:preparedTicket}); },
    loadGarmentMeshWarpInput: async ({ticketId:requestedTicketId,projectId:requestedProjectId}:any) => { assert.equal(requestedTicketId,preparedTicket.ticketId);assert.equal(requestedProjectId,projectId);return Uint8Array.from(inputEnvelope); },
    uploadGarmentMeshWarpImage: async (payload:any) => { calls.upload=payload; return Object.freeze({uploadId:'warp-browser-upload',kind:'image',role:'WORKING' as const,sha256:'9'.repeat(64),sizeBytes:payload.bytes.byteLength,mimeType:'image/png',width:2,height:2}); },
    submitGarmentMeshWarp: async (payload:any) => { calls.submit=payload; return Object.freeze({executionId:preparedTicket.requestId,status:'SUCCESS',layerId,contentSha256:outputSha,verification:Object.freeze({valid:true})}); },
  });
  let clock=10;
  return Object.freeze({ executor:new CoreAuthorizedGarmentMeshWarp(projectId,core,()=>++clock),calls,preparedTicket });
}
const runInput=Object.freeze({requestId:'browser-warp-request',sourceArtifactId,garmentId,representationId,anchorSetId});

test('browser garment warp sends intent only, executes Core envelope and returns Fashion layer without Project authority',async()=>{
  const h=harness();const result=await h.executor.run(runInput);
  assert.deepEqual(Object.keys(h.calls.prepare as object).sort(),['anchorSetId','clientRequestId','garmentId','projectId','representationId','sourceArtifactId']);
  assert.equal((h.calls.prepare as any).clientRequestId,runInput.requestId);assert.equal('viewId' in (h.calls.prepare as any),false);assert.equal('destinationMeshSha256' in (h.calls.prepare as any),false);
  const expected=garmentMeshWarpRgba8(basisViewRgba,2,2,{sourcePointsQ16,destinationPointsQ16,triangles,outputWidth:2,outputHeight:2});
  assert.deepEqual([...result.preview.data],[...expected]);assert.equal(result.layerId,layerId);assert.equal(result.contentSha256,outputSha);assert.equal('canonicalArtifactId' in result,false);
  assert.ok(h.calls.upload);assert.ok(h.calls.submit);assert.equal(h.calls.submit.result.executor.kind,'DETERMINISTIC_TOOL');assert.equal(h.calls.submit.result.runtime,'BROWSER_JS');
  assert.equal(h.calls.submit.result.outputs[0].role,'WORKING');assert.equal('managedInputs' in h.calls.submit.result,false);assert.equal('garmentId' in h.calls.submit.result,false);
});

test('browser garment warp fails before candidate upload when purpose-bound envelope lineage differs from ticket',async()=>{
  const h=harness(envelope({viewSha256:'0'.repeat(64)}));
  await assert.rejects(()=>h.executor.run(runInput),/envelope does not match/i);assert.equal(h.calls.upload,undefined);assert.equal(h.calls.submit,undefined);
});

test('browser garment warp fails before loading inputs when Core ticket tries to bind another Project source',async()=>{
  const base=ticket();
  const bad=Object.freeze({...base,inputs:Object.freeze([Object.freeze({...base.inputs[0],artifactId:'different-source'})])}) as LocalExecutionTicketV2;
  const calls:any={};
  const executor=new CoreAuthorizedGarmentMeshWarp(projectId,Object.freeze({
    prepareGarmentMeshWarp:async(payload:any)=>{calls.prepare=payload;return{executionId:bad.requestId,ticket:bad};},
    loadGarmentMeshWarpInput:async()=>{calls.load=true;return envelope();},
    uploadGarmentMeshWarpImage:async()=>{calls.upload=true;throw new Error('must not upload');},
    submitGarmentMeshWarp:async()=>{calls.submit=true;throw new Error('must not submit');},
  }));
  await assert.rejects(()=>executor.run(runInput),/Project input binding is invalid/i);assert.equal(calls.load,undefined);assert.equal(calls.upload,undefined);assert.equal(calls.submit,undefined);
});
