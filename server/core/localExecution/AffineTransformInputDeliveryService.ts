import type { CreativeArtifact, LocalExecutionTicketV2 } from '../../../src/platform/creative/canonical/index.ts';
import {
  AFFINE_TRANSFORM_CAPABILITY,
  AFFINE_TRANSFORM_OPERATION,
  AFFINE_TRANSFORM_STEP_ID,
  AFFINE_TRANSFORM_TOOL_ID,
  AFFINE_TRANSFORM_TOOL_VERSION,
  normalizeAffineInverseMatrixQ16,
} from '../../../src/platform/creative/deterministic/AffineTransform.ts';
import { AFFINE_TRANSFORM_TOOL_DEFINITION } from '../../../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import { admitLocalExecutionInputs } from './LocalExecutionInputAdmission.ts';
import type { LocalExecutionLedgerV2 } from './LocalExecutionLedger.ts';

const TOOL = AFFINE_TRANSFORM_TOOL_DEFINITION;

export type AffineTransformInputDelivery = Readonly<{
  ticketId: string;
  sourceArtifactId: string;
  sourceSha256: string;
  width: number;
  height: number;
  sourceRgba: Uint8Array;
}>;

export type AffineTransformInputDeliveryDependencies = Readonly<{
  admission: LocalExecutionLedgerV2;
  ownsArtifacts: (scope: AuthenticatedScope & { projectId: string }, artifactIds: readonly string[]) => Promise<boolean>;
  hydrateArtifacts: (scope: AuthenticatedScope & { projectId: string }, sourceId: string, maskIds: readonly string[]) => Promise<readonly CreativeArtifact[]>;
  now?: () => number;
}>;

/** Read-only Affine source delivery. It cannot read arbitrary canonical artifacts. */
export class AffineTransformInputDeliveryService {
  readonly #now: () => number;
  constructor(private readonly dependencies: AffineTransformInputDeliveryDependencies) { this.#now = dependencies.now ?? Date.now; }

  async deliver(input: Readonly<{ ticketId: string; projectId: string }>, auth: AuthenticatedScope): Promise<AffineTransformInputDelivery> {
    const ticketId=input.ticketId?.trim(); const projectId=input.projectId?.trim();
    if(!ticketId||!projectId) throw serviceError(400,'local_input_delivery_request_invalid','ticketId and projectId are required');
    const ticket=await this.dependencies.admission.getV2(ticketId);
    if(!ticket) throw serviceError(404,'local_ticket_not_found','Local affine-transform ticket not found');
    assertSameScope(ticket,{...auth,projectId});
    if(this.#now()>=ticket.expiresAt) throw serviceError(410,'local_ticket_expired','Local affine-transform ticket has expired');
    assertTicket(ticket);

    if(ticket.inputs.length!==1||ticket.inputs[0].kind!=='image'||!ticket.inputs[0].sha256) throw serviceError(409,'local_input_contract_mismatch','Affine transform requires exactly one hash-bound IMAGE input');
    const binding=ticket.inputs[0];
    if(!await this.dependencies.ownsArtifacts(ticket.scope,[binding.artifactId])) throw serviceError(409,'local_input_lineage_unavailable','Canonical affine-transform source is no longer available for this ticket');

    let artifacts:readonly CreativeArtifact[];
    try{artifacts=await this.dependencies.hydrateArtifacts(ticket.scope,binding.artifactId,[]);}
    catch{throw serviceError(409,'local_input_lineage_unavailable','Canonical affine-transform source hydration failed');}
    const admission=admitLocalExecutionInputs(ticket,artifacts);
    if(!admission.allowed) throw serviceError(409,`local_input_${admission.reasonCode.toLowerCase()}`,`Canonical affine-transform input admission failed: ${admission.reasonCode}`);

    const source=artifacts.find(artifact=>artifact.id===binding.artifactId&&artifact.kind==='image');
    const value=source?.value as Readonly<{width?:unknown;height?:unknown;data?:unknown}>|undefined;
    if(!Number.isSafeInteger(value?.width)||!Number.isSafeInteger(value?.height)||!(value?.data instanceof Uint8ClampedArray)) throw serviceError(409,'canonical_source_pixels_unavailable','Canonical affine-transform source RGBA pixels are unavailable');
    const width=Number(value.width),height=Number(value.height);
    if(width<1||height<1||value.data.length!==width*height*4||source?.image?.orientation!==1||source.image.colorSpace!=='srgb') throw serviceError(409,'local_input_geometry_mismatch','Canonical affine-transform source geometry is invalid');

    const output=ticket.expectedOutputs[0];
    if(ticket.expectedOutputs.length!==1||output.width!==width||output.height!==height) throw serviceError(409,'local_output_geometry_mismatch','Affine-transform ticket geometry must exactly match the canonical source');
    return Object.freeze({ticketId,sourceArtifactId:binding.artifactId,sourceSha256:binding.sha256,width,height,sourceRgba:Uint8Array.from(value.data)});
  }
}

function assertTicket(ticket:LocalExecutionTicketV2):void{
  if(ticket.version!=='2'||ticket.issuer!=='CORE'||ticket.policy!=='LOCAL_ONLY'||ticket.operation.type!==AFFINE_TRANSFORM_OPERATION||ticket.operation.capability!==AFFINE_TRANSFORM_CAPABILITY||ticket.operation.id!==AFFINE_TRANSFORM_STEP_ID||ticket.stepId!==AFFINE_TRANSFORM_STEP_ID) throw serviceError(409,'local_ticket_capability_mismatch','Ticket is not an affine-transform local-execution contract');
  if(ticket.cost.paidCloudCredits!==0||ticket.cost.providerCalls!==0) throw serviceError(409,'local_ticket_cost_mismatch','Affine-transform ticket must remain zero-cloud');
  if(ticket.allowedExecutors.length!==1) throw serviceError(409,'local_ticket_executor_mismatch','Affine-transform ticket must bind exactly one executor');
  const executor=ticket.allowedExecutors[0];
  if(executor.kind!=='DETERMINISTIC_TOOL'||executor.toolId!==AFFINE_TRANSFORM_TOOL_ID||executor.version!==AFFINE_TRANSFORM_TOOL_VERSION) throw serviceError(409,'local_ticket_executor_mismatch','Affine-transform deterministic executor binding is invalid');
  const p=ticket.operation.parameters as Readonly<Record<string,unknown>>|undefined;
  normalizeAffineInverseMatrixQ16({m00Q16:Number(p?.m00Q16),m01Q16:Number(p?.m01Q16),txQ16:Number(p?.txQ16),m10Q16:Number(p?.m10Q16),m11Q16:Number(p?.m11Q16),tyQ16:Number(p?.tyQ16)});
  const exact=TOOL.parameters.exact;
  if(!p||p.deterministicTool!==exact.deterministicTool||p.coordinateSpace!==exact.coordinateSpace||p.matrix!==exact.matrix||p.fixedPointBits!==exact.fixedPointBits||p.interpolation!==exact.interpolation||p.rounding!==exact.rounding||p.borderPolicy!==exact.borderPolicy||p.alphaPolicy!==exact.alphaPolicy||p.outputGeometry!==exact.outputGeometry||p.maxOutputPixels!==exact.maxOutputPixels) throw serviceError(409,'local_ticket_parameter_mismatch','Affine-transform ticket semantic parameters are invalid');
}

function assertSameScope(ticket:LocalExecutionTicketV2,scope:AuthenticatedScope&{projectId:string}):void{
  if(ticket.scope.tenantId!==scope.tenantId||ticket.scope.userId!==scope.userId||ticket.scope.projectId!==scope.projectId) throw serviceError(403,'local_execution_scope_denied','Local affine-transform input delivery scope denied');
}
function serviceError(status:number,code:string,message:string):Error&{status:number;code:string}{return Object.assign(new Error(message),{status,code});}
