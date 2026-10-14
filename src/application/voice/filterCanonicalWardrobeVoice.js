/**
 * Local read-only ranking over canonical Wardrobe rows. Never fabricates
 * IDs, changes READY/ACTIVE state or confirms a garment selection.
 */
const categoryAliases=Object.freeze({
  jackets:['jacket','outerwear','куртк','бомбер','косух','пуховик'],
  jeans:['jeans','jean','деним','джинс'],
  dresses:['dress','плать','сарафан'],
  sweaters:['sweater','cardigan','свитер','кардиган','водолазк'],
  shoes:['shoe','sneaker','boot','кроссов','туфл','ботин','лофер'],
  skirts:['skirt','юбк','плиссе'],
  pants:['pants','trousers','брюк','штан'],
  shirts:['shirt','t-shirt','рубаш','футбол','топ'],
});
const colorAliases=Object.freeze({
  black:['black','черн'],white:['white','бел'],
  blue:['blue','син','голуб'],navy:['navy','темно-син','тёмно-син'],
  beige:['beige','беж','песоч'],red:['red','красн','алый','бордов'],
  green:['green','зелен','зелён'],grey:['grey','gray','сер','графит'],
});
const styleAliases=Object.freeze({
  oversize:['oversize','оверсайз','свободн'],
  pleated:['pleated','плиссе','складк'],
  denim:['denim','деним','джинсов'],
});
const matchTerms=(terms,aliases,haystack)=>terms.every(term=>
  (aliases[term]||[term]).some(alias=>haystack.includes(alias))
);
export function filterCanonicalWardrobeVoice(items,voiceQuery){
  if(!Array.isArray(items))throw new Error('VOICE_CANONICAL_WARDROBE_REQUIRED');
  if(!voiceQuery?.query)return items;
  if(typeof voiceQuery.query!=='string'||voiceQuery.query.length>1024)
    throw new Error('VOICE_QUERY_INVALID');
  const query=voiceQuery.query.toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
  if(/^(?:избранное|любимые вещи)$/.test(query))
    return items.filter(item=>item?.favorite===true);
  const hints=voiceQuery.hints;
  return items.filter(item=>{
    if(typeof item?.id!=='string')return false;
    const haystack=[item.name,item.category,item.material,item.color,item.style,
      ...(Array.isArray(item.tags)?item.tags:[])]
      .filter(v=>typeof v==='string').join(' ').toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
    if(!hints)return haystack.includes(query);
    const categories=Array.isArray(hints.categories)?hints.categories:[];
    const colors=Array.isArray(hints.colors)?hints.colors:[];
    const styles=Array.isArray(hints.styles)?hints.styles:[];
    return matchTerms(categories,categoryAliases,haystack) &&
      matchTerms(colors,colorAliases,haystack) &&
      matchTerms(styles,styleAliases,haystack);
  });
}
