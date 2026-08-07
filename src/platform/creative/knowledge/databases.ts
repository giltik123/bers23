import { deepFreeze, normalize } from './immutable';
import type { ColorEntry, CompositionRule, LightingEntry, MaterialEntry } from './types';

class Library<T extends { id:string; name:string }> {
  protected readonly data: readonly T[];
  constructor(entries: readonly T[]){this.data=deepFreeze(entries.map(x=>({...x}))) as readonly T[];}
  all():readonly T[]{return this.data;}
  get(idOrName:string):T|undefined{return this.data.find(x=>normalize(x.id)===normalize(idOrName)||normalize(x.name)===normalize(idOrName));}
  search(values:readonly string[]):readonly T[]{const terms=values.map(normalize);return deepFreeze(this.data.filter(x=>terms.some(t=>normalize(JSON.stringify(x)).includes(t))));}
}

const compositions:CompositionRule[]=[
 ['rule-of-thirds','Rule of thirds',.9,.95,['focus','storytelling'],['strict symmetry'],['crop','reframe']],['golden-ratio','Golden ratio',.9,.9,['organic balance','premium'],[],['crop','layout']],['balance','Balance',.95,.95,['stability'],['tension'],['layout']],['visual-hierarchy','Visual hierarchy',1,.96,['clarity','conversion'],[],['contrast','scale']],['leading-lines','Leading lines',.85,.9,['direction','depth'],[],['perspective','crop']],['negative-space','Negative space',.9,.94,['luxury','minimal'],['density'],['crop','background']],['depth','Depth',.85,.9,['immersion'],['flat catalog'],['blur','perspective']],['perspective','Perspective',.8,.9,['depth','scale'],['technical flat'],['transform']],['symmetry','Symmetry',.8,.95,['stability','catalog'],['tension'],['align']],['asymmetry','Asymmetry',.75,.88,['energy','editorial'],['formal stability'],['reframe']],['framing','Framing',.85,.92,['focus'],[],['crop']],['rhythm','Rhythm',.75,.86,['movement','pattern'],[],['layout']]
].map(([id,name,importance,confidence,recommendedGoals,conflictingGoals,relatedOperations])=>({id,name,importance,confidence,recommendedGoals,conflictingGoals,relatedOperations} as CompositionRule));
export class CompositionKnowledgeBase extends Library<CompositionRule>{constructor(){super(compositions);}}

const lights:LightingEntry[]=[
 ['soft','Soft',['soft shadows','low contrast'],['calm','premium'],['luxury','portrait','product'],1,false],['hard','Hard',['sharp shadows','high contrast'],['dramatic','bold'],['fashion','editorial'],1,false],['studio','Studio',['controlled','accurate'],['professional'],['catalog','product'],2,false],['golden-hour','Golden Hour',['warm','long shadows'],['nostalgic','romantic'],['lifestyle','portrait'],1,false],['back','Back',['silhouette','depth'],['mysterious'],['portrait','fashion'],1,false],['rim','Rim',['edge separation'],['premium','dramatic'],['fashion','product'],1,false],['fill','Fill',['reduced shadows'],['open','friendly'],['catalog','portrait'],1,false],['ambient','Ambient',['natural falloff'],['authentic'],['interior','lifestyle'],0,false],['natural','Natural',['realistic','variable'],['honest','fresh'],['lifestyle','skin'],0,false],['dramatic','Dramatic',['deep shadows','contrast'],['intense','cinematic'],['fashion','editorial'],2,true]
].map(([id,name,visualEffects,emotionalEffects,recommendedDomains,cost,aiNecessary])=>({id,name,visualEffects,emotionalEffects,recommendedDomains,cost,aiNecessary} as LightingEntry));
export class LightingKnowledgeBase extends Library<LightingEntry>{constructor(){super(lights);}}

const colors:ColorEntry[]=[
 ['harmony','Harmony','harmony',['cohesion'],['analogous']],['temperature','Temperature','harmony',['mood'],['warm','cool']],['contrast','Contrast','harmony',['clarity','energy'],['complementary']],['complementary','Complementary','harmony',['vibrance'],['contrast']],['triadic','Triadic','harmony',['balanced variety'],['harmony']],['analogous','Analogous','harmony',['calm cohesion'],['harmony']],['monochrome','Monochrome','harmony',['focus','minimal'],['harmony']],['split-complementary','Split Complementary','harmony',['controlled contrast'],['contrast']],
 ['blue','Blue','psychology',['trust','calm'],['corporate','clean']],['gold','Gold','psychology',['luxury','premium'],['warm']],['red','Red','psychology',['energy','urgency'],['warm']],['green','Green','psychology',['nature','growth'],['natural']],['black','Black','psychology',['sophistication','power'],['luxury']]
].map(([id,name,kind,effects,related])=>({id,name,kind,effects,related} as ColorEntry));
export class ColorKnowledgeBase extends Library<ColorEntry>{constructor(){super(colors);} psychology(color:string):readonly string[]{return deepFreeze(this.get(color)?.kind==='psychology'?[...this.get(color)!.effects]:[]);}}

const materials:MaterialEntry[]=[
 ['leather','Leather',['soft','rim'],.8,'soft specular',.95],['glass','Glass',['back','rim'],1,'transparent and highly reflective',.8],['wood','Wood',['soft','natural'],.5,'diffuse with grain',.95],['metal','Metal',['large soft source','rim'],.95,'mirror to brushed specular',.85],['plastic','Plastic',['soft','diffused'],.7,'hard specular',.75],['fabric','Fabric',['raking','soft'],.7,'mostly diffuse',1],['skin','Skin',['soft','fill'],1,'subsurface and soft specular',1],['hair','Hair',['rim','back'],.9,'anisotropic highlights',.95],['jewelry','Jewelry',['hard accents','rim'],1,'highly reflective',.95],['stone','Stone',['raking','natural'],.55,'diffuse crystalline',1]
].map(([id,name,lightingPreferences,editingSensitivity,reflectionBehavior,texturePreservation])=>({id,name,lightingPreferences,editingSensitivity,reflectionBehavior,texturePreservation} as MaterialEntry));
export class MaterialKnowledgeBase extends Library<MaterialEntry>{constructor(){super(materials);}}

export class VisualLanguageDatabase {
  private readonly languages=deepFreeze({luxury:['gold','warm','minimal','premium','soft shadows'],fashion:['editorial','contrast','dramatic'],catalog:['neutral','clean','accurate colors']}) as Readonly<Record<string,readonly string[]>>;
  get(language:string):readonly string[]{return deepFreeze([...(this.languages[normalize(language)]??[])]);}
  related(term:string):readonly string[]{const n=normalize(term);const result=new Set<string>();for(const [root,values] of Object.entries(this.languages))if(root===n||values.some(v=>normalize(v)===n)){result.add(root);values.forEach(v=>result.add(v));}result.delete(term);return deepFreeze([...result].sort());}
  all(){return this.languages;}
}
