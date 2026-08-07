import { CreativeOntology } from './CreativeOntology';
import { CreativeRulesEngine, defaultCreativeRules } from './CreativeRulesEngine';
import { KnowledgeGraph } from './KnowledgeGraph';
import { ColorKnowledgeBase, CompositionKnowledgeBase, LightingKnowledgeBase, MaterialKnowledgeBase, VisualLanguageDatabase } from './databases';
import { KnowledgeConsistencyEngine, KnowledgeDebugger, KnowledgeEvolution, KnowledgeImportanceEngine, KnowledgeReasoner, KnowledgeSearch, KnowledgeValidator } from './engines';
import { deepFreeze } from './immutable';
import type { KnowledgeDebugSnapshot, KnowledgeDependencies, KnowledgeScope } from './types';

export interface CreativeKnowledgeSystemOptions { dependencies:KnowledgeDependencies; seedDefaults?:boolean }
export class CreativeKnowledgeSystem {
 private readonly graphEngine:KnowledgeGraph;private readonly ontologyEngine=new CreativeOntology();private readonly rulesEngine:CreativeRulesEngine;private readonly searchEngine:KnowledgeSearch;private readonly reasonerEngine:KnowledgeReasoner;private readonly validatorEngine=new KnowledgeValidator();private readonly importanceEngine=new KnowledgeImportanceEngine();private readonly evolutionEngine:KnowledgeEvolution;private readonly debuggerEngine=new KnowledgeDebugger();private readonly consistencyEngine=new KnowledgeConsistencyEngine();
 readonly visualLanguage=new VisualLanguageDatabase();readonly composition=new CompositionKnowledgeBase();readonly lighting=new LightingKnowledgeBase();readonly color=new ColorKnowledgeBase();readonly material=new MaterialKnowledgeBase();
 constructor(options:CreativeKnowledgeSystemOptions|KnowledgeDependencies){const dependencies='dependencies'in options?options.dependencies:options;if(!dependencies?.id||!dependencies?.now)throw new Error('CreativeKnowledgeSystem requires injected id and now dependencies');this.graphEngine=new KnowledgeGraph(dependencies);this.rulesEngine=new CreativeRulesEngine(defaultCreativeRules());this.searchEngine=new KnowledgeSearch(this.graphEngine);this.reasonerEngine=new KnowledgeReasoner(this.graphEngine);this.evolutionEngine=new KnowledgeEvolution(dependencies);this.seedOntology();}
 private seedOntology(){[['Visual',[]],['Lighting',['Visual']],['Soft Lighting',['Lighting']],['Luxury Lighting',['Soft Lighting']],['Style',[]],['Fashion',['Style']],['Editorial',['Fashion']],['Luxury Editorial',['Editorial']]].forEach(([c,p])=>this.ontologyEngine.add(c as string,p as string[]));}
 graph(){return this.graphEngine;} ontology(){return this.ontologyEngine;} rules(){return this.rulesEngine;} validator(){return this.validatorEngine;} importance(){return this.importanceEngine;} evolution(){return this.evolutionEngine;} debug(){return this.debuggerEngine;}
 consistency(){return this.consistencyEngine;}
 search(query:{concept?:string;scope?:KnowledgeScope;limit?:number}){return this.searchEngine.search(query);}
 reason(concept:string,scope?:KnowledgeScope,maxDepth?:number){return this.reasonerEngine.reason(concept,scope,maxDepth);}
 createDebugSnapshot(input:Omit<KnowledgeDebugSnapshot,'finalKnowledgeGraph'> & {scope?:KnowledgeScope}){return this.debuggerEngine.snapshot({...input,finalKnowledgeGraph:this.graphEngine.snapshot(input.scope)});}
 snapshot(scope?:KnowledgeScope){return deepFreeze({graph:this.graphEngine.snapshot(scope),ontology:this.ontologyEngine.snapshot(),rules:this.rulesEngine.rules(),visualLanguage:this.visualLanguage.all(),composition:this.composition.all(),lighting:this.lighting.all(),color:this.color.all(),material:this.material.all(),validation:this.validatorEngine.validate(this.graphEngine,this.ontologyEngine,this.rulesEngine.rules(),scope),consistency:this.consistencyEngine.check(this.graphEngine,this.ontologyEngine,this.rulesEngine.rules(),scope)});}
}
