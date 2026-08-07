import { deepFreeze } from './immutable';
import type { CreativeRule, RuleActivation } from './types';

const read=(context:Record<string,unknown>,path:string):unknown=>path.split('.').reduce<unknown>((v,k)=>v&&typeof v==='object'?(v as Record<string,unknown>)[k]:undefined,context);
export class CreativeRulesEngine {
 private readonly store=new Map<string,CreativeRule>();
 constructor(rules:readonly CreativeRule[]=[]){rules.forEach(r=>this.add(r));}
 add(rule:CreativeRule):CreativeRule{if(this.store.has(rule.id))throw new Error(`Duplicate rule: ${rule.id}`);const frozen=deepFreeze({...rule,conditions:rule.conditions.map(x=>({...x})),recommendations:[...rule.recommendations],conflicts:[...rule.conflicts]}) as CreativeRule;this.store.set(rule.id,frozen);return frozen;}
 rules():readonly CreativeRule[]{return deepFreeze([...this.store.values()].sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id)));}
 activate(context:Record<string,unknown>):readonly RuleActivation[]{const active=this.rules().filter(r=>r.active&&r.conditions.every(c=>{const v=read(context,c.field);if(c.operator==='exists')return v!==undefined;if(c.operator==='includes')return Array.isArray(v)?v.includes(c.value):String(v??'').includes(String(c.value));return v===c.value;}));const selected:CreativeRule[]=[];for(const rule of active)if(!selected.some(x=>x.conflicts.includes(rule.id)&&x.priority>=rule.priority))selected.push(rule);return deepFreeze(selected.map(r=>({ruleId:r.id,recommendations:r.recommendations,priority:r.priority,confidence:r.confidence,because:r.conditions.map(c=>`${c.field} ${c.operator??'equals'} ${String(c.value)}`).join(' and ')})));}
 conflicts():readonly (readonly [string,string])[]{const pairs:[string,string][]=[];for(const r of this.rules())for(const c of r.conflicts)if(this.store.has(c)&&r.id<c)pairs.push([r.id,c]);return deepFreeze(pairs);}
}
export const defaultCreativeRules=():readonly CreativeRule[]=>deepFreeze([{id:'luxury-direction',conditions:[{field:'goal',value:'luxury'}],recommendations:['soft lighting','warm palette','minimal composition'],priority:100,confidence:.94,support:20,active:true,conflicts:['budget-direction']},{id:'catalog-direction',conditions:[{field:'goal',value:'catalog'}],recommendations:['studio lighting','neutral palette','accurate colors'],priority:90,confidence:.96,support:30,active:true,conflicts:[]},{id:'budget-direction',conditions:[{field:'goal',value:'budget'}],recommendations:['natural lighting','simple composition'],priority:50,confidence:.8,support:8,active:true,conflicts:['luxury-direction']}]);
