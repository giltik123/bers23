import { createOriginalMask, displayToOriginal, type MaskSource } from '../../platform/creative/pipeline/ControlledLocalEdit';
import type { AnalysisTransform, BrushStroke, CanonicalMaskArtifactPort, InteractiveSegmentationPort, MaskQualityResult, PolygonComposition, PolygonVertex, PromptPoint, SelectionDraftSnapshot, SelectionMode, SelectionTelemetry } from './contracts';
import type { PrivacyMode } from '../../platform/creative/local-ai';

const MAX_HISTORY = 30, FULL_WARNING = .97, TINY_WARNING = .0001;
export const MAX_SELECTION_MORPHOLOGY_RADIUS = 32;
export const MAX_SELECTION_MORPHOLOGY_DIMENSION = 8192;
export const MAX_SELECTION_MORPHOLOGY_PIXELS = 16_777_216;
export const MAX_SELECTION_MORPHOLOGY_WORK = 67_108_864;
export const MAX_SELECTION_POLYGON_VERTICES = 256;
export const MAX_SELECTION_POLYGON_WORK = 17_000_000;
export const MIN_SELECTION_LASSO_SAMPLE_PIXELS = 2;
const POLYGON_FIXED_SCALE = 256;
type HistoryEntry = Readonly<{ alpha: Uint8Array; source: MaskSource; provenance: readonly string[] }>;
type Draft = { id: string; imageArtifactId: string; width: number; height: number; alpha: Uint8Array; source: MaskSource; state: SelectionDraftSnapshot['state']; mode: SelectionMode; points: PromptPoint[]; polygonVertices: PolygonVertex[]; provenance: string[]; requestId?: string; canonicalArtifactId?: string; refinementParentArtifactId?: string; quality?: MaskQualityResult; warning?: string; history: HistoryEntry[]; historyIndex: number; startedAt: number; manualCorrections: number; undoCount: number };
export class SelectionApplicationService {
  #draft?: Draft; #sequence = 0;
  constructor(private readonly segmentation: InteractiveSegmentationPort, private readonly artifacts: CanonicalMaskArtifactPort, private readonly telemetry: (event: SelectionTelemetry) => void = () => {}, private readonly now = () => performance.now()) {}
  start(input: Readonly<{ imageArtifactId: string; width: number; height: number }>): SelectionDraftSnapshot { if (!input.imageArtifactId || input.width < 1 || input.height < 1) throw new Error('Invalid selection source'); this.segmentation.cancel(this.#draft?.requestId ?? ''); const alpha = new Uint8Array(input.width * input.height); const initial: HistoryEntry = Object.freeze({ alpha: new Uint8Array(alpha), source: 'USER', provenance: Object.freeze([]) }); this.#draft = { ...input, id: `selection-${++this.#sequence}`, alpha, source: 'USER', state: 'NOTHING_SELECTED', mode: 'SMART_SELECT', points: [], polygonVertices: [], provenance: [], history: [initial], historyIndex: 0, startedAt: this.now(), manualCorrections: 0, undoCount: 0 }; return this.snapshot(); }
  setMode(mode: SelectionMode) { this.required().mode = mode; return this.snapshot(); }
  polygonVertex(input: Readonly<{ displayPoint: { x: number; y: number }; view: BrushStroke['view'] }>): SelectionDraftSnapshot {
    const d=this.required();
    if(d.mode!=='POLYGON') throw new Error('Polygon vertices require POLYGON mode');
    if(d.polygonVertices.length>=MAX_SELECTION_POLYGON_VERTICES) throw new Error('Selection polygon vertex limit exceeded');
    const original=displayToOriginal(input.displayPoint,input.view);
    const vertex=quantizePolygonVertex(original,d.width,d.height);
    const previous=d.polygonVertices.at(-1);
    if(!previous||previous.x!==vertex.x||previous.y!==vertex.y)d.polygonVertices.push(vertex);
    return this.snapshot();
  }
  clearPolygon(): SelectionDraftSnapshot { const d=this.required(); d.polygonVertices=[]; return this.snapshot(); }
  applyPolygon(composition: PolygonComposition): SelectionDraftSnapshot {
    const d=this.required();
    if(d.mode!=='POLYGON') throw new Error('Polygon application requires POLYGON mode');
    const polygon=rasterizeSelectionPolygon(d.polygonVertices,d.width,d.height);
    const alpha=composeSelectionMask(d.alpha,polygon,composition);
    const source=polygonSource(composition);
    this.commit(d,alpha,source);
    d.polygonVertices=[];
    d.canonicalArtifactId=undefined;
    d.manualCorrections++;
    d.quality=assessMask(alpha,d.width,d.height,d.quality?.confidence??1);
    d.state=d.quality.empty?'NOTHING_SELECTED':'REFINING';
    return this.snapshot();
  }
  lassoStart(input: Readonly<{ displayPoint: { x: number; y: number }; view: BrushStroke['view'] }>): SelectionDraftSnapshot {
    const d=this.required();
    if(d.mode!=='LASSO') throw new Error('Lasso capture requires LASSO mode');
    d.polygonVertices=[];
    d.warning=undefined;
    return this.lassoVertex(input,true);
  }
  lassoVertex(input: Readonly<{ displayPoint: { x: number; y: number }; view: BrushStroke['view'] }>,force=false): SelectionDraftSnapshot {
    const d=this.required();
    if(d.mode!=='LASSO') throw new Error('Lasso vertices require LASSO mode');
    const original=displayToOriginal(input.displayPoint,input.view);
    const vertex=quantizePolygonVertex(original,d.width,d.height);
    const previous=d.polygonVertices.at(-1);
    if(previous&&previous.x===vertex.x&&previous.y===vertex.y)return this.snapshot();
    if(previous&&!force){const dx=(vertex.x-previous.x)*POLYGON_FIXED_SCALE,dy=(vertex.y-previous.y)*POLYGON_FIXED_SCALE,threshold=MIN_SELECTION_LASSO_SAMPLE_PIXELS*POLYGON_FIXED_SCALE;if(dx*dx+dy*dy<threshold*threshold)return this.snapshot();}
    if(d.polygonVertices.length>=MAX_SELECTION_POLYGON_VERTICES){
      d.warning=`Lasso point limit reached (${MAX_SELECTION_POLYGON_VERTICES}). Apply or clear the current path.`;
      return this.snapshot();
    }
    d.polygonVertices.push(vertex);
    return this.snapshot();
  }
  clearLasso(): SelectionDraftSnapshot { const d=this.required(); d.polygonVertices=[]; d.warning=undefined; return this.snapshot(); }
  applyLasso(composition: PolygonComposition): SelectionDraftSnapshot {
    const d=this.required();
    if(d.mode!=='LASSO') throw new Error('Lasso application requires LASSO mode');
    const polygon=rasterizeSelectionPolygon(d.polygonVertices,d.width,d.height);
    const alpha=composeSelectionMask(d.alpha,polygon,composition);
    const source=lassoSource(composition);
    this.commit(d,alpha,source);
    d.polygonVertices=[];
    d.warning=undefined;
    d.canonicalArtifactId=undefined;
    d.manualCorrections++;
    d.quality=assessMask(alpha,d.width,d.height,d.quality?.confidence??1);
    d.state=d.quality.empty?'NOTHING_SELECTED':'REFINING';
    return this.snapshot();
  }
  async smartPoint(input: Readonly<{ displayPoint: { x: number; y: number }; view: BrushStroke['view']; negative?: boolean; privacyMode: PrivacyMode; analysisMaxEdge?: number; memoryBudgetBytes?: number }>): Promise<SelectionDraftSnapshot> {
    const d = this.required(), original = displayToOriginal(input.displayPoint, input.view), point: PromptPoint = { x: original.x, y: original.y, label: input.negative ? 'NEGATIVE' : 'POSITIVE', coordinateSpace: 'ORIGINAL' };
    if (d.requestId) this.segmentation.cancel(d.requestId);
    d.points.push(point); const analysis = chooseAnalysis(d.width, d.height, input.analysisMaxEdge ?? 1024, input.memoryBudgetBytes ?? 512 * 1024 * 1024); const requestId = `${d.id}:request:${++this.#sequence}`; d.requestId = requestId; d.state = 'SELECTING'; d.warning = undefined;
    const start = this.now();
    try { const result = await this.segmentation.segment({ requestId, imageArtifactId: d.imageArtifactId, analysis, points: d.points, privacyMode: input.privacyMode }); if (this.#draft !== d || d.requestId !== requestId) return this.snapshot(); const candidate = [...result.candidates].filter(c => c.width === analysis.analysisWidth && c.height === analysis.analysisHeight && c.alpha.length === c.width * c.height).sort((a,b) => b.score-a.score)[0]; if (!candidate) throw new Error('Segmentation returned no valid mask'); this.commit(d, upscale(candidate.alpha, candidate.width, candidate.height, d.width, d.height), 'SEGMENTATION'); d.canonicalArtifactId = result.canonicalArtifactId; d.refinementParentArtifactId = result.canonicalArtifactId; d.quality = assessMask(d.alpha, d.width, d.height, candidate.score); d.state = 'SELECTED'; this.telemetry({ selectionMethod: 'SMART_SELECT', executionTarget: result.target, modelId: result.modelId, modelVersion: result.modelVersion, analysisResolution: [analysis.analysisWidth, analysis.analysisHeight], originalResolution: [d.width,d.height], selectionLatency: this.now()-start, modelLatency: result.latencyMs, refinementLatency: 0, maskCoverage: d.quality.coverage, manualCorrections: d.manualCorrections, undoCount: d.undoCount, peakEstimatedMemory: estimateMemory(analysis, 35_000_000) }); return this.snapshot(); }
    catch (error) { if (d.requestId !== requestId) return this.snapshot(); d.canonicalArtifactId = undefined; d.refinementParentArtifactId = undefined; d.state = 'LOCAL_UNAVAILABLE'; d.warning = `${error instanceof Error ? error.message : 'Local selection unavailable'}. Manual brush remains available.`; return this.snapshot(); }
  }
  brush(stroke: BrushStroke): SelectionDraftSnapshot { const d=this.required(); if (!stroke.points.length || stroke.radius<=0 || stroke.hardness<0 || stroke.hardness>1) throw new Error('Invalid brush stroke'); const alpha=new Uint8Array(d.alpha), subtract=d.mode==='BRUSH_SUBTRACT'; for (const p of stroke.points) paint(alpha,d.width,d.height,displayToOriginal(p,stroke.view),stroke.radius/originalScale(stroke.view),stroke.hardness,subtract); this.commit(d,alpha,subtract?'MANUAL_SUBTRACT':'MANUAL_ADD'); d.canonicalArtifactId=undefined; d.manualCorrections++; d.state='REFINING'; d.quality=assessMask(alpha,d.width,d.height,d.quality?.confidence??1); return this.snapshot(); }
  clear() { const d=this.required(); this.commit(d,new Uint8Array(d.alpha.length),'USER'); d.canonicalArtifactId=undefined; d.state='NOTHING_SELECTED'; return this.snapshot(); }
  grow(radius: number): SelectionDraftSnapshot { return this.morphology('GROW', radius); }
  shrink(radius: number): SelectionDraftSnapshot { return this.morphology('SHRINK', radius); }
  feather(radius: number): SelectionDraftSnapshot {
    const d=this.required();
    if(d.state!=='SELECTED'&&d.state!=='REFINING') throw new Error('Selection is not ready to feather');
    const alpha=featherSelectionMask(d.alpha,d.width,d.height,radius);
    this.commit(d,alpha,'OPERATION_FEATHERED');
    d.canonicalArtifactId=undefined;
    d.manualCorrections++;
    d.state='REFINING';
    d.quality=assessMask(alpha,d.width,d.height,d.quality?.confidence??1);
    return this.snapshot();
  }
  invert() { const d=this.required(); if(d.state!=='SELECTED'&&d.state!=='REFINING') throw new Error('Selection is not ready to invert'); this.commit(d,Uint8Array.from(d.alpha,v=>255-v),'USER'); d.canonicalArtifactId=undefined; d.manualCorrections++; d.state='REFINING'; d.quality=assessMask(d.alpha,d.width,d.height,d.quality?.confidence??1); return this.snapshot(); }
  undo() { const d=this.required(); if(d.historyIndex>0){d.historyIndex--;this.restoreHistory(d,d.history[d.historyIndex]);d.canonicalArtifactId=undefined;d.undoCount++;d.quality=assessMask(d.alpha,d.width,d.height,d.quality?.confidence??1);} return this.snapshot(); }
  redo() { const d=this.required(); if(d.historyIndex<d.history.length-1){d.historyIndex++;this.restoreHistory(d,d.history[d.historyIndex]);d.canonicalArtifactId=undefined;d.quality=assessMask(d.alpha,d.width,d.height,d.quality?.confidence??1);} return this.snapshot(); }
  cancel() { const id=this.#draft?.requestId; if(id)this.segmentation.cancel(id); this.#draft=undefined; }
  async done() { const d=this.required(), quality=assessMask(d.alpha,d.width,d.height,d.quality?.confidence??1); if(quality.empty) throw new Error('Cannot persist an empty selection'); const mask=createOriginalMask({artifactId:`mask-${d.id}`,width:d.width,height:d.height,alpha:d.alpha,source:d.source}); const metadata={coordinateSpace:'ORIGINAL',encoding:'ALPHA_8_LOSSLESS',provenance:[...d.provenance],quality,sourceImageArtifactId:d.imageArtifactId,parentMaskArtifactId:d.refinementParentArtifactId}; const artifact=d.canonicalArtifactId&&this.artifacts.admitted?await this.artifacts.admitted(d.canonicalArtifactId,mask,metadata):await this.artifacts.persist(mask,metadata); d.state='READY'; return artifact; }
  snapshot(): SelectionDraftSnapshot { const d=this.required(); return Object.freeze({...d,alpha:new Uint8Array(d.alpha),points:Object.freeze([...d.points]),polygonVertices:Object.freeze(d.polygonVertices.map(vertex=>Object.freeze({...vertex}))),provenance:Object.freeze([...d.provenance]),canUndo:d.historyIndex>0,canRedo:d.historyIndex<d.history.length-1,history:undefined,historyIndex:undefined,startedAt:undefined,manualCorrections:undefined,undoCount:undefined,canonicalArtifactId:undefined,refinementParentArtifactId:undefined,source:undefined}) as SelectionDraftSnapshot; }
  private morphology(kind: 'GROW' | 'SHRINK', radius: number): SelectionDraftSnapshot {
    const d=this.required();
    if(d.state!=='SELECTED'&&d.state!=='REFINING') throw new Error('Selection is not ready for morphology');
    const alpha=morphSelectionMask(d.alpha,d.width,d.height,radius,kind);
    const source: MaskSource=kind==='GROW'?'OPERATION_EXPANDED':'OPERATION_CONTRACTED';
    this.commit(d,alpha,source);
    d.canonicalArtifactId=undefined;
    d.manualCorrections++;
    d.state='REFINING';
    d.quality=assessMask(alpha,d.width,d.height,d.quality?.confidence??1);
    return this.snapshot();
  }
  private restoreHistory(d: Draft, entry: HistoryEntry) { d.alpha=new Uint8Array(entry.alpha); d.source=entry.source; d.provenance=[...entry.provenance]; d.state=historyState(entry); }
  private required(){if(!this.#draft)throw new Error('No active selection draft');return this.#draft}
  private commit(d:Draft,alpha:Uint8Array,source:MaskSource){d.alpha=alpha;d.source=source;d.provenance.push(source);d.history=d.history.slice(0,d.historyIndex+1);d.history.push(Object.freeze({alpha:new Uint8Array(alpha),source,provenance:Object.freeze([...d.provenance])}));if(d.history.length>MAX_HISTORY)d.history.shift();d.historyIndex=d.history.length-1;}
}
function historyState(entry: HistoryEntry): SelectionDraftSnapshot['state'] {
  if(!entry.alpha.some(value=>value!==0)) return 'NOTHING_SELECTED';
  return entry.source==='SEGMENTATION'?'SELECTED':'REFINING';
}
function polygonSource(composition: PolygonComposition): MaskSource {
  if(composition==='REPLACE') return 'POLYGON_REPLACE';
  if(composition==='ADD') return 'POLYGON_ADD';
  if(composition==='SUBTRACT') return 'POLYGON_SUBTRACT';
  if(composition==='INTERSECT') return 'POLYGON_INTERSECT';
  throw new Error('Selection polygon composition is unsupported');
}
function lassoSource(composition: PolygonComposition): MaskSource {
  if(composition==='REPLACE') return 'LASSO_REPLACE';
  if(composition==='ADD') return 'LASSO_ADD';
  if(composition==='SUBTRACT') return 'LASSO_SUBTRACT';
  if(composition==='INTERSECT') return 'LASSO_INTERSECT';
  throw new Error('Selection lasso composition is unsupported');
}
function quantizePolygonVertex(point: Readonly<{x:number;y:number}>,width:number,height:number): PolygonVertex {
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y)) throw new Error('Selection polygon vertex is invalid');
  const x=Math.max(0,Math.min(width*POLYGON_FIXED_SCALE,Math.round(point.x*POLYGON_FIXED_SCALE)))/POLYGON_FIXED_SCALE;
  const y=Math.max(0,Math.min(height*POLYGON_FIXED_SCALE,Math.round(point.y*POLYGON_FIXED_SCALE)))/POLYGON_FIXED_SCALE;
  return Object.freeze({x,y,coordinateSpace:'ORIGINAL' as const});
}
export function rasterizeSelectionPolygon(vertices: readonly PolygonVertex[],width:number,height:number): Uint8Array {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>MAX_SELECTION_MORPHOLOGY_DIMENSION||height>MAX_SELECTION_MORPHOLOGY_DIMENSION) throw new Error('Selection polygon dimensions exceed deterministic bounds');
  const pixels=width*height;
  if(!Number.isSafeInteger(pixels)||pixels>MAX_SELECTION_MORPHOLOGY_PIXELS) throw new Error('Selection polygon pixel count exceeds deterministic bounds');
  if(vertices.length<3) throw new Error('Selection polygon requires at least three vertices');
  if(vertices.length>MAX_SELECTION_POLYGON_VERTICES) throw new Error('Selection polygon vertex limit exceeded');
  const work=pixels+height*vertices.length;
  if(!Number.isSafeInteger(work)||work>MAX_SELECTION_POLYGON_WORK) throw new Error('Selection polygon work exceeds deterministic bounds');
  const fixed=vertices.map(vertex=>{
    if(vertex.coordinateSpace!=='ORIGINAL'||!Number.isFinite(vertex.x)||!Number.isFinite(vertex.y)) throw new Error('Selection polygon vertex is invalid');
    const x=Math.round(vertex.x*POLYGON_FIXED_SCALE),y=Math.round(vertex.y*POLYGON_FIXED_SCALE);
    if(x<0||x>width*POLYGON_FIXED_SCALE||y<0||y>height*POLYGON_FIXED_SCALE) throw new Error('Selection polygon vertex is outside source bounds');
    return Object.freeze({x,y});
  });
  const unique=new Set(fixed.map(vertex=>`${vertex.x}:${vertex.y}`));
  if(unique.size<3) throw new Error('Selection polygon requires three distinct vertices');
  const output=new Uint8Array(pixels),intersections:number[]=[];
  for(let y=0;y<height;y++){
    intersections.length=0;
    const py=y*POLYGON_FIXED_SCALE+POLYGON_FIXED_SCALE/2;
    for(let i=0;i<fixed.length;i++){
      let a=fixed[i],b=fixed[(i+1)%fixed.length];
      if(a.y===b.y) continue;
      if(a.y>b.y){const swap=a;a=b;b=swap;}
      if(py<a.y||py>=b.y) continue;
      const dy=b.y-a.y,dx=b.x-a.x;
      const numerator=a.x*dy+(py-a.y)*dx;
      intersections.push(Math.floor(numerator/dy));
    }
    intersections.sort((a,b)=>a-b);
    if(intersections.length%2!==0) throw new Error('Selection polygon scanline parity is invalid');
    for(let i=0;i<intersections.length;i+=2){
      const left=intersections[i],right=intersections[i+1];
      if(right<=left) continue;
      const start=Math.max(0,Math.ceil((left-POLYGON_FIXED_SCALE/2)/POLYGON_FIXED_SCALE));
      const end=Math.min(width,Math.ceil((right-POLYGON_FIXED_SCALE/2)/POLYGON_FIXED_SCALE));
      if(end>start) output.fill(255,y*width+start,y*width+end);
    }
  }
  if(!output.some(value=>value!==0)) throw new Error('Selection polygon selects no pixels');
  return output;
}
export function composeSelectionMask(current: Uint8Array,polygon: Uint8Array,composition: PolygonComposition): Uint8Array {
  if(current.length!==polygon.length) throw new Error('Selection polygon composition dimensions mismatch');
  if(composition!=='REPLACE'&&composition!=='ADD'&&composition!=='SUBTRACT'&&composition!=='INTERSECT') throw new Error('Selection polygon composition is unsupported');
  const output=new Uint8Array(current.length);
  if(composition==='REPLACE') return new Uint8Array(polygon);
  for(let i=0;i<current.length;i++){
    const inside=polygon[i]!==0;
    if(composition==='ADD') output[i]=inside?255:current[i];
    else if(composition==='SUBTRACT') output[i]=inside?0:current[i];
    else if(composition==='INTERSECT') output[i]=inside?current[i]:0;
    else throw new Error('Selection polygon composition is unsupported');
  }
  return output;
}
export function chooseAnalysis(originalWidth:number,originalHeight:number,maxEdge:number,memoryBudget:number):AnalysisTransform { let edge=Math.max(256,maxEdge); while(edge>256){const scale=Math.min(1,edge/Math.max(originalWidth,originalHeight)),w=Math.max(1,Math.round(originalWidth*scale)),h=Math.max(1,Math.round(originalHeight*scale)); const t={originalWidth,originalHeight,analysisWidth:w,analysisHeight:h,scaleX:w/originalWidth,scaleY:h/originalHeight,offsetX:0,offsetY:0};if(estimateMemory(t,35_000_000)<=memoryBudget)return Object.freeze(t);edge=Math.floor(edge*.75)} const scale=Math.min(1,256/Math.max(originalWidth,originalHeight));return Object.freeze({originalWidth,originalHeight,analysisWidth:Math.max(1,Math.round(originalWidth*scale)),analysisHeight:Math.max(1,Math.round(originalHeight*scale)),scaleX:scale,scaleY:scale,offsetX:0,offsetY:0})}
export function estimateMemory(t:AnalysisTransform,modelWorkingBytes:number){return t.analysisWidth*t.analysisHeight*(4+3+1)+modelWorkingBytes}
export function assessMask(alpha:Uint8Array,width:number,height:number,confidence:number):MaskQualityResult { let selected=0,edges=0,components=0;const seen=new Uint8Array(alpha.length);for(let i=0;i<alpha.length;i++){if(alpha[i])selected++;if(alpha[i]&&((i%width&& !alpha[i-1])||(i>=width&&!alpha[i-width])))edges++;if(alpha[i]&&!seen[i]){components++;const q=[i];seen[i]=1;while(q.length){const n=q.pop()!;for(const x of [n-1,n+1,n-width,n+width])if(x>=0&&x<alpha.length&&alpha[x]&&!seen[x]&&Math.abs((x%width)-(n%width))<=1){seen[x]=1;q.push(x)}}}}const coverage=selected/(width*height),warning=selected===0?'EMPTY':coverage<TINY_WARNING?'TINY':coverage>FULL_WARNING?'SUSPICIOUSLY_FULL':undefined;return Object.freeze({coverage,fragmentation:components,edgeComplexity:edges/Math.max(1,selected),confidence,empty:selected===0,full:coverage===1,warning})}
export function morphSelectionMask(alpha: Uint8Array, width: number, height: number, radius: number, kind: 'GROW' | 'SHRINK'): Uint8Array {
  if (kind !== 'GROW' && kind !== 'SHRINK') throw new Error('Selection morphology kind is unsupported');
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > MAX_SELECTION_MORPHOLOGY_DIMENSION || height > MAX_SELECTION_MORPHOLOGY_DIMENSION) throw new Error('Selection morphology dimensions exceed deterministic bounds');
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels !== alpha.length || pixels > MAX_SELECTION_MORPHOLOGY_PIXELS) throw new Error('Selection morphology pixel count exceeds deterministic bounds');
  if (!Number.isSafeInteger(radius) || radius < 1 || radius > MAX_SELECTION_MORPHOLOGY_RADIUS) throw new Error('Selection morphology radius exceeds deterministic bounds');
  const work = pixels * 4;
  if (!Number.isSafeInteger(work) || work > MAX_SELECTION_MORPHOLOGY_WORK) throw new Error('Selection morphology work exceeds deterministic bounds');
  const intermediate = new Uint8Array(pixels);
  const output = new Uint8Array(pixels);
  extremePass(alpha, intermediate, width, height, radius, true, kind === 'GROW');
  extremePass(intermediate, output, width, height, radius, false, kind === 'GROW');
  return output;
}
export function featherSelectionMask(alpha: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > MAX_SELECTION_MORPHOLOGY_DIMENSION || height > MAX_SELECTION_MORPHOLOGY_DIMENSION) throw new Error('Selection feather dimensions exceed deterministic bounds');
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels !== alpha.length || pixels > MAX_SELECTION_MORPHOLOGY_PIXELS) throw new Error('Selection feather pixel count exceeds deterministic bounds');
  if (!Number.isSafeInteger(radius) || radius < 1 || radius > MAX_SELECTION_MORPHOLOGY_RADIUS) throw new Error('Selection feather radius exceeds deterministic bounds');
  const work = pixels * 4;
  if (!Number.isSafeInteger(work) || work > MAX_SELECTION_MORPHOLOGY_WORK) throw new Error('Selection feather work exceeds deterministic bounds');
  const horizontalSums = new Uint32Array(pixels);
  const output = new Uint8Array(pixels);
  const diameter = radius * 2 + 1;
  const area = diameter * diameter;
  const halfArea = Math.floor(area / 2);

  for (let y = 0; y < height; y++) {
    const base = y * width;
    let sum = 0;
    for (let x = 0; x <= Math.min(width - 1, radius); x++) sum += alpha[base + x];
    for (let x = 0; x < width; x++) {
      horizontalSums[base + x] = sum;
      const add = x + radius + 1;
      const remove = x - radius;
      if (add < width) sum += alpha[base + add];
      if (remove >= 0) sum -= alpha[base + remove];
    }
  }

  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = 0; y <= Math.min(height - 1, radius); y++) sum += horizontalSums[y * width + x];
    for (let y = 0; y < height; y++) {
      output[y * width + x] = Math.floor((sum + halfArea) / area);
      const add = y + radius + 1;
      const remove = y - radius;
      if (add < height) sum += horizontalSums[add * width + x];
      if (remove >= 0) sum -= horizontalSums[remove * width + x];
    }
  }
  return output;
}
function extremePass(input: Uint8Array, output: Uint8Array, width: number, height: number, radius: number, horizontal: boolean, maximum: boolean) {
  const length = horizontal ? width : height;
  const lines = horizontal ? height : width;
  const stride = horizontal ? 1 : width;
  const queue = new Int32Array(length);
  for (let line = 0; line < lines; line++) {
    const base = horizontal ? line * width : line;
    let head = 0, tail = 0, next = 0;
    for (let position = 0; position < length; position++) {
      const right = Math.min(length - 1, position + radius);
      while (next <= right) {
        const value = input[base + next * stride];
        while (tail > head) {
          const previous = input[base + queue[tail - 1] * stride];
          if (maximum ? previous > value : previous < value) break;
          tail--;
        }
        queue[tail++] = next++;
      }
      const left = position - radius;
      while (tail > head && queue[head] < left) head++;
      output[base + position * stride] = !maximum && (left < 0 || position + radius >= length)
        ? 0
        : input[base + queue[head] * stride];
    }
  }
}
function upscale(a:Uint8Array,sw:number,sh:number,dw:number,dh:number){const out=new Uint8Array(dw*dh);for(let y=0;y<dh;y++)for(let x=0;x<dw;x++)out[y*dw+x]=a[Math.min(sh-1,Math.floor(y*sh/dh))*sw+Math.min(sw-1,Math.floor(x*sw/dw))];return out}
function originalScale(v:BrushStroke['view']){return Math.min((v.displayWidth/(v.devicePixelRatio??1))/v.originalWidth,(v.displayHeight/(v.devicePixelRatio??1))/v.originalHeight)*(v.zoom??1)}
function paint(a:Uint8Array,w:number,h:number,p:{x:number;y:number},r:number,hard:number,sub:boolean){const minX=Math.max(0,Math.floor(p.x-r)),maxX=Math.min(w-1,Math.ceil(p.x+r)),minY=Math.max(0,Math.floor(p.y-r)),maxY=Math.min(h-1,Math.ceil(p.y+r));for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const d=Math.hypot(x-p.x,y-p.y);if(d>r)continue;const strength=d<=r*hard?255:Math.round(255*(1-(d-r*hard)/Math.max(.001,r*(1-hard))));const i=y*w+x;a[i]=sub?Math.max(0,a[i]-strength):Math.max(a[i],strength)}}
