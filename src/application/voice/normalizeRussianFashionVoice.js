/**
 * Read-only Russian Fashion vocabulary hints. Never creates a garment ID or
 * confirms a match: only canonical Wardrobe queries may resolve entities.
 */
const CATEGORY_TERMS=Object.freeze([
  ['jackets', /(?:куртк|курточк|бомбер|косух|пуховик|ветровк)/u],
  ['jeans', /(?:джинс|деним)/u],
  ['dresses', /(?:плать|платья|сарафан)/u],
  ['sweaters', /(?:водолазк|свитер|кардиган|джемпер)/u],
  ['shoes', /(?:кроссовк|ботинк|туфл|лофер|сапог)/u],
  ['skirts', /(?:юбк|плиссе)/u],
  ['pants', /(?:брюк|брюч|штан)/u],
  ['shirts', /(?:рубашк|футболк|топ)/u],
]);
const COLOR_TERMS=Object.freeze([
  ['black',/(?:ч[её]рн)/u],
  ['white',/(?:бел|белоснеж)/u],
  ['blue',/(?:син|голуб|небесн)/u],
  ['navy',/(?:т[её]мно[- ]?син)/u],
  ['beige',/(?:бежев|песочн)/u],
  ['red',/(?:красн|ал[ыо]|бордов)/u],
  ['green',/(?:зел[её]н|изумрудн)/u],
  ['grey',/(?:сер|графитов)/u],
]);
const STYLE_TERMS=Object.freeze([
  ['oversize',/(?:оверсайз|oversize|свободн(?:ого|ый|ая|ую)? покроя)/u],
  ['pleated',/(?:плиссе|складк)/u],
  ['denim',/(?:деним|джинсов)/u],
]);
const hasTerm=(text,pattern)=>pattern.test(text);
export function normalizeRussianFashionVoice(text){
  if(typeof text!=='string'||text.length>1024||!text.trim())
    throw new Error('VOICE_FASHION_QUERY_INVALID');
  const normalized=text.trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
  const categories=CATEGORY_TERMS.filter(([,re])=>hasTerm(normalized,re)).map(([name])=>name);
  const colors=COLOR_TERMS.filter(([,re])=>hasTerm(normalized,re)).map(([name])=>name);
  // A compound "тёмно-синюю" should not also yield a second generic blue
  // candidate. There is still no invented garment identity.
  const dedupColors=colors.includes('navy')?colors.filter(x=>x!=='blue'):colors;
  const styles=STYLE_TERMS.filter(([,re])=>hasTerm(normalized,re)).map(([name])=>name);
  return Object.freeze({
    originalQuery:text.trim(),categories:Object.freeze(categories),
    colors:Object.freeze(dedupColors),styles:Object.freeze(styles),
    garmentId:null,matchStatus:'UNRESOLVED',
    needsCanonicalWardrobeLookup:true,
  });
}
export function resolveFashionVoiceCandidates(normalized,candidates){
  if(!normalized||normalized.garmentId!==null||!Array.isArray(candidates))
    throw new Error('VOICE_GARMENT_CANDIDATES_INVALID');
  // These are query suggestions only; the caller supplies canonical IDs.
  const valid=candidates.filter(c=>typeof c?.id==='string'&&c.id.length>0&&
    c.id.length<=256&&c.status==='READY');
  if(valid.length===0)return Object.freeze({status:'NOT_FOUND',candidate:null,candidates:[]});
  if(valid.length!==1)return Object.freeze({status:'AMBIGUOUS',candidate:null,candidates:Object.freeze(valid)});
  return Object.freeze({status:'READY_TO_CONFIRM',candidate:valid[0],candidates:Object.freeze(valid)});
}
