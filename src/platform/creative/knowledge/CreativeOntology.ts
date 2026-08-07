import { deepFreeze } from './immutable';

export class CreativeOntology {
  private readonly parentMap = new Map<string, Set<string>>();
  add(concept: string, parents: readonly string[] = []): this { if(!this.parentMap.has(concept)) this.parentMap.set(concept,new Set()); for(const p of parents){ if(p===concept) throw new Error('Ontology cycle'); if(!this.parentMap.has(p)) this.parentMap.set(p,new Set()); this.parentMap.get(concept)!.add(p); if(this.ancestors(p).includes(concept)){this.parentMap.get(concept)!.delete(p);throw new Error('Ontology cycle');}} return this; }
  parents(concept:string):readonly string[]{return deepFreeze([...(this.parentMap.get(concept)??[])].sort());}
  children(concept:string):readonly string[]{return deepFreeze([...this.parentMap].filter(([,p])=>p.has(concept)).map(([c])=>c).sort());}
  ancestors(concept:string):readonly string[]{const out:string[]=[], seen=new Set<string>(); const visit=(c:string)=>{for(const p of this.parents(c))if(!seen.has(p)){seen.add(p);out.push(p);visit(p);}};visit(concept);return deepFreeze(out);}
  descendants(concept:string):readonly string[]{const out:string[]=[], seen=new Set<string>();const visit=(c:string)=>{for(const x of this.children(c))if(!seen.has(x)){seen.add(x);out.push(x);visit(x);}};visit(concept);return deepFreeze(out);}
  lowestCommonAncestor(a:string,b:string):string|undefined { const aa=[a,...this.ancestors(a)], bb=new Set([b,...this.ancestors(b)]); return aa.find(x=>bb.has(x)); }
  distance(a:string,b:string):number { if(a===b)return 0; const queue:[[string,number]]|[string,number][]=[[a,0]],seen=new Set([a]);while(queue.length){const [x,d]=queue.shift()!;for(const n of [...this.parents(x),...this.children(x)])if(!seen.has(n)){if(n===b)return d+1;seen.add(n);queue.push([n,d+1]);}}return Infinity; }
  concepts():readonly string[]{return deepFreeze([...this.parentMap.keys()].sort());}
  hasCycle():boolean { return this.concepts().some(c=>this.ancestors(c).includes(c)); }
  snapshot(){return deepFreeze(this.concepts().map(concept=>({concept,parents:this.parents(concept)})));}
}
