import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createGarmentMeshWarpHttpAdapter } from '../server/core/http/garmentMeshWarpHttpAdapter.ts';
import type { CoreServerConfig } from '../server/core/config.ts';
import { decodeGarmentMeshWarpInputEnvelope } from '../src/platform/creative/canonical/garmentMeshWarpInputEnvelope.ts';

const projectId='11111111-1111-4111-8111-111111111111';const garmentId='22222222-2222-4222-8222-222222222222';const viewId='33333333-3333-4333-8333-333333333333';const representationId='44444444-4444-4444-8444-444444444444';const anchorSetId='55555555-5555-4555-8555-555555555555';const storageId='66666666-6666-4666-8666-666666666666';
const projectSha='c'.repeat(64),viewSha='a'.repeat(64),representationSha='b'.repeat(64),anchorSha='d'.repeat(64),meshSha='e'.repeat(64),contentSha='f'.repeat(64);const sourceArtifactId='signed-source';const q=65536;
const sourcePointsQ16=Object.freeze([Object.freeze([0,0] as const),Object.freeze([q,0] as const),Object.freeze([q,q] as const),Object.freeze([0,q] as const)]);const triangles=Object.freeze([Object.freeze([0,1,2] as const),Object.freeze([0,2,3] as const)]);const basisViewRgba=Uint8Array.from([1,2,3,255,4,5,6,255,7,8,9,255,10,11,12,128]);
const config={nodeEnv:'test',allowedWebOrigins:Object.freeze(['http://app.test']),bodyLimitBytes:1_000_000,imageUploadLimitBytes:1_000_000,imageMaxDimension:4096,imageMaxPixels:8_388_608,authChallengeSecret:'test-secret',authPublicOrigin:'http://localhost',allowApiBearerAuth:true} as unknown as CoreServerConfig;
const auth=Object.freeze({tenantId:'tenant-http-warp',userId:'user-http-warp'});
const delivered=Object.freeze({ticketId:'warp-http-ticket',projectId,sourceArtifactId,projectImageStorageId:storageId,projectImageSha256:projectSha,outputWidth:2,outputHeight:2,garmentId,viewId,viewSha256:viewSha,representationId,representationSha256:representationSha,anchorSetId,anchorPayloadSha256:anchorSha,basisViewWidth:2,basisViewHeight:2,basisViewRgba,sourcePointsQ16,destinationPointsQ16:sourcePointsQ16,triangles,destinationMeshSha256:meshSha});

async function withServer(run:(base:string,calls:any)=>Promise<void>){
  const calls:any={prepare:[],uploads:[],submits:[],deliveries:[]};
  const service=Object.freeze({
    prepare:async(command:any,principal:any)=>{calls.prepare.push({command,principal});return Object.freeze({executionId:'warp-http-execution',ticket:Object.freeze({ticketId:delivered.ticketId})});},
    uploadImage:async(input:any,principal:any)=>{calls.uploads.push({input,principal});return Object.freeze({uploadId:'warp-http-upload',kind:'image',role:'WORKING',sha256:'9'.repeat(64),sizeBytes:input.bytes.byteLength,mimeType:'image/png',width:2,height:2});},
    submit:async(input:any,principal:any)=>{calls.submits.push({input,principal});return Object.freeze({executionId:'warp-http-execution',status:'SUCCESS',layerId:'77777777-7777-4777-8777-777777777777',contentSha256:contentSha,verification:Object.freeze({valid:true,checks:Object.freeze(['BYTE_EXACT']),errors:Object.freeze([])})});},
  });
  const inputDelivery=Object.freeze({deliver:async(ticketId:string,requestedProjectId:string,principal:any)=>{calls.deliveries.push({ticketId,requestedProjectId,principal});return delivered;}});
  const adapter=createGarmentMeshWarpHttpAdapter({service:service as any,inputDelivery:inputDelivery as any,auth:{verify:async authorization=>{assert.equal(authorization,'Bearer test.token.value');return auth as any;}},config});
  const server=createServer((request,response)=>{void adapter(request,response);});
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve());});
  try{const address=server.address();if(!address||typeof address==='string')throw new Error('test server address unavailable');await run(`http://127.0.0.1:${address.port}`,calls);}finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}
const headers=Object.freeze({Authorization:'Bearer test.token.value'});

test('garment warp HTTP prepare accepts intent only and rejects browser geometry authority',async()=>withServer(async(base,calls)=>{
  const intent={projectId,sourceArtifactId,garmentId,representationId,anchorSetId,clientRequestId:'http-warp-request'};
  const accepted=await fetch(`${base}/api/core/local-execution/garment-mesh-warp/prepare`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(intent)});assert.equal(accepted.status,202);assert.equal(calls.prepare.length,1);assert.deepEqual(Object.keys(calls.prepare[0].command).sort(),Object.keys(intent).sort());assert.equal('viewId' in calls.prepare[0].command,false);
  const rejected=await fetch(`${base}/api/core/local-execution/garment-mesh-warp/prepare`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({...intent,viewId,destinationMeshSha256:meshSha})});assert.equal(rejected.status,400);const body=await rejected.json() as any;assert.equal(body.error,'forbidden_client_authority');assert.equal(calls.prepare.length,1,'forbidden browser authority must not reach Core service');
}));

test('garment warp HTTP input is one versioned purpose-bound envelope and result exposes only Fashion layer authority',async()=>withServer(async(base,calls)=>{
  const response=await fetch(`${base}/api/core/local-execution/garment-mesh-warp/${encodeURIComponent(delivered.ticketId)}/inputs?${new URLSearchParams({projectId})}`,{headers});assert.equal(response.status,200);assert.equal((response.headers.get('content-type')||'').split(';',1)[0],'application/octet-stream');const decoded=decodeGarmentMeshWarpInputEnvelope(new Uint8Array(await response.arrayBuffer()));assert.deepEqual([...decoded.basisViewRgba],[...basisViewRgba]);assert.equal(decoded.metadata.viewSha256,viewSha);assert.equal(decoded.metadata.representationSha256,representationSha);assert.equal(decoded.metadata.anchorPayloadSha256,anchorSha);assert.equal(decoded.metadata.destinationMeshSha256,meshSha);assert.equal(calls.deliveries.length,1);
  const resultPayload={ticketId:delivered.ticketId,ticketVersion:'2',requestId:'warp-http-execution',workflowId:'warp-http-execution',stepId:'garment-mesh-warp',nonce:'nonce',executor:{kind:'DETERMINISTIC_TOOL',toolId:'garment-mesh-warp',version:'1'},runtime:'BROWSER_JS',accelerator:'cpu',outputs:[],metrics:{latencyMs:1}};
  const finalized=await fetch(`${base}/api/core/local-execution/garment-mesh-warp/${encodeURIComponent(delivered.ticketId)}/result`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({projectId,result:resultPayload})});assert.equal(finalized.status,200);const body=await finalized.json() as any;assert.equal(body.layerId,'77777777-7777-4777-8777-777777777777');assert.equal(body.contentSha256,contentSha);assert.equal(body.verification.valid,true);assert.equal('artifactId' in body,false);assert.equal('checks' in body.verification,false);assert.equal(calls.submits.length,1);
}));

test('garment warp HTTP upload accepts only PNG candidate bytes and never widens the response to a Project artifact',async()=>withServer(async(base,calls)=>{
  const wrong=await fetch(`${base}/api/core/local-execution/garment-mesh-warp/${encodeURIComponent(delivered.ticketId)}/image-upload?${new URLSearchParams({projectId})}`,{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream'},body:Uint8Array.of(1,2,3)});assert.equal(wrong.status,415);assert.equal(calls.uploads.length,0);
  const accepted=await fetch(`${base}/api/core/local-execution/garment-mesh-warp/${encodeURIComponent(delivered.ticketId)}/image-upload?${new URLSearchParams({projectId})}`,{method:'POST',headers:{...headers,'Content-Type':'image/png'},body:Uint8Array.of(137,80,78,71)});assert.equal(accepted.status,201);const body=await accepted.json() as any;assert.equal(body.role,'WORKING');assert.equal('artifactId' in body,false);assert.equal(calls.uploads.length,1);
}));
