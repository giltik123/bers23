import type { Artifact, ProviderRequest, ProviderResult, RetryPolicy, Scope } from '../providers/index.ts';

export type ProviderExecutionState = 'CREATED'|'QUEUED'|'STARTING'|'RUNNING'|'WAITING'|'COMPLETED'|'FAILED'|'CANCELLED'|'TIMEOUT';
export type StreamEvent = Readonly<{ state:'PENDING'|'PROGRESS'|'COMPLETED'; progress:number; timestamp:number; data?:unknown }>;
export interface ProviderRuntimeDependencies { readonly id:()=>string; readonly now:()=>number; readonly random:()=>number; readonly sleep?:(milliseconds:number)=>Promise<void> }
export interface RuntimeHttpRequest { readonly url:string; readonly method:'GET'|'POST'; readonly headers:Readonly<Record<string,string>>; readonly body?:string|Uint8Array; readonly timeoutMs:number }
export interface RuntimeHttpResponse { readonly status:number; readonly headers:Readonly<Record<string,string>>; readonly body:unknown; readonly bytes?:Uint8Array }
export interface ProviderTransport { send(request:RuntimeHttpRequest, signal:AbortSignal):Promise<RuntimeHttpResponse>; cancel(requestId:string):Promise<boolean>|boolean; health():Promise<'ONLINE'|'OFFLINE'|'DEGRADED'>|'ONLINE'|'OFFLINE'|'DEGRADED' }

export function deepFreeze<T>(value:T):Readonly<T>{ if(value&&typeof value==='object'&&!Object.isFrozen(value)){ if(ArrayBuffer.isView(value))return value; Object.freeze(value); for(const child of Object.values(value as object)) deepFreeze(child); } return value; }
const clone=<T>(value:T):T=>structuredClone(value);
const immutable=<T>(value:T):Readonly<T>=>deepFreeze(clone(value));
const scopeKey=(scope:Scope)=>{ if(!scope?.tenantId||!scope.projectId||!scope.userId) throw new Error('tenantId, projectId and userId are required'); return `${scope.tenantId}\0${scope.projectId}\0${scope.userId}`; };

export class ProviderRequestBuilder {
  build(request:ProviderRequest, config:{baseUrl:string; path?:string; method?:'GET'|'POST'; headers?:Readonly<Record<string,string>>; timeoutMs?:number}):Readonly<RuntimeHttpRequest>{
    scopeKey(request.scope); const method=config.method??'POST'; const url=new URL(config.path??request.operation, config.baseUrl.endsWith('/')?config.baseUrl:`${config.baseUrl}/`);
    const payload={operation:request.operation,input:request.input,options:request.options,scope:request.scope};
    if(method==='GET') url.searchParams.set('request',JSON.stringify(payload));
    return immutable({url:url.toString(),method,headers:{accept:'application/json',...(method==='POST'?{'content-type':'application/json'}:{}),...config.headers},...(method==='POST'?{body:JSON.stringify(payload)}:{}),timeoutMs:config.timeoutMs??30_000});
  }
}

export class ProviderResponseParser {
  parse(response:RuntimeHttpResponse):Readonly<ProviderResult>{
    const body=typeof response.body==='string'?JSON.parse(response.body):response.body as Record<string,unknown>;
    if(response.status<200||response.status>=300) throw new Error(`Provider HTTP ${response.status}`);
    const result=(body&&typeof body==='object'&&'result' in body?body.result:body) as Partial<ProviderResult>;
    return immutable({status:result.status??'SUCCESS',artifacts:result.artifacts??[],metrics:result.metrics??{},credits:result.credits??0,latency:result.latency??0,quality:result.quality??0,warnings:result.warnings??[]});
  }
}

type FetchLike=(input:string, init:RequestInit)=>Promise<Response>;
export class HttpProviderTransport implements ProviderTransport {
  #controllers=new Map<string,AbortController>();
  constructor(private readonly fetcher:FetchLike=globalThis.fetch.bind(globalThis)){}
  async send(request:RuntimeHttpRequest, signal:AbortSignal):Promise<RuntimeHttpResponse>{
    const controller=new AbortController(); const key=request.url; this.#controllers.set(key,controller);
    const relay=()=>controller.abort(signal.reason); signal.addEventListener('abort',relay,{once:true});
    const timer=setTimeout(()=>controller.abort(new DOMException('Timeout','TimeoutError')),request.timeoutMs);
    try{ const response=await this.fetcher(request.url,{method:request.method,headers:{...request.headers},body:request.body as BodyInit|undefined,signal:controller.signal}); const buffer=new Uint8Array(await response.arrayBuffer()); const contentType=response.headers.get('content-type')??''; const text=new TextDecoder().decode(buffer); let body:unknown=text; if(contentType.includes('json')) body=text?JSON.parse(text):{}; const headers:Record<string,string>={};response.headers.forEach((value,key)=>{headers[key]=value;});return immutable({status:response.status,headers,body,bytes:buffer}); }
    finally{ clearTimeout(timer); signal.removeEventListener('abort',relay); this.#controllers.delete(key); }
  }
  cancel(requestId:string){ const controller=this.#controllers.get(requestId); if(!controller)return false; controller.abort(); return true; }
  health(){ return 'ONLINE' as const; }
}

export interface SessionEvent { readonly state:ProviderExecutionState; readonly timestamp:number; readonly detail?:string }
export class ProviderExecutionSession {
  #state:ProviderExecutionState='CREATED'; #timeline:SessionEvent[]; readonly controller=new AbortController(); readonly id:string; readonly scope:Scope;
  constructor(scope:Scope, private readonly deps:ProviderRuntimeDependencies){ scopeKey(scope); this.scope=immutable(scope) as Scope; this.id=deps.id(); this.#timeline=[immutable({state:'CREATED',timestamp:deps.now()})]; }
  get state(){return this.#state;} transition(state:ProviderExecutionState,detail?:string){ const terminal=['COMPLETED','FAILED','CANCELLED','TIMEOUT']; if(terminal.includes(this.#state))throw new Error(`Session is terminal: ${this.#state}`); this.#state=state; this.#timeline.push(immutable({state,timestamp:this.deps.now(),...(detail?{detail}:{})})); return this.snapshot(); }
  cancel(){ if(!['COMPLETED','FAILED','CANCELLED','TIMEOUT'].includes(this.#state)){this.controller.abort();this.transition('CANCELLED');return true;} return false; }
  snapshot(){return immutable({id:this.id,scope:this.scope,state:this.#state,timeline:this.#timeline});}
}

export interface RuntimeMetrics { readonly networkTime:number; readonly serialization:number; readonly upload:number; readonly download:number; readonly queue:number; readonly providerTime:number; readonly retryCount:number }
export class RetryRuntime {
  #failures=0; #openedAt:number|null=null;
  constructor(private readonly policy:RetryPolicy,private readonly deps:ProviderRuntimeDependencies){}
  async run<T>(operation:(attempt:number)=>Promise<T>):Promise<{value:T;retries:number}>{
    if(this.#openedAt!==null&&this.deps.now()-this.#openedAt<this.policy.circuitBreaker.resetAfterMs)throw new Error('Circuit breaker is open');
    if(this.#openedAt!==null)this.reset(); let last:unknown;
    for(let attempt=0;attempt<=this.policy.retries;attempt++)try{const value=await operation(attempt);this.reset();return{value,retries:attempt};}catch(error){last=error;this.#failures++;if(this.#failures>=this.policy.circuitBreaker.failureThreshold)this.#openedAt=this.deps.now();if(attempt<this.policy.retries)await(this.deps.sleep?.(this.policy.backoffMs*2**attempt)??Promise.resolve());}
    throw last;
  }
  reset(){this.#failures=0;this.#openedAt=null;} snapshot(){return immutable({failures:this.#failures,openedAt:this.#openedAt,policy:this.policy});}
}

export interface LoadedArtifact { readonly artifact:Artifact; readonly bytes:readonly number[]; readonly hash:string; readonly size:number; readonly mime:string }
type Download=(uri:string,signal?:AbortSignal)=>Promise<{bytes:Uint8Array;mime:string}>;
export class ArtifactLoader {
  constructor(private readonly downloadFn:Download=async(uri,signal)=>{const response=await fetch(uri,{signal});return{bytes:new Uint8Array(await response.arrayBuffer()),mime:response.headers.get('content-type')??'application/octet-stream'};}){}
  async load(artifact:Artifact,signal?:AbortSignal):Promise<Readonly<LoadedArtifact>>{ if(!artifact.uri)throw new Error('Artifact URI is required');const downloaded=await this.downloadFn(artifact.uri,signal);const raw=new Uint8Array(downloaded.bytes);const digest=await crypto.subtle.digest('SHA-256',raw);const hash=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');return immutable({artifact,bytes:[...raw],hash,size:raw.byteLength,mime:downloaded.mime}); }
}

export class IntegrityValidator {
  validate(loaded:LoadedArtifact,expected:{hash?:string;mime?:string;maxSize?:number;dimensions?:{width:number;height:number}}={}):Readonly<{valid:boolean;errors:readonly string[]}>{const errors:string[]=[];if(expected.hash&&loaded.hash!==expected.hash)errors.push('Hash mismatch');if(expected.mime&&loaded.mime!==expected.mime)errors.push('MIME mismatch');if(expected.maxSize!==undefined&&loaded.size>expected.maxSize)errors.push('Size limit exceeded');if(expected.dimensions){const metadata=loaded.artifact.metadata as {width?:number;height?:number};if(metadata.width!==expected.dimensions.width||metadata.height!==expected.dimensions.height)errors.push('Dimensions mismatch');}return immutable({valid:errors.length===0,errors});}
}

export interface ProviderRuntimeSnapshot { readonly session:ReturnType<ProviderExecutionSession['snapshot']>;readonly request:RuntimeHttpRequest;readonly response?:RuntimeHttpResponse;readonly metrics:RuntimeMetrics;readonly retries:number;readonly transport:string;readonly artifacts:readonly Artifact[];readonly timeline:readonly SessionEvent[];readonly result?:ProviderResult }
export class ProviderRuntimeDebugger { trace(snapshot:ProviderRuntimeSnapshot){return immutable({request:snapshot.request,transport:snapshot.transport,provider:new URL(snapshot.request.url).hostname,response:snapshot.response,artifacts:snapshot.artifacts,metrics:snapshot.metrics,result:snapshot.result,timeline:snapshot.timeline});} }

export class CreativeProviderRuntime {
  #sessions=new Map<string,ProviderExecutionSession>();#snapshots=new Map<string,ProviderRuntimeSnapshot>();#streams=new Map<string,StreamEvent[]>();
  constructor(private readonly transport:ProviderTransport,private readonly deps:ProviderRuntimeDependencies,private readonly builder=new ProviderRequestBuilder(),private readonly parser=new ProviderResponseParser(),private readonly retryPolicy:RetryPolicy={retries:2,backoffMs:100,timeoutMs:30_000,circuitBreaker:{failureThreshold:5,resetAfterMs:60_000}}){}
  async execute(request:ProviderRequest,config:{baseUrl:string;path?:string;method?:'GET'|'POST';headers?:Readonly<Record<string,string>>;timeoutMs?:number}):Promise<Readonly<ProviderResult>>{
    scopeKey(request.scope);const session=new ProviderExecutionSession(request.scope,this.deps);this.#sessions.set(session.id,session);session.transition('QUEUED');const queuedAt=this.deps.now();session.transition('STARTING');const serializationAt=this.deps.now();const http=this.builder.build(request,{...config,timeoutMs:config.timeoutMs??this.retryPolicy.timeoutMs});const serialization=this.deps.now()-serializationAt;session.transition('RUNNING');this.emit(session.id,'PENDING',0);const networkAt=this.deps.now();let response:RuntimeHttpResponse|undefined;let retries=0;
    try{const runtime=new RetryRuntime(this.retryPolicy,this.deps);const execution=await runtime.run(async()=>this.transport.send(http,session.controller.signal));response=execution.value;retries=execution.retries;session.transition('WAITING');this.emit(session.id,'PROGRESS',.75);const result=this.parser.parse(response);session.transition('COMPLETED');this.emit(session.id,'COMPLETED',1,result);const metrics=immutable({networkTime:this.deps.now()-networkAt,serialization,upload:typeof http.body==='string'?new TextEncoder().encode(http.body).byteLength:0,download:response.bytes?.byteLength??0,queue:Math.max(0,serializationAt-queuedAt),providerTime:result.latency,retryCount:retries});const snap=immutable({session:session.snapshot(),request:http,response,metrics,retries,transport:this.transport.constructor.name,artifacts:result.artifacts,timeline:session.snapshot().timeline,result}) as ProviderRuntimeSnapshot;this.#snapshots.set(session.id,snap);return result;
    }catch(error){const timeout=(error as Error).name==='TimeoutError';if(session.state!=='CANCELLED'){if(session.controller.signal.aborted)session.transition('CANCELLED');else session.transition(timeout?'TIMEOUT':'FAILED',(error as Error).message);}const metrics=immutable({networkTime:this.deps.now()-networkAt,serialization,upload:0,download:0,queue:Math.max(0,serializationAt-queuedAt),providerTime:0,retryCount:retries});this.#snapshots.set(session.id,immutable({session:session.snapshot(),request:http,response,metrics,retries,transport:this.transport.constructor.name,artifacts:[],timeline:session.snapshot().timeline}));throw error;}
  }
  cancel(scope:Scope,id:string){this.assertScope(scope,id);return this.#sessions.get(id)!.cancel();}status(scope:Scope,id:string){this.assertScope(scope,id);return this.#sessions.get(id)!.state;}health(){return this.transport.health();}
  async replay(scope:Scope,id:string){this.assertScope(scope,id);const snapshot=this.#snapshots.get(id);if(!snapshot)throw new Error('Execution has no snapshot');const response=await this.transport.send(snapshot.request,new AbortController().signal);return this.parser.parse(response);}
  snapshot(scope:Scope,id:string){this.assertScope(scope,id);const value=this.#snapshots.get(id);if(!value)throw new Error('Execution has no snapshot');return immutable(value);}
  debug(scope:Scope,id:string){return new ProviderRuntimeDebugger().trace(this.snapshot(scope,id));}stream(scope:Scope,id:string){this.assertScope(scope,id);return immutable(this.#streams.get(id)??[]);}
  private emit(id:string,state:StreamEvent['state'],progress:number,data?:unknown){this.#streams.set(id,[...(this.#streams.get(id)??[]),immutable({state,progress,timestamp:this.deps.now(),...(data===undefined?{}:{data})})]);}
  private assertScope(scope:Scope,id:string){scopeKey(scope);const session=this.#sessions.get(id);if(!session)throw new Error(`Unknown session: ${id}`);if(scopeKey(session.scope)!==scopeKey(scope))throw new Error('Scope mismatch');}
}
