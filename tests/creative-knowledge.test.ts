import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { ActiveKnowledgePolicy, ColorKnowledgeBase, CompositionKnowledgeBase, CreativeKnowledgeSystem, CreativeOntology, CreativeRulesEngine, HeuristicKnowledgeEncoder, HeuristicKnowledgeSimilarity, InMemoryKnowledgeMemory, KnowledgeConsistencyEngine, KnowledgeDebugger, KnowledgeEvolution, KnowledgeGraph, KnowledgeImportanceEngine, KnowledgeReasoner, KnowledgeSearch, KnowledgeValidator, LightingKnowledgeBase, MaterialKnowledgeBase, VisualLanguageDatabase, deepFreeze, defaultCreativeRules } from '../src/platform/creative/knowledge';

const scope={tenantId:'t',projectId:'p',userId:'u'};
const other={tenantId:'other',projectId:'p',userId:'u'};
const deps=()=>{let id=0,time=100;return{id:()=>`id-${++id}`,now:()=>++time,random:()=>.5};};
const node=(concept:string,extra={})=>({scope,concept,category:'style',tags:['visual'],confidence:.9,importance:.8,support:4,evidenceCount:3,...extra});
const graph=()=>{const g=new KnowledgeGraph(deps());const a=g.addNode(node('Luxury')),b=g.addNode(node('Gold')),c=g.addNode(node('Warm Lighting'));g.addEdge({source:a.id,target:b.id,relation:'leads-to',weight:.9,confidence:.9,support:4});g.addEdge({source:b.id,target:c.id,relation:'recommends',weight:.8,confidence:.8,support:3});return{g,a,b,c};};

test('graph adds immutable nodes',()=>{const {a}=graph();assert.ok(Object.isFrozen(a));assert.ok(Object.isFrozen(a.scope));});
test('graph adds immutable edges',()=>{const {g}=graph();assert.ok(Object.isFrozen(g.edges()[0]));});
test('graph injects ids',()=>assert.equal(graph().a.id,'id-1'));
test('graph injects timestamps',()=>assert.equal(graph().a.createdAt,101));
test('graph lists neighbors',()=>assert.deepEqual(graph().g.neighbors('id-1').map(x=>x.concept),['Gold']));
test('graph creates subgraph',()=>assert.equal(graph().g.subgraph(['id-1','id-2']).edges.length,1));
test('graph computes shortest path',()=>assert.deepEqual(graph().g.shortestPath('id-1','id-3').map(x=>x.concept),['Luxury','Gold','Warm Lighting']));
test('graph finds related concepts',()=>assert.equal(graph().g.relatedConcepts('id-1')[0].concept,'Gold'));
test('graph computes importance',()=>assert.ok(graph().g.importance('id-1')>0));
test('graph computes central concepts',()=>assert.equal(graph().g.centralConcepts(1).length,1));
test('graph computes components',()=>assert.equal(graph().g.connectedComponents().length,1));
test('graph rejects broken references',()=>assert.throws(()=>graph().g.addEdge({source:'bad',target:'id-1',relation:'x',weight:1,confidence:1,support:1})))
test('graph enforces scope isolation',()=>{const {g,a}=graph();const x=g.addNode(node('X',{scope:other}));assert.throws(()=>g.addEdge({source:a.id,target:x.id,relation:'x',weight:1,confidence:1,support:1}));});
test('graph filters scopes',()=>{const {g}=graph();g.addNode(node('X',{scope:other}));assert.equal(g.nodes(scope).length,3);});

test('ontology gets parents',()=>{const o=new CreativeOntology().add('Visual').add('Lighting',['Visual']);assert.deepEqual(o.parents('Lighting'),['Visual']);});
test('ontology gets children',()=>{const o=new CreativeOntology().add('Visual').add('Lighting',['Visual']);assert.deepEqual(o.children('Visual'),['Lighting']);});
test('ontology gets ancestors',()=>{const o=new CreativeOntology().add('A').add('B',['A']).add('C',['B']);assert.deepEqual(o.ancestors('C'),['B','A']);});
test('ontology gets descendants',()=>{const o=new CreativeOntology().add('A').add('B',['A']).add('C',['B']);assert.deepEqual(o.descendants('A'),['B','C']);});
test('ontology lowest common ancestor',()=>{const o=new CreativeOntology().add('A').add('B',['A']).add('C',['A']);assert.equal(o.lowestCommonAncestor('B','C'),'A');});
test('ontology distance',()=>{const o=new CreativeOntology().add('A').add('B',['A']).add('C',['B']);assert.equal(o.distance('A','C'),2);});
test('ontology rejects cycle',()=>{const o=new CreativeOntology().add('A').add('B',['A']);assert.throws(()=>o.add('A',['B']));});

test('visual language has luxury vocabulary',()=>assert.ok(new VisualLanguageDatabase().get('Luxury').includes('gold')));
test('visual language resolves relationships',()=>assert.ok(new VisualLanguageDatabase().related('gold').includes('luxury')));
test('composition contains twelve rules',()=>assert.equal(new CompositionKnowledgeBase().all().length,12));
test('composition includes negative space luxury goal',()=>assert.ok(new CompositionKnowledgeBase().get('negative-space')?.recommendedGoals.includes('luxury')));
test('lighting contains ten types',()=>assert.equal(new LightingKnowledgeBase().all().length,10));
test('dramatic lighting records AI necessity',()=>assert.equal(new LightingKnowledgeBase().get('dramatic')?.aiNecessary,true));
test('color contains harmony systems',()=>assert.equal(new ColorKnowledgeBase().get('triadic')?.kind,'harmony'));
test('blue psychology produces trust',()=>assert.ok(new ColorKnowledgeBase().psychology('blue').includes('trust')));
test('gold psychology produces luxury',()=>assert.ok(new ColorKnowledgeBase().psychology('gold').includes('luxury')));
test('materials contain ten entries',()=>assert.equal(new MaterialKnowledgeBase().all().length,10));
test('glass reflection knowledge is present',()=>assert.match(new MaterialKnowledgeBase().get('glass')!.reflectionBehavior,/reflective/));
test('fabric requires texture preservation',()=>assert.equal(new MaterialKnowledgeBase().get('fabric')?.texturePreservation,1));

test('rules activate luxury recommendations',()=>assert.ok(new CreativeRulesEngine(defaultCreativeRules()).activate({goal:'luxury'})[0].recommendations.includes('soft lighting')));
test('rules honor active status',()=>{const r={...defaultCreativeRules()[0],id:'off',active:false};assert.equal(new CreativeRulesEngine([r]).activate({goal:'luxury'}).length,0);});
test('rules detect conflicts',()=>assert.equal(new CreativeRulesEngine(defaultCreativeRules()).conflicts().length,1));
test('rules reject duplicate ids',()=>{const e=new CreativeRulesEngine();e.add(defaultCreativeRules()[0]);assert.throws(()=>e.add(defaultCreativeRules()[0]));});
test('reasoner builds deterministic chain',()=>assert.equal(new KnowledgeReasoner(graph().g).reason('Luxury').chain.length,2));
test('reasoner reports recommendations',()=>assert.ok(new KnowledgeReasoner(graph().g).reason('Luxury').recommended.includes('Gold')));
test('reasoner returns empty unknown result',()=>assert.equal(new KnowledgeReasoner(graph().g).reason('Unknown').confidence,0));
test('search finds nearest concepts',()=>assert.equal(new KnowledgeSearch(graph().g).nearestConcepts('Luxury')[0].node.concept,'Gold'));
test('search returns reasoning path',()=>assert.deepEqual(new KnowledgeSearch(graph().g).reasoningPath('Luxury','Warm Lighting'),['Luxury','Gold','Warm Lighting']));
test('search ranks best evidence',()=>assert.equal(new KnowledgeSearch(graph().g).bestEvidence( undefined,1).length,1));
test('importance is bounded',()=>assert.ok(new KnowledgeImportanceEngine().calculate({support:9,usage:9,novelty:9,frequency:9,impact:9,confidence:9}).importance<=1));
test('validator detects duplicates',()=>{const {g}=graph();g.addNode(node(' Luxury '));assert.ok(new KnowledgeValidator().validate(g).some(x=>x.type==='duplicate-concept'));});
test('validator detects unreachable nodes',()=>{const {g}=graph();g.addNode(node('Island'));assert.ok(new KnowledgeValidator().validate(g).some(x=>x.type==='unreachable-node'));});
test('consistency detects contradictions and rule dominance',()=>{const {g,a,c}=graph();g.addEdge({source:a.id,target:c.id,relation:'contradicts',weight:1,confidence:1,support:1});const rules=defaultCreativeRules();const result=new KnowledgeConsistencyEngine().check(g,new CreativeOntology(),rules);assert.deepEqual(result.contradictions,[[a.id,c.id]]);assert.deepEqual(result.ruleDominance,[['luxury-direction','budget-direction']]);assert.ok(Object.isFrozen(result));});
test('debugger creates a deeply immutable full trace',()=>{const {g}=graph();const trace=new KnowledgeDebugger().snapshot({prompt:'luxury product',intent:'luxury',knowledgeSearch:'nearest concepts',retrievedConcepts:['Luxury','Gold'],appliedRules:['luxury-direction'],reasoningChain:new KnowledgeReasoner(g).reason('Luxury').chain,recommendedConcepts:['Gold'],knowledgeConfidence:.9,knowledgeCoverage:.8,finalKnowledgeGraph:g.snapshot(scope)});assert.equal(trace.finalKnowledgeGraph.nodes.length,3);assert.throws(()=>{(trace.recommendedConcepts as string[]).push('Mutable')});assert.ok(Object.isFrozen(trace.finalKnowledgeGraph));});
test('evolution branches knowledge',()=>{const {a}=graph();assert.equal(new KnowledgeEvolution(deps()).branch(a,{concept:'Premium'}).parent,a.id);});
test('evolution merges support',()=>{const {a,b}=graph();assert.equal(new KnowledgeEvolution(deps()).merge([a,b]).support,8);});
test('evolution compares versions',()=>{const {a}=graph();const e=new KnowledgeEvolution(deps()),b=e.branch(a,{concept:'Premium'});assert.ok(e.compare(a,b).some(x=>x.field==='concept'));});

test('heuristic encoder is deterministic',()=>{const e=new HeuristicKnowledgeEncoder();assert.deepEqual(e.encode('Luxury'),e.encode('Luxury'));});
test('similarity is bounded',()=>assert.ok(new HeuristicKnowledgeSimilarity().similarity([1,0],[1,0])<=1));
test('active policy rejects deprecated nodes',()=>assert.equal(new ActiveKnowledgePolicy().allow({...graph().a,deprecated:true}),false));
test('memory snapshots are immutable',()=>{const m=new InMemoryKnowledgeMemory();m.remember(graph().a);assert.throws(()=>{(m.recall() as unknown[]).push(1)});});
test('deep freeze recursively freezes',()=>{const x=deepFreeze({a:{b:[1]}});assert.ok(Object.isFrozen(x.a.b));});
test('facade requires DI',()=>assert.throws(()=>new CreativeKnowledgeSystem({} as never)));
test('facade exposes autonomous snapshot',()=>{const s=new CreativeKnowledgeSystem(deps()).snapshot();assert.ok(Object.isFrozen(s));assert.equal(s.lighting.length,10);});
test('facade keeps tenant snapshots isolated',()=>{const s=new CreativeKnowledgeSystem(deps());s.graph().addNode(node('A'));s.graph().addNode(node('B',{scope:other}));assert.equal(s.snapshot(scope).graph.nodes.length,1);});
test('forbidden imports are absent',()=>{for(const file of readdirSync('src/platform/creative/knowledge'))if(file.endsWith('.ts')){const imports=readFileSync(`src/platform/creative/knowledge/${file}`,'utf8').split('\n').filter(x=>/^import|^export .* from/.test(x)).join('\n');for(const term of ['runtime','kernel','workflow','provider','billing','application','ui','decision','director','studio','meta','react','base44'])assert.equal(imports.toLowerCase().includes(term),false,`${file}: ${term}`);}});
