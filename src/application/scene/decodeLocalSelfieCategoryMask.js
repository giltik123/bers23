/**
 * MediaPipe SelfieMulticlass local 256x256 segmentation category adapter.
 *
 * This is a PURE local-pixel decoder; it does not load a model or claim that
 * a browser-produced segmentation is canonical. A separately admitted local
 * runtime must supply a real per-pixel CATEGORY_MASK from MediaPipe. Its
 * candidates require the normal Core original-source MASK admission path.
 *
 * Official semantic classes, in fixed order:
 *  0 background, 1 hair, 2 body-skin, 3 face-skin, 4 clothes, 5 others.
 * The sixth model class includes accessories but is NOT a reliable precise
 * identity/instance classifier. Never name it glasses/bag/watch by guessing.
 */
export const MEDIAPIPE_SELFIE_CLASSES=Object.freeze([
  Object.freeze({id:0,category:'BACKGROUND',group:'BACKGROUND',label:'Фон'}),
  Object.freeze({id:1,category:'OTHER_OBJECT',group:'OTHER_OBJECT',label:'Волосы'}),
  Object.freeze({id:2,category:'OTHER_OBJECT',group:'OTHER_OBJECT',label:'Кожа тела'}),
  Object.freeze({id:3,category:'FACE',group:'FACE',label:'Кожа лица'}),
  Object.freeze({id:4,category:'CLOTHING_GENERIC',group:'CLOTHING',label:'Одежда (общая)'}),
  Object.freeze({id:5,category:'ACCESSORY',group:'ACCESSORY',label:'Прочие области / аксессуары'}),
]);
export const MEDIAPIPE_LOCAL_MODEL_ID='mediapipe-selfie-multiclass';
export const MEDIAPIPE_LOCAL_MODEL_VERSION='selfie-multiclass-256x256-v1';
const MAX_CATEGORY_PIXELS=1_000_000;
const MAX_INSTANCES=24;

/** A single tiny model emits semantic region classes; 4-connectivity splits
 * disconnected islands into *candidate* instances, not verified real objects.
 */
export function decodeLocalSelfieCategoryMask({
  categoryMask,width,height,sourceWidth,sourceHeight,minRegionFraction=0.0015,
}) {
  if(!(categoryMask instanceof Uint8Array) ||
     !Number.isSafeInteger(width)||!Number.isSafeInteger(height) ||
     width<8||height<8||width*height>MAX_CATEGORY_PIXELS ||
     categoryMask.byteLength!==width*height ||
     !Number.isSafeInteger(sourceWidth)||!Number.isSafeInteger(sourceHeight) ||
     sourceWidth<8||sourceHeight<8||sourceWidth*sourceHeight>8_000_000 ||
     !Number.isFinite(minRegionFraction)||minRegionFraction<0.0001||
     minRegionFraction>0.1)
    throw new Error('Local MediaPipe category mask geometry is invalid');
  for(let i=0;i<categoryMask.length;i++){
    if(categoryMask[i]>=MEDIAPIPE_SELFIE_CLASSES.length)
      throw new Error('Local MediaPipe mask has an unsupported class ID');
  }
  const visited=new Uint8Array(categoryMask.length);
  const queue=new Int32Array(categoryMask.length);
  const components=[];
  const minArea=Math.max(8,Math.ceil(categoryMask.length*minRegionFraction));
  for(let origin=0;origin<categoryMask.length;origin++){
    if(visited[origin])continue;
    let front=0,end=1;queue[0]=origin;visited[origin]=1;
    const labelId=categoryMask[origin];
    const indices=[];
    while(front<end){
      const index=queue[front++],x=index%width,y=(index-x)/width;
      indices.push(index);
      const neighbors=[
        x>0?index-1:-1,x+1<width?index+1:-1,
        y>0?index-width:-1,y+1<height?index+width:-1,
      ];
      for(const ni of neighbors){
        if(ni>=0&&!visited[ni]&&categoryMask[ni]===labelId){
          visited[ni]=1;queue[end++]=ni;
        }
      }
    }
    if(indices.length>=minArea){
      components.push({labelId,indices,area:indices.length});
    }
  }
  // Sort deterministically by area; output caps prevent large source OOM.
  components.sort((a,b)=>b.area-a.area || a.labelId-b.labelId || a.indices[0]-b.indices[0]);
  const accepted=components.slice(0,MAX_INSTANCES);
  const xMap=new Int32Array(sourceWidth);
  for(let x=0;x<sourceWidth;x++){
    xMap[x]=Math.min(width-1,Math.floor(x*width/sourceWidth));
  }
  const instances=[];
  for(const component of accepted){
    const info=MEDIAPIPE_SELFIE_CLASSES[component.labelId];
    const small=new Uint8Array(categoryMask.length);
    for(const i of component.indices)small[i]=255;
    const alpha=new Uint8Array(sourceWidth*sourceHeight);
    let count=0;
    for(let y=0;y<sourceHeight;y++){
      const yy=Math.min(height-1,Math.floor(y*height/sourceHeight));
      const smallRow=yy*width,largeRow=y*sourceWidth;
      for(let x=0;x<sourceWidth;x++){
        const a=small[smallRow+xMap[x]];
        alpha[largeRow+x]=a;
        if(a)count++;
      }
    }
    if(count===0||count===alpha.length)continue;
    instances.push(Object.freeze({
      category:info.category,group:info.group,label:info.label,
      // The category argmax mask does NOT expose calibrated confidence.
      // Zero means unknown confidence, not a claim of 100% correct.
      confidence:0,alpha,
      modelId:MEDIAPIPE_LOCAL_MODEL_ID,
      modelVersion:MEDIAPIPE_LOCAL_MODEL_VERSION,
      originalCategoryId:info.id,
    }));
  }
  return Object.freeze({
    modelId:MEDIAPIPE_LOCAL_MODEL_ID,
    modelVersion:MEDIAPIPE_LOCAL_MODEL_VERSION,
    instances:Object.freeze(instances),
  });
}
