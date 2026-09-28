import type { LocalExecutionOutputEvidence, LocalExecutionResultV2, LocalExecutionTicketV2 } from '../../platform/creative/canonical';
import {
  affineTransformRgba8,
  normalizeAffineInverseMatrixQ16,
  type AffineInverseMatrixQ16,
} from '../../platform/creative/deterministic/AffineTransform';
import { AFFINE_TRANSFORM_TOOL_DEFINITION } from '../../platform/creative/deterministic/DeterministicToolRegistry';
import { encodeDeterministicRgbaPng } from '../../platform/creative/deterministic/DeterministicPng';
import type { PixelImage } from '../../platform/creative/pipeline/ControlledLocalEdit';

const TOOL=AFFINE_TRANSFORM_TOOL_DEFINITION;

export type CoreAffineTransformClient=Readonly<{
  prepareAffineTransform(payload:Readonly<{projectId:string;sourceArtifactId:string;clientRequestId:string;inverse:AffineInverseMatrixQ16}>):Promise<Readonly<{executionId:string;ticket:LocalExecutionTicketV2}>>;
  uploadAffineTransformImage(payload:Readonly<{ticketId:string;projectId:string;bytes:Uint8Array}>):Promise<LocalExecutionOutputEvidence>;
  submitAffineTransform(payload:Readonly<{ticketId:string;projectId:string;result:LocalExecutionResultV2}>):Promise<Readonly<{executionId:string;status:string;artifactId?:string;verification?:Readonly<{valid:boolean}>}>>;
}>;

export type LocalAffineTransformInputPort=Readonly<{
  loadImage(artifactId:string):Promise<PixelImage>;
  sha256(artifactId:string):Promise<string>;
}>;

export type AffineTransformRunInput=Readonly<{requestId:string;sourceArtifactId:string;inverse:AffineInverseMatrixQ16}>;
export type AffineTransformPreparedRunInput=Readonly<{ticket:LocalExecutionTicketV2;sourceArtifactId:string;inverse:AffineInverseMatrixQ16}>;
export type AffineTransformPreparedRunResult=Readonly<{target:'LOCAL';runtime:'BROWSER_JS';accelerator:'cpu';preview:PixelImage;latencyMs:number;inverse:AffineInverseMatrixQ16;result:LocalExecutionResultV2}>;
export type AffineTransformRunResult=Readonly<{target:'LOCAL';runtime:'BROWSER_JS';accelerator:'cpu';canonicalArtifactId:string;preview:PixelImage;latencyMs:number;inverse:AffineInverseMatrixQ16}>;

/** Browser computes only the byte-exact candidate authorized by one Core-issued Affine ticket. */
export class CoreAuthorizedAffineTransform{
  constructor(
    private readonly projectId:string,
    private readonly core:CoreAffineTransformClient,
    private readonly inputs:LocalAffineTransformInputPort,
    private readonly clock:()=>number=()=>performance.now(),
  ){if(!projectId)throw new Error('Canonical project identity is required for affine transform');}

  async run(input:AffineTransformRunInput):Promise<AffineTransformRunResult>{
    if(!input.requestId||!input.sourceArtifactId)throw new Error('Affine transform request is incomplete');
    const inverse=normalizeAffineInverseMatrixQ16(input.inverse);
    const prepared=await this.core.prepareAffineTransform({projectId:this.projectId,sourceArtifactId:input.sourceArtifactId,clientRequestId:input.requestId,inverse});
    const candidate=await this.runPrepared({ticket:prepared.ticket,sourceArtifactId:input.sourceArtifactId,inverse});
    const finalized=await this.core.submitAffineTransform({ticketId:candidate.result.ticketId,projectId:this.projectId,result:candidate.result});
    if(finalized.status!=='SUCCESS'||finalized.verification?.valid===false||!finalized.artifactId)throw new Error('Core rejected deterministic affine transform');
    return Object.freeze({target:candidate.target,runtime:candidate.runtime,accelerator:candidate.accelerator,canonicalArtifactId:finalized.artifactId,preview:candidate.preview,latencyMs:candidate.latencyMs,inverse:candidate.inverse});
  }

  async runPrepared(input:AffineTransformPreparedRunInput):Promise<AffineTransformPreparedRunResult>{
    if(!input.sourceArtifactId)throw new Error('Affine transform prepared request is incomplete');
    const inverse=normalizeAffineInverseMatrixQ16(input.inverse);
    const ticket=validateTicket(input.ticket,input.sourceArtifactId,inverse);
    const sourceBinding=ticket.inputs[0];
    const [sourceHash,source]=await Promise.all([this.inputs.sha256(input.sourceArtifactId),this.inputs.loadImage(input.sourceArtifactId)]);
    if(sourceHash.toLowerCase()!==sourceBinding.sha256!.toLowerCase())throw new Error('Affine transform source SHA-256 does not match the Core ticket');
    if(source.format!=='RGBA8'||source.orientation!==1||source.colorSpace!=='srgb')throw new Error('Affine transform source must be canonical orientation-1 RGBA8/sRGB');
    const output=ticket.expectedOutputs[0];
    if(output.width!==source.width||output.height!==source.height)throw new Error('Affine transform geometry does not match the Core output contract');

    const startedAt=this.clock();
    const rgba=affineTransformRgba8(source.data,source.width,source.height,inverse);
    const preview:PixelImage=Object.freeze({width:source.width,height:source.height,data:rgba,format:'RGBA8',orientation:TOOL.pixelContract.orientation,colorSpace:'srgb'});
    const png=await encodeDeterministicRgbaPng(preview);
    const evidence=await this.core.uploadAffineTransformImage({ticketId:ticket.ticketId,projectId:this.projectId,bytes:png});
    assertEvidence(evidence,source.width,source.height);
    const latencyMs=Math.max(0,this.clock()-startedAt);
    const result:LocalExecutionResultV2=Object.freeze({
      ticketId:ticket.ticketId,ticketVersion:ticket.version,requestId:ticket.requestId,workflowId:ticket.workflowId,stepId:ticket.stepId,nonce:ticket.nonce,
      executor:TOOL.executor,runtime:TOOL.browser.runtime,accelerator:TOOL.browser.accelerator,
      outputs:Object.freeze([Object.freeze({...evidence})]),
      metrics:Object.freeze({latencyMs}),
      benchmarkEvidence:Object.freeze({pixelCount:source.width*source.height,deterministicTool:TOOL.parameters.exact.deterministicTool,inverseMatrixQ16:inverse}),
    });
    return Object.freeze({target:'LOCAL',runtime:TOOL.browser.runtime,accelerator:TOOL.browser.accelerator,preview,latencyMs,inverse,result});
  }
}

function validateTicket(ticket:LocalExecutionTicketV2,sourceArtifactId:string,inverse:AffineInverseMatrixQ16):LocalExecutionTicketV2{
  if(!ticket||ticket.version!=='2'||ticket.issuer!=='CORE'||ticket.policy!=='LOCAL_ONLY')throw new Error('Invalid Core affine-transform ticket');
  if(ticket.operation.type!==TOOL.operation.type||ticket.operation.capability!==TOOL.capability||ticket.operation.id!==TOOL.operation.id||ticket.stepId!==TOOL.operation.id)throw new Error('Core ticket does not authorize affine transform');
  if(ticket.cost.paidCloudCredits!==0||ticket.cost.providerCalls!==0)throw new Error('Affine-transform ticket contains forbidden cloud cost authority');
  if(ticket.inputs.length!==1||ticket.inputs[0].kind!==TOOL.inputs[0].kind||ticket.inputs[0].artifactId!==sourceArtifactId||!ticket.inputs[0].sha256||!/^[a-f0-9]{64}$/i.test(ticket.inputs[0].sha256))throw new Error('Core affine-transform ticket source binding is invalid');
  const output=ticket.expectedOutputs[0];
  if(ticket.expectedOutputs.length!==TOOL.output.count||output.kind!==TOOL.output.kind||output.role!==TOOL.output.role||output.mimeTypes?.length!==TOOL.output.mimeTypes.length||output.mimeTypes[0]!==TOOL.output.mimeTypes[0]||!Number.isSafeInteger(output.width)||!Number.isSafeInteger(output.height)||Number(output.width)<1||Number(output.height)<1)throw new Error('Core affine-transform ticket output contract is invalid');
  if(ticket.allowedExecutors.length!==1)throw new Error('Core affine-transform ticket must authorize exactly one executor');
  const executor=ticket.allowedExecutors[0];
  if(executor.kind!==TOOL.executor.kind||executor.toolId!==TOOL.executor.toolId||executor.version!==TOOL.executor.version)throw new Error('Core affine-transform executor binding is invalid');
  const p=ticket.operation.parameters as Readonly<Record<string,unknown>>|undefined;
  const exact=TOOL.parameters.exact;
  const bound=normalizeAffineInverseMatrixQ16({m00Q16:Number(p?.m00Q16),m01Q16:Number(p?.m01Q16),txQ16:Number(p?.txQ16),m10Q16:Number(p?.m10Q16),m11Q16:Number(p?.m11Q16),tyQ16:Number(p?.tyQ16)});
  if(!sameMatrix(bound,inverse)||p?.sourceArtifactId!==sourceArtifactId||p?.deterministicTool!==exact.deterministicTool||p?.coordinateSpace!==exact.coordinateSpace||p?.matrix!==exact.matrix||p?.fixedPointBits!==exact.fixedPointBits||p?.interpolation!==exact.interpolation||p?.rounding!==exact.rounding||p?.borderPolicy!==exact.borderPolicy||p?.alphaPolicy!==exact.alphaPolicy||p?.outputGeometry!==exact.outputGeometry||p?.maxOutputPixels!==exact.maxOutputPixels)throw new Error('Core affine-transform ticket parameters do not match the requested transform');
  return ticket;
}
function sameMatrix(a:AffineInverseMatrixQ16,b:AffineInverseMatrixQ16){return a.m00Q16===b.m00Q16&&a.m01Q16===b.m01Q16&&a.txQ16===b.txQ16&&a.m10Q16===b.m10Q16&&a.m11Q16===b.m11Q16&&a.tyQ16===b.tyQ16;}
function assertEvidence(evidence:LocalExecutionOutputEvidence,width:number,height:number):void{
  if(!evidence.uploadId||evidence.kind!==TOOL.output.kind||evidence.role!==TOOL.output.role||evidence.mimeType!==TOOL.output.mimeTypes[0]||evidence.width!==width||evidence.height!==height||!/^[a-f0-9]{64}$/i.test(evidence.sha256)||!Number.isInteger(evidence.sizeBytes)||evidence.sizeBytes<1)throw new Error('Core affine-transform upload evidence is invalid');
}
