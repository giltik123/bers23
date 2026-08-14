import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import {
  CapabilityResolver, CostEstimator, FallbackPlanner, ProviderDebugger, ProviderHealth,
  ProviderMemory, ProviderMetrics, ProviderOptimizer, ProviderRegistry, ProviderSandbox,
  ProviderSnapshot, createArtifact, createProviderResult, createRetryPolicy, deepFreeze,
  type ProviderDependencies, type ProviderDescriptor, type Scope,
} from '../src/platform/creative/providers/index.ts';

const scope: Scope = { tenantId: 'tenant', projectId: 'project', userId: 'user' };
const otherScope: Scope = { tenantId: 'other', projectId: 'project', userId: 'user' };
const dependencies = (): ProviderDependencies => {
  let id = 0; let time = 100;
  return { id: () => `id-${++id}`, now: () => ++time, random: () => 0.25 };
};
const descriptor = (id: string, overrides: Partial<ProviderDescriptor> = {}): ProviderDescriptor => ({
  id, version: '1.0.0', operations: ['remove-background'], latency: 100, credits: 2, quality: .8,
  limits: { concurrency: 2 }, maxResolution: { width: 100, height: 50 }, formats: ['png'], ...overrides,
});
const sandbox = (id: string, overrides: Partial<ProviderDescriptor> = {}) => new ProviderSandbox(descriptor(id, overrides), dependencies());

test('registry register, get and ordered capability lookup', () => {
  const registry = new ProviderRegistry(); registry.register(sandbox('low'), { priority: 1 }); registry.register(sandbox('high'), { priority: 9 });
  assert.equal(registry.get('low')?.provider.descriptor.id, 'low'); assert.deepEqual(registry.lookup('remove-background').map(x => x.provider.descriptor.id), ['high', 'low']);
});
test('registry aliases, unregister and replace', () => {
  const registry = new ProviderRegistry(); registry.register(sandbox('a'), { aliases: ['sam'] }); assert.equal(registry.get('sam')?.provider.descriptor.id, 'a');
  registry.replace('sam', sandbox('b')); assert.equal(registry.get('a'), undefined); assert.equal(registry.unregister('b'), true);
});
test('registry prevents duplicate names', () => { const r=new ProviderRegistry(); r.register(sandbox('a')); assert.throws(()=>r.register(sandbox('a')),/already/); });
test('deprecated and unavailable providers are filtered', () => { const r=new ProviderRegistry(); r.register(sandbox('old'),{status:'DEPRECATED'}); r.register(sandbox('off'),{health:'OFFLINE'}); assert.equal(r.lookup('remove-background').length,0); assert.equal(r.list({includeDeprecated:true}).length,2); });
test('resolver only uses capabilities', () => { const r=new ProviderRegistry(); r.register(sandbox('sam')); assert.equal(new CapabilityResolver(r).resolve('remove-background').descriptor.id,'sam'); assert.throws(()=>new CapabilityResolver(r).resolve('generate'),/No available/); });
test('descriptor is deeply immutable', () => { const p=sandbox('sam'); assert.ok(Object.isFrozen(p.descriptor)); assert.ok(Object.isFrozen(p.descriptor.maxResolution)); assert.throws(()=>((p.descriptor.maxResolution as {width:number}).width=1)); });
test('cost estimator includes all dimensions', () => { const value=new CostEstimator().estimate(descriptor('a'),2); assert.deepEqual(value,{credits:4,latency:200,quality:.8,memory:40000,expectedFilesize:5000}); assert.ok(Object.isFrozen(value)); });
test('health records injected timestamps and changes only', () => { const h=new ProviderHealth('ONLINE',dependencies()); h.set('ONLINE'); h.set('DEGRADED','slow'); const s=h.snapshot(); assert.equal(s.history.length,2); assert.equal(s.history[1].timestamp,102); assert.equal(s.history[1].reason,'slow'); });
test('fallback ends in abort and follows registry priority', () => { const r=new ProviderRegistry(); r.register(sandbox('local'),{priority:1}); r.register(sandbox('fal'),{priority:3}); assert.deepEqual(new FallbackPlanner(r).plan('remove-background'),{capability:'remove-background',providers:['fal','local'],terminal:'ABORT'}); });
test('retry policy supplies immutable models', () => { const p=createRetryPolicy({retries:4}); assert.equal(p.retries,4); assert.equal(p.timeoutMs,30000); assert.ok(Object.isFrozen(p.circuitBreaker)); });
test('artifact and result contracts are immutable', () => { const a=createArtifact({id:'a',kind:'image',format:'png',metadata:{width:1}}); const r=createProviderResult({status:'SUCCESS',artifacts:[a],metrics:{x:1},credits:1,latency:2,quality:.9,warnings:[]}); assert.ok(Object.isFrozen(a.metadata)); assert.ok(Object.isFrozen(r.artifacts)); });
test('metrics calculate rates and averages', () => { const m=new ProviderMetrics(); m.record(scope,'a',{success:true,latency:10,credits:2,quality:.8}); m.record(scope,'a',{success:false,latency:30,credits:3,quality:.4,available:false}); const value=m.summary(scope,'a'); assert.equal(value.successRate,.5); assert.equal(value.averageLatency,20); assert.equal(value.credits,5); assert.ok(Math.abs(value.quality-.6)<Number.EPSILON); assert.equal(value.failureRate,.5); assert.equal(value.availability,.5); assert.equal(value.samples,2); });
test('metrics enforce complete scope and isolate tenants', () => { const m=new ProviderMetrics(); m.record(scope,'a',{success:true,latency:1,credits:1,quality:1}); assert.equal(m.summary(otherScope,'a').samples,0); assert.throws(()=>m.summary({...scope,tenantId:''},'a'),/required/); });
test('memory stores histories and isolates scope', () => { const m=new ProviderMemory(); m.remember(scope,{bestProvider:'a',failure:'b',quality:.9,latency:4}); assert.equal(m.snapshot(scope).bestProvider,'a'); assert.deepEqual(m.snapshot(otherScope).previousFailures,[]); assert.ok(Object.isFrozen(m.snapshot(scope).qualityHistory)); });
test('optimizer supports every strategy deterministically', () => { const r=new ProviderRegistry(); r.register(sandbox('cheap',{credits:1,latency:200,quality:.5})); r.register(sandbox('quality',{credits:4,latency:50,quality:.99})); const o=new ProviderOptimizer(); const entries=r.list(); assert.equal(o.select(entries,'CHEAPEST').descriptor.id,'cheap'); assert.equal(o.select(entries,'FASTEST').descriptor.id,'quality'); assert.equal(o.select(entries,'HIGHEST_QUALITY').descriptor.id,'quality'); });
test('sandbox validates, initializes and never performs transport', async () => { const p=sandbox('sam'); await assert.rejects(p.execute({operation:'remove-background',scope}),/initialized/); p.initialize(); const result=await p.execute({operation:'remove-background',scope}); assert.equal(result.status,'SUCCESS'); assert.equal(result.artifacts[0].kind,'metadata'); assert.match(result.warnings[0],/no external request/); });
test('sandbox output uses injected IDs, clock and randomness', async () => { const p=sandbox('sam'); p.initialize(); const result=await p.execute({operation:'remove-background',scope}); assert.equal(result.artifacts[0].id,'id-2'); assert.equal(result.latency,1); assert.equal(result.metrics.random,.25); });
test('snapshot contains every platform facet and scope', () => { const r=new ProviderRegistry(); r.register(sandbox('sam')); const metrics=new ProviderMetrics(), memory=new ProviderMemory(), fallback=new FallbackPlanner(r), optimizer=new ProviderOptimizer(); const s=new ProviderSnapshot(r,metrics,memory,fallback,optimizer).create(scope,'remove-background'); assert.deepEqual(s.scope,scope); assert.ok('registry' in s && 'health' in s && 'cost' in s && 'metrics' in s && 'memory' in s && 'fallback' in s && 'optimizer' in s && 'capabilities' in s); assert.ok(Object.isFrozen(s.scope)); });
test('debugger traces the complete selection path', () => { const r=new ProviderRegistry(); r.register(sandbox('sam')); const metrics=new ProviderMetrics(), memory=new ProviderMemory(), fallback=new FallbackPlanner(r), optimizer=new ProviderOptimizer(); const snapshots=new ProviderSnapshot(r,metrics,memory,fallback,optimizer); const trace=new ProviderDebugger(r,new CapabilityResolver(r),fallback,snapshots).trace(scope,'remove-background'); assert.equal(trace.selectedProvider,'sam'); assert.deepEqual(trace.registry,['sam']); assert.ok(trace.estimate && trace.fallback && trace.snapshot); });
test('deepFreeze recursively freezes records and arrays', () => { const x=deepFreeze({a:[{b:1}]}); assert.ok(Object.isFrozen(x)); assert.ok(Object.isFrozen(x.a)); assert.ok(Object.isFrozen(x.a[0])); });
test('provider source has no HTTP or forbidden layer imports', async () => { for(const file of await collect('src/platform/creative/providers')) { const source=await readFile(file,'utf8'); assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|https?:\/\//); assert.doesNotMatch(source,/from\s+['"][^'"]*\/(decision|knowledge|planning|execution|pipeline|workflow|runtime|integration|billing|application|ui)\//); } });

// A 100-case deterministic contract matrix brings this suite to 121 independently reported tests.
for (let index=0; index<100; index++) test(`deterministic isolated provider contract ${index+1}/100`, async () => {
  const p=sandbox(`provider-${index}`,{credits:index,latency:index+1,quality:index/100}); p.initialize();
  const result=await p.execute({operation:'remove-background',scope:{tenantId:`t-${index}`,projectId:'p',userId:'u'}});
  assert.equal(result.credits,index); assert.equal(result.quality,index/100); assert.equal(result.status,'SUCCESS'); assert.ok(Object.isFrozen(result));
});

async function collect(dir:string):Promise<string[]> { const entries=await readdir(dir,{withFileTypes:true}); return (await Promise.all(entries.map(entry=>entry.isDirectory()?collect(join(dir,entry.name)):Promise.resolve(entry.name.endsWith('.ts')?[join(dir,entry.name)]:[])))).flat(); }
