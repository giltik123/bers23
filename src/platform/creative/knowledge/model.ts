import { clamp, deepFreeze, normalize } from './immutable';
import type { KnowledgeNode, ReasoningResult, SearchResult } from './types';

export interface KnowledgeEncoder { encode(value:string):readonly number[] }
export interface KnowledgeRetriever { retrieve(query:readonly number[],candidates:readonly KnowledgeNode[],limit?:number):readonly KnowledgeNode[] }
export interface KnowledgeReasonerContract { infer(start:string):ReasoningResult }
export interface KnowledgeRanker { rank(results:readonly SearchResult[]):readonly SearchResult[] }
export interface KnowledgePolicy { allow(candidate:KnowledgeNode):boolean }
export interface KnowledgeMemory { remember(node:KnowledgeNode):void; recall():readonly KnowledgeNode[] }
export interface KnowledgeEmbedding { embed(tokens:readonly string[]):readonly number[] }
export interface KnowledgeSimilarity { similarity(a:readonly number[],b:readonly number[]):number }
export interface KnowledgeTokenizer { tokenize(value:string):readonly string[] }
export interface KnowledgeDecoder { decode(vector:readonly number[]):string }

export class HeuristicKnowledgeTokenizer implements KnowledgeTokenizer { tokenize(value:string){return deepFreeze(normalize(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean));} }
export class HeuristicKnowledgeEmbedding implements KnowledgeEmbedding { embed(tokens:readonly string[]){const vector=Array(16).fill(0);for(const token of tokens)for(let i=0;i<token.length;i++)vector[(token.codePointAt(i)!+i)%vector.length]++;const length=Math.sqrt(vector.reduce((s,x)=>s+x*x,0))||1;return deepFreeze(vector.map(x=>x/length));} }
export class HeuristicKnowledgeEncoder implements KnowledgeEncoder { constructor(private readonly tokenizer:KnowledgeTokenizer=new HeuristicKnowledgeTokenizer(),private readonly embedding:KnowledgeEmbedding=new HeuristicKnowledgeEmbedding()){} encode(value:string){return this.embedding.embed(this.tokenizer.tokenize(value));} }
export class HeuristicKnowledgeSimilarity implements KnowledgeSimilarity { similarity(a:readonly number[],b:readonly number[]){const size=Math.max(a.length,b.length);let dot=0,aa=0,bb=0;for(let i=0;i<size;i++){const x=a[i]??0,y=b[i]??0;dot+=x*y;aa+=x*x;bb+=y*y;}return clamp(dot/(Math.sqrt(aa)*Math.sqrt(bb)||1));} }
export class HeuristicKnowledgeRetriever implements KnowledgeRetriever { constructor(private readonly encoder:KnowledgeEncoder=new HeuristicKnowledgeEncoder(),private readonly similarity:KnowledgeSimilarity=new HeuristicKnowledgeSimilarity()){} retrieve(query:readonly number[],candidates:readonly KnowledgeNode[],limit=10){return deepFreeze(candidates.slice().sort((a,b)=>this.similarity.similarity(query,this.encoder.encode(b.concept))-this.similarity.similarity(query,this.encoder.encode(a.concept))||a.id.localeCompare(b.id)).slice(0,limit));} }
export class HeuristicKnowledgeRanker implements KnowledgeRanker { rank(results:readonly SearchResult[]){return deepFreeze(results.slice().sort((a,b)=>b.score-a.score||b.node.confidence-a.node.confidence||a.node.id.localeCompare(b.node.id)));} }
export class ActiveKnowledgePolicy implements KnowledgePolicy { allow(candidate:KnowledgeNode){return candidate.active!==false&&candidate.deprecated!==true;} }
export class InMemoryKnowledgeMemory implements KnowledgeMemory { private values:KnowledgeNode[]=[];remember(node:KnowledgeNode){this.values=[...this.values,node];}recall(){return deepFreeze([...this.values]);} }
export class HeuristicKnowledgeDecoder implements KnowledgeDecoder { decode(vector:readonly number[]){return vector.map(x=>x.toFixed(6)).join(',');} }
