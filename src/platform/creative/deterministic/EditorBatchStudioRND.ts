import { cropRgba8, normalizeCropRect, type CropRect } from './Crop.ts';
import { resizeRgba8, normalizeResizeDimensions, type ResizeDimensions } from './Resize.ts';
import {
  orthogonalTransformRgba8,
  orthogonalTransformOutputGeometry,
  normalizeOrthogonalTransformMode,
  type OrthogonalTransformMode,
} from './OrthogonalTransform.ts';

export type EditorBatchStepRND =
  | Readonly<{ kind: 'CROP'; rect: CropRect }>
  | Readonly<{ kind: 'RESIZE'; target: ResizeDimensions }>
  | Readonly<{ kind: 'ORTHOGONAL_TRANSFORM'; mode: OrthogonalTransformMode }>;

export type EditorBatchPlanRND = Readonly<{
  kind: 'BERS_EDITOR_BATCH_PLAN_RND';
  sourceArtifactId: string;
  sourceSha256: string;
  inputWidth: number;
  inputHeight: number;
  outputWidth: number;
  outputHeight: number;
  estimatedPixelVisits: number;
  steps: readonly EditorBatchStepRND[];
  authority: 'NONE_RESEARCH_ONLY';
}>;

export type EditorBatchResultRND = Readonly<{
  kind: 'BERS_EDITOR_BATCH_RESULT_RND';
  sourceSha256: string;
  outputSha256: string;
  width: number;
  height: number;
  bytes: Uint8ClampedArray;
  executedStepCount: number;
  coreAuthorityGranted: false;
  cloudProviderUsed: false;
}>;

const MAX_DIMENSION = 4096;
const MAX_PIXELS = 4_194_304;
const MAX_STEPS = 8;
const MAX_PIXEL_VISITS = 32_000_000;
const REFERENCE = /^[a-zA-Z0-9][a-zA-Z0-9:_.-]{0,127}$/u;
const SHA = /^[0-9a-f]{64}$/u;

function imageGeometry(width: number,height: number): number {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION ||
      width * height > MAX_PIXELS) throw new Error('Editor Batch Studio image geometry is out of bounds');
  return width * height;
}
function closedFields(value: object, fields: readonly string[]): boolean {
  return Object.keys(value).every(field=>fields.includes(field));
}
/**
 * A plan is not a Project/Artifact execution ticket. Validation only prepares
 * deterministic local operation geometry for an already trusted Core source.
 */
export function compileEditorBatchPlanRND(input: Readonly<{
  sourceArtifactId: string; sourceSha256: string;
  width: number; height: number; steps: readonly EditorBatchStepRND[];
}>): EditorBatchPlanRND {
  if (!input || typeof input.sourceArtifactId !== 'string' || !REFERENCE.test(input.sourceArtifactId) ||
      typeof input.sourceSha256 !== 'string' || !SHA.test(input.sourceSha256)) {
    throw new Error('Editor Batch Studio requires source Artifact ID and canonical SHA');
  }
  if(!closedFields(input,['sourceArtifactId','sourceSha256','width','height','steps'])) {
    throw new Error('Editor Batch Studio unapproved plan metadata');
  }
  imageGeometry(input.width,input.height);
  if (!Array.isArray(input.steps) || input.steps.length<1 || input.steps.length>MAX_STEPS) {
    throw new Error('Editor Batch Studio requires 1..8 deterministic steps');
  }
  let width=input.width,height=input.height,visits=0;
  const steps:EditorBatchStepRND[]=[];
  for(const step of input.steps){
    if (!step || typeof step !== 'object') throw new Error('Editor Batch Studio malformed step');
    const beforePixels=imageGeometry(width,height);
    let nextWidth=width,nextHeight=height;
    if(step.kind==='CROP'){
      if(!closedFields(step,['kind','rect']))throw new Error('Editor Batch Studio unapproved crop fields');
      const rect=normalizeCropRect(step.rect,width,height);
      if(!closedFields(step.rect,['x','y','width','height']))throw new Error('Editor Batch Studio unapproved crop coordinates');
      nextWidth=rect.width;nextHeight=rect.height;
      steps.push(Object.freeze({kind:'CROP',rect}));
    } else if(step.kind==='RESIZE'){
      if(!closedFields(step,['kind','target']))throw new Error('Editor Batch Studio unapproved resize fields');
      const target=normalizeResizeDimensions(step.target,width,height);
      if(!closedFields(step.target,['width','height']))throw new Error('Editor Batch Studio unapproved resize coordinates');
      nextWidth=target.width;nextHeight=target.height;
      steps.push(Object.freeze({kind:'RESIZE',target}));
    } else if(step.kind==='ORTHOGONAL_TRANSFORM'){
      if(!closedFields(step,['kind','mode']))throw new Error('Editor Batch Studio unapproved transform fields');
      const mode=normalizeOrthogonalTransformMode(step.mode);
      const geometry=orthogonalTransformOutputGeometry(width,height,mode);
      nextWidth=geometry.width;nextHeight=geometry.height;
      steps.push(Object.freeze({kind:'ORTHOGONAL_TRANSFORM',mode}));
    } else {
      throw new Error('Editor Batch Studio refuses unadmitted operation');
    }
    const afterPixels=imageGeometry(nextWidth,nextHeight);
    visits+=beforePixels+afterPixels;
    if(!Number.isSafeInteger(visits)||visits>MAX_PIXEL_VISITS){
      throw new Error('Editor Batch Studio exceeds CPU/memory operation budget');
    }
    width=nextWidth;height=nextHeight;
  }
  return Object.freeze({
    kind:'BERS_EDITOR_BATCH_PLAN_RND',
    sourceArtifactId:input.sourceArtifactId,sourceSha256:input.sourceSha256,
    inputWidth:input.width,inputHeight:input.height,
    outputWidth:width,outputHeight:height,
    estimatedPixelVisits:visits,
    steps:Object.freeze(steps),authority:'NONE_RESEARCH_ONLY',
  });
}
async function sha256(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Editor Batch Studio requires native SHA-256');
  const digest=await globalThis.crypto.subtle.digest('SHA-256',new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}

/**
 * Explicit per-image local execution: no payment, upload, publishing, Final or
 * remote provider. Abort is observed before hashing, after hashing, and
 * between deterministic operations (not inside a synchronous pixel loop).
 */
export async function executeEditorBatchPlanRND(
  plan: EditorBatchPlanRND,
  input: Uint8Array | Uint8ClampedArray,
  signal?: AbortSignal,
): Promise<EditorBatchResultRND> {
  if (!plan || plan.kind !== 'BERS_EDITOR_BATCH_PLAN_RND' ||
      plan.authority !== 'NONE_RESEARCH_ONLY') throw new Error('Editor Batch Studio plan has no valid R&D identity');
  if (!closedFields(plan,['kind','sourceArtifactId','sourceSha256','inputWidth','inputHeight',
      'outputWidth','outputHeight','estimatedPixelVisits','steps','authority'])) {
    throw new Error('Editor Batch Studio plan includes unapproved metadata');
  }
  // Recompile untrusted runtime plans instead of relying on TypeScript/frozen flags.
  const trusted=compileEditorBatchPlanRND({
    sourceArtifactId:plan.sourceArtifactId,sourceSha256:plan.sourceSha256,
    width:plan.inputWidth,height:plan.inputHeight,steps:plan.steps,
  });
  if(trusted.outputWidth!==plan.outputWidth ||
     trusted.outputHeight!==plan.outputHeight ||
     trusted.estimatedPixelVisits!==plan.estimatedPixelVisits) {
    throw new Error('Editor Batch Studio plan geometry was tampered with');
  }
  if(!(input instanceof Uint8Array||input instanceof Uint8ClampedArray) ||
      input.byteLength!==trusted.inputWidth*trusted.inputHeight*4){
    throw new Error('Editor Batch Studio source requires exact RGBA8 bytes');
  }
  if(signal?.aborted)throw new Error('Editor Batch Studio cancelled');
  let data=new Uint8ClampedArray(input);
  const sourceHash=await sha256(new Uint8Array(data));
  if(sourceHash!==trusted.sourceSha256)throw new Error('Editor Batch Studio source SHA mismatch');
  let width=trusted.inputWidth,height=trusted.inputHeight;
  let completed=0;
  for(const step of trusted.steps){
    if(signal?.aborted)throw new Error('Editor Batch Studio cancelled');
    if(step.kind==='CROP'){
      data=cropRgba8(data,width,height,step.rect);
      width=step.rect.width;height=step.rect.height;
    }else if(step.kind==='RESIZE'){
      data=resizeRgba8(data,width,height,step.target);
      width=step.target.width;height=step.target.height;
    }else{
      const size=orthogonalTransformOutputGeometry(width,height,step.mode);
      data=orthogonalTransformRgba8(data,width,height,step.mode);
      width=size.width;height=size.height;
    }
    completed++;
  }
  if(signal?.aborted)throw new Error('Editor Batch Studio cancelled');
  const outputHash=await sha256(new Uint8Array(data));
  if(signal?.aborted)throw new Error('Editor Batch Studio cancelled');
  const output=new Uint8ClampedArray(data);
  return Object.freeze({
    kind:'BERS_EDITOR_BATCH_RESULT_RND',sourceSha256:trusted.sourceSha256,
    outputSha256:outputHash,width,height,
    get bytes():Uint8ClampedArray { return new Uint8ClampedArray(output); },
    executedStepCount:completed,coreAuthorityGranted:false,cloudProviderUsed:false,
  });
}
