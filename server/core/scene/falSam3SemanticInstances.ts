import sharp from 'sharp';

/**
 * Server-only, explicitly enabled SAM3 semantic-instance adapter.
 * No browser credentials, arbitrary provider URL, inferred mask, or unsigned
 * source image. The caller must supply trusted canonical image PNG bytes.
 *
 * fal SAM3 API: https://fal.ai/models/fal-ai/sam-3/image/api
 * Each prompt is a real inference; these are candidates requiring user review.
 */
export const SAM3_SCENE_PROMPTS = Object.freeze([
  { category:'FACE', group:'FACE',label:'Лицо',prompt:'face' },
  { category:'CLOTHING_UPPER',group:'CLOTHING',label:'Верх одежды',prompt:'shirt' },
  { category:'OUTERWEAR',group:'CLOTHING',label:'Верхняя одежда',prompt:'jacket' },
  { category:'CLOTHING_LOWER',group:'CLOTHING',label:'Брюки или юбка',prompt:'pants' },
  { category:'DRESS',group:'CLOTHING',label:'Платье',prompt:'dress' },
  { category:'FOOTWEAR',group:'CLOTHING',label:'Обувь',prompt:'shoes' },
  { category:'ACCESSORY',group:'ACCESSORY',label:'Очки',prompt:'eyeglasses' },
  { category:'ACCESSORY',group:'ACCESSORY',label:'Сумка',prompt:'handbag' },
  { category:'ACCESSORY',group:'ACCESSORY',label:'Головной убор',prompt:'hat' },
  { category:'BACKGROUND',group:'BACKGROUND',label:'Фон',prompt:'background' },
  { category:'OTHER_OBJECT',group:'OTHER_OBJECT',label:'Предмет мебели',prompt:'chair' },
  { category:'OTHER_OBJECT',group:'OTHER_OBJECT',label:'Стол',prompt:'table' },
]);
const MODEL_ID='fal-ai/sam-3/image',MODEL_VERSION='sam3-semantic-v1';
const fail=(message:string)=>Object.assign(new Error(message),{status:502,code:'scene_provider_rejected'});
function decodeDataPng(url:unknown) {
  if(typeof url!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(url)||
     url.length>15_000_000)throw fail('SAM3 did not return a bounded inlined PNG MASK');
  const bytes=Buffer.from(url.slice('data:image/png;base64,'.length),'base64');
  if(bytes.length<20||bytes.length>10_000_000)throw fail('SAM3 MASK PNG size is unsafe');
  return bytes;
}
/** Binary mask, NEVER the composited preview. Input must be black/white/grayscale. */
export async function decodeSam3Mask(data:Uint8Array,width:number,height:number) {
  const image=sharp(Buffer.from(data),{failOn:'error',limitInputPixels:24_000_000});
  const info=await image.metadata();
  if(info.format!=='png'||!info.width||!info.height||info.width>8192||info.height>8192)
    throw fail('SAM3 MASK must be a valid bounded PNG');
  // SAM3 masks are monochrome. Reject colored previews rather than passing
  // their red channel as a fake binary selection.
  const raw=await image.toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const channels=raw.info.channels;
  if(channels!==4)throw fail('SAM3 MASK pixel layout is not RGBA');
  const result=new Uint8Array(raw.info.width*raw.info.height);
  let meaningful=0;
  for(let i=0;i<result.length;i++){
    const k=i*4, r=raw.data[k],g=raw.data[k+1],b=raw.data[k+2],a=raw.data[k+3];
    if(Math.max(r,g,b)-Math.min(r,g,b)>1)
      throw fail('SAM3 returned a colored image, not an alpha MASK');
    const alpha=a===255?r:Math.round((r*a)/255);
    result[i]=alpha;
    if(alpha>0)meaningful++;
  }
  if(meaningful===0||meaningful===result.length)return null;
  if(raw.info.width===width&&raw.info.height===height)return result;
  // Nearest-neighbour only; do not invent feathered edges by RGB scaling.
  const scaled=await sharp(result,{raw:{width:raw.info.width,height:raw.info.height,channels:1}})
    .resize(width,height,{kernel:'nearest',fit:'fill'}).raw().toBuffer();
  return new Uint8Array(scaled);
}

export async function runFalSam3Scene(input:Readonly<{
  imagePng:Uint8Array; width:number;height:number;falKey:string;
  fetcher?:typeof fetch;signal?:AbortSignal;
}>){
  if(!input.falKey||!input.imagePng?.byteLength||input.imagePng.byteLength>8_000_000)
    throw fail('SAM3 requires a bounded canonical source and a server-only API key');
  if(!Number.isSafeInteger(input.width)||!Number.isSafeInteger(input.height)||
     input.width<1||input.height<1||input.width*input.height>8_000_000)
    throw fail('SAM3 source geometry is unsupported');
  const fetcher=input.fetcher??fetch;
  const imageUrl='data:image/png;base64,'+Buffer.from(input.imagePng).toString('base64');
  const instances:{
    category:string;group:string;label:string;confidence:number;
    alpha:Uint8Array;modelId:string;modelVersion:string;
  }[]=[];
  for(const entry of SAM3_SCENE_PROMPTS){
    if(input.signal?.aborted)throw fail('Scene request cancelled');
    const response=await fetcher('https://fal.run/fal-ai/sam-3/image',{
      method:'POST',signal:input.signal,
      headers:{Authorization:`Key ${input.falKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({image_url:imageUrl,prompt:entry.prompt,
        apply_mask:false,return_multiple_masks:true,max_masks:3,
        include_scores:true,sync_mode:true,output_format:'png'}),
    });
    if(!response.ok)throw fail(`SAM3 unavailable for category ${entry.category}: HTTP ${response.status}`);
    const result=await response.json() as any;
    if(!Array.isArray(result?.masks)||result.masks.length>3)
      throw fail('SAM3 semantic-mask response is missing or unbounded');
    for(let j=0;j<result.masks.length;j++){
      const score=result.metadata?.[j]?.score??result.scores?.[j];
      if(typeof score!=='number'||!Number.isFinite(score)||score<0||score>1)
        continue;
      const binary=await decodeSam3Mask(decodeDataPng(result.masks[j]?.url),input.width,input.height);
      if(!binary)continue;
      instances.push({...entry,confidence:score,alpha:binary,
        modelId:MODEL_ID,modelVersion:MODEL_VERSION});
    }
  }
  return Object.freeze({modelId:MODEL_ID,modelVersion:MODEL_VERSION,instances});
}
