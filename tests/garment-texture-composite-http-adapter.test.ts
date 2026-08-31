import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createGarmentTextureCompositeHttpAdapter } from '../server/core/http/garmentTextureCompositeHttpAdapter.ts';
import type { CoreServerConfig } from '../server/core/config.ts';
import { decodeGarmentTextureCompositeInputEnvelope } from '../src/platform/creative/canonical/garmentTextureCompositeInputEnvelope.ts';

const projectId='11111111-1111-4111-8111-111111111111';const storageId='22222222-2222-4222-8222-222222222222';const layerId='33333333-3333-4333-8333-333333333333';const garmentId='44444444-4444-4444-8444-444444444444';const viewId='55555555-5555-4555-8555-555555555555';const representationId='66666666-6666-4666-8666-666666666666';const anchorSetId='77777777-7777-4777-8777-777777777777';
const projectSha='a'.repeat(64),layerSha='b'.repeat(64),viewSha='c'.repeat(64),representationSha='d'.repeat(64),anchorSha='e'.repeat(64),meshSha='f'.repeat(64),parametersSha='1'.repeat(64);const sourceArtifactId='signed-project-source';const q=65536;
const textureTransform=Object.freeze({scaleXQ16:q,scaleYQ16:q,offsetXQ16:0,offsetYQ16:0,wrapMode:'CLAMP',alphaPolicy:'PRESERVE_BASE_ALPHA'});const producerParameters=Object.freeze({schema:'BERS_GARMENT_TEXTURE_COMPOSITE_Q16_V1',textureTransform,featherRadius:2,colorSpacePolicy:'SRGB_GAMMA_ENCODED_RGBA8'});
const sourcePointsQ16=Object.freeze([Object.freeze([0,0] as const),Object.freeze([q,0] as const),Object.freeze([0,q] as const)]);const triangles=Object.freeze([Object.freeze([0,1,2] as const)]);const projectRgba=Uint8Array.from({length:64},(_,index)=>index%251);const garmentSourceRgba=Uint8Array.from([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,128]);
const delivered=Object.freeze({ticketId:'texture-http-ticket',projectId,sourceArtifactId,projectImageStorageId:storageId,projectImageSha256:projectSha,garmentWarpLayerId:layerId,garmentWarpLayerSha256:layerSha,garmentId,viewId,viewSha256:viewSha,representationId,representationSha256:representationSha,anchorSetId,anchorPayloadSha256:anchorSha,destinationMeshSha256:meshSha,outputWidth:4,outputHeight:4,garmentSourceWidth:2,garmentSourceHeight:2,sourcePointsQ16,destinationPointsQ16:sourcePointsQ16,triangles,producerParameters,producerParametersSha256:parametersSha,projectRgba,garmentSourceRgba});
const config={nodeEnv:'test',allowedWebOrigins:Object.freeze(['http://app.test']),bodyLimitBytes:1_000_000,imageUploadLimitBytes:1_000_000,imageMaxDimension:4096,imageMaxPixels:8_388_608,authChallengeSecret:'test-secret',authPublicOrigin:'http://localhost',allowApiBearerAuth:true} as unknown as CoreServerConfig;const auth=Object.freeze({tenantId:'tenant-http-texture',userId:'user-http-texture'});const headers=Object.freeze({Authorization:'Bearer test.token.value'});

async function withServer(run:(base:string,calls:any)=>Promise<void>){
  const calls:any={prepare:[],uploads:[],submits:[],deliveries:[]};
  const service=Object.freeze({
    prepare:async(command:any,principal:any)=>{calls.prepare.push({command,principal});return Object.freeze({executionId:'texture-http-execution',ticket:Object.freeze({ticketId:delivered.ticketId})});},
    uploadImage:async(input:any,principal:any)=>{calls.uploads.push({input,principal});return Object.freeze({uploadId:'texture-http-upload',kind:'image',role:'COMPOSITE',sha256:'9'.repeat(64),sizeBytes:input.bytes.byteLength,mimeType:'image/png',width:4,height:4});},
    submit:async(input:any,principal:any)=>{calls.submits.push({input,principal});return Object.freeze({executionId:'texture-http-execution',status:'SUCCESS',artifactId:'signed-final-artifact',verification:Object.freeze({valid:true,checks:Object.freeze(['BYTE_EXACT']),errors:Object.freeze([])})});},
  });
  const inputDelivery=Object.freeze({deliver:async(ticketId:string,requestedProjectId:string,principal:any)=>{calls.deliveries.push({ticketId,requestedProjectId,principal});return delivered;}});
  const adapter=createGarmentTextureCompositeHttpAdapter({service:service as any,inputDelivery:inputDelivery as any,auth:{verify:async authorization=>{assert.equal(authorization,'Bearer test.token.value');return auth as any;}},config});
  const server=createServer((request,response)=>{void adapter(request,response);});
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve());});
  try{const address=server.address();if(!address||typeof address==='string')throw new Error('test server address unavailable');await run(`http://127.0.0.1:${address.port}`,calls);}finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}

test('texture HTTP prepare accepts intent plus immutable layer identity and rejects browser Fashion lineage claims',async()=>withServer(async(base,calls)=>{
  const intent={projectId,sourceArtifactId,garmentWarpLayerId:layerId,garmentWarpLayerSha256:layerSha,textureTransform,featherRadius:2,clientRequestId:'http-texture-request'};
  const accepted=await fetch(`${base}/api/core/local-execution/garment-texture-composite/prepare`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(intent)});assert.equal(accepted.status,202);assert.equal(calls.prepare.length,1);assert.deepEqual(Object.keys(calls.prepare[0].command).sort(),Object.keys(intent).sort());assert.equal('garmentId' in calls.prepare[0].command,false);
  const rejected=await fetch(`${base}/api/core/local-execution/garment-texture-composite/prepare`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({...intent,garmentId,viewId,destinationMeshSha256:meshSha})});assert.equal(rejected.status,400);const body=await rejected.json() as any;assert.equal(body.error,'forbidden_client_authority');assert.equal(calls.prepare.length,1);
  const transformRejected=await fetch(`${base}/api/core/local-execution/garment-texture-composite/prepare`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({...intent,textureTransform:{...textureTransform,meshSha256:meshSha}})});assert.equal(transformRejected.status,400);assert.equal(calls.prepare.length,1);
}));

test('texture HTTP input returns one BERSGTC1 envelope and result exposes only signed Project FINAL authority',async()=>withServer(async(base,calls)=>{
  const response=await fetch(`${base}/api/core/local-execution/garment-texture-composite/${encodeURIComponent(delivered.ticketId)}/inputs?${new URLSearchParams({projectId})}`,{headers});assert.equal(response.status,200);assert.equal((response.headers.get('content-type')||'').split(';',1)[0],'application/octet-stream');const decoded=decodeGarmentTextureCompositeInputEnvelope(new Uint8Array(await response.arrayBuffer()));assert.deepEqual([...decoded.projectRgba],[...projectRgba]);assert.deepEqual([...decoded.garmentSourceRgba],[...garmentSourceRgba]);assert.equal(decoded.metadata.garmentWarpLayerSha256,layerSha);assert.equal(decoded.metadata.destinationMeshSha256,meshSha);assert.equal(decoded.metadata.producerParametersSha256,parametersSha);assert.equal(calls.deliveries.length,1);
  const finalized=await fetch(`${base}/api/core/local-execution/garment-texture-composite/${encodeURIComponent(delivered.ticketId)}/result`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({projectId,result:{ticketId:delivered.ticketId}})});assert.equal(finalized.status,200);const body=await finalized.json() as any;assert.equal(body.artifactId,'signed-final-artifact');assert.equal(body.verification.valid,true);assert.equal('checks' in body.verification,false);assert.equal('garmentWarpLayerSha256' in body,false);assert.equal('producerParametersSha256' in body,false);assert.equal(calls.submits.length,1);
}));

test('texture HTTP upload accepts only PNG quarantine bytes and does not mint an artifact identity',async()=>withServer(async(base,calls)=>{
  const wrong=await fetch(`${base}/api/core/local-execution/garment-texture-composite/${encodeURIComponent(delivered.ticketId)}/image-upload?${new URLSearchParams({projectId})}`,{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream'},body:Uint8Array.of(1,2,3)});assert.equal(wrong.status,415);assert.equal(calls.uploads.length,0);
  const accepted=await fetch(`${base}/api/core/local-execution/garment-texture-composite/${encodeURIComponent(delivered.ticketId)}/image-upload?${new URLSearchParams({projectId})}`,{method:'POST',headers:{...headers,'Content-Type':'image/png'},body:Uint8Array.of(137,80,78,71)});assert.equal(accepted.status,201);const body=await accepted.json() as any;assert.equal(body.role,'COMPOSITE');assert.equal('artifactId' in body,false);assert.equal(calls.uploads.length,1);
}));
