/**
 * BERS AI-first Command Workbench — bounded local intent *drafting*.
 *
 * This is NOT a vision-language model. It extracts only explicit, narrow
 * edit intents to prefill user-adjustable controls; uncertainty is displayed
 * instead of guessing the target or claiming an AI has seen the photograph.
 * Generative prompts go ONLY to the existing authenticated Core creative
 * execution path after an explicit user confirmation; no client-side model
 * authority, API key, money or FINAL is minted here.
 */
const FASHION=/(пример(ь|ка|ить|ку)|переоден|надень|одень|одежд.{0,24}(на мне|на человек|пример)|try[- ]?on|wear (this|the) (shirt|dress|coat)|dress me|change (my |the )?outfit)/iu;
const GENERATE=/(замен(и|ить|а|яй)|дорисуй|сгенерир|добавь (объект|предмет|человек|дерев)|убер(и|ать) (объект|предмет|человек|прыщ)|удал(и|ить) (объект|человек|прыщ)|ретуш|сделай (улыбк|прическ)|change the (background|hair|clothes)|remove (the |a )?(person|object|blemish)|generat|inpaint|replace|healing|repaint)/iu;
const REMOVE_BG=/(удал(и|ить) фон|уб(е|и)ри фон|вырежи (объект|человека)|remove (the )?background|cut.?out the background)/iu;
const EXPOSURE=/(осветл|светле|ярче|затемн|темне|темнее|подним(и|ать) (тени|экспозицию)|сниз(ь|ить) экспозицию|brighten|lighten|darken|exposure|shadows brighter)/iu;
const TEMPERATURE=/(тепле|тепл(ый|ее|ей)|холодне|холодн(ый|ее|ей)|желтизн|син(ев|ее)|баланс белого|temperature|white balance|warmer|cooler|warm up)/iu;
const TINT=/(зелен(ый|ее|оват)|пурпур|маджент|magenta|tint|green cast)/iu;
const CONTRAST=/(контраст|contrast|черн(ую|ый|ые) точк|black point)/iu;
const TARGET=/(кож[ауие]|лиц[оае]|волос|рубаш|майк|футболк|плать|куртк|одежд|рук[иа]|человек|предмет|объект|неб[оа]|фон[аеу]?|skin|face|hair|shirt|dress|jacket|cloth|garment|background|sky|person|hands)/iu;
const PRESERVE=/(не (меняй|трогай|изменяй)|остав(ь|ить) (без изменений|как есть)|сохрани (без изменений|лицо|фон|цвет|текстуру)|don't (change|touch|alter)|preserve (the )?(face|hair|skin|background|identity))/iu;
const GENTLE=/(чуть|немного|слегка|деликатно|аккуратно|естественн|subtle|slight|gently|natural(ly)?)/iu;
const STRONG=/(сильн|значительн|резк|намного|much brighter|much darker|strong|dramatic)/iu;
const NEGATIVE=/(затемн|темне|темнее|сниз(ь|ить) экспозицию|darken|cooler|холодн|син(ев|ее)|убери желтизн|reduce warmth)/iu;
const TEXT_LIMIT=850;

function asDraft(kind, instruction, overrides={}) {
  return Object.freeze({
    kind, instruction, status:'DRAFT_ONLY',
    operation:null, parameters:null, target:'UNRESOLVED',
    needsCoreMask:false, needsExplicitReview:true,
    warnings:Object.freeze([]),
    explanation:'', ...overrides,
  });
}
function amount(text,light,normal,strong) {
  if (GENTLE.test(text)) return light;
  if (STRONG.test(text)) return strong;
  return normal;
}
function commandWarnings(text) {
  const warnings=[];
  if(PRESERVE.test(text)) warnings.push(
    'Требование «не менять» нельзя гарантировать по одному тексту: проверьте точную маску, границы и итоговый кадр.'
  );
  if(TARGET.test(text)) warnings.push(
    'Область определяется только подтверждённой вами Core-маской, а не словами или догадкой редактора.'
  );
  return Object.freeze(warnings);
}
export function interpretPhotoCommand(raw) {
  const instruction=typeof raw==='string'?raw.trim():'';
  if(!instruction || instruction.length>TEXT_LIMIT || /[\x00-\x08\x0E-\x1F]/u.test(instruction)){
    return asDraft('CLARIFY',instruction,{ explanation:'Опишите одним предложением, что именно изменить на фотографии (до 850 символов).' });
  }
  const warnings=commandWarnings(instruction);
  if(FASHION.test(instruction)){
    return asDraft('FASHION',instruction,{
      target:'GARMENT',warnings,
      explanation:'Нужна настоящая примерка с управлением контуром одежды, позой и перекрытиями. Выберите Outfit/garment в Fashion, проверьте посадку и затем решайте, принимать ли результат.',
    });
  }
  if(REMOVE_BG.test(instruction)){
    return asDraft('ADJUSTMENT',instruction,{
      operation:'BACKGROUND_ISOLATION',parameters:Object.freeze({}),
      target:'MASKED_REGION',needsCoreMask:true,warnings,
      explanation:'Удаление фона требует Core MASK области, которую нужно сохранить. Никакого фонового AI-дорисовывания.',
    });
  }
  if(GENERATE.test(instruction)){
    return asDraft('GENERATIVE',instruction,{
      target:TARGET.test(instruction)?'USER_SELECTED_OBJECT':'IMAGE_OR_OBJECT',
      warnings,
      explanation:'Нужна генеративная обработка. План — отправить исходную фразу в существующий Core Creative Edit только после явного подтверждения. Если Core не допустил провайдера, генерация недоступна.',
    });
  }
  const candidates=[
    ['MASKED_EXPOSURE',EXPOSURE.test(instruction)],
    ['MASKED_WHITE_BALANCE',TEMPERATURE.test(instruction)||TINT.test(instruction)],
    ['MASKED_LEVELS',CONTRAST.test(instruction)],
  ].filter(([,matched])=>matched);
  if(candidates.length!==1){
    return asDraft('CLARIFY',instruction,{
      target:TARGET.test(instruction)?'USER_SELECTED_OBJECT':'UNRESOLVED',warnings,
      explanation:candidates.length>1
        ? 'В запросе несколько разных корректировок. Выполняйте их последовательно с просмотром результата после каждой — так легче сохранить исходное фото.'
        : 'Не могу точно сопоставить запрос с безопасным инструментом. Уточните: осветлить, затемнить, теплее/холоднее, изменить контраст или сгенерировать объект.',
    });
  }
  const operation=candidates[0][0];
  const negative=NEGATIVE.test(instruction);
  let parameters;
  let explanation;
  if(operation==='MASKED_EXPOSURE'){
    const magnitude=amount(instruction,2,5,10);
    parameters=Object.freeze({eighthStops:negative?-magnitude:magnitude});
    explanation='Подобрана начальная экспозиция. Меняйте ползунок и подтверждайте маску: эффект не должен создавать пятна или выбеливать кожу.';
  }else if(operation==='MASKED_WHITE_BALANCE'){
    const magnitude=amount(instruction,12,25,42);
    const tint=TINT.test(instruction) && !TEMPERATURE.test(instruction);
    parameters=Object.freeze({
      temperatureQ8:tint?0:(negative?-magnitude:magnitude),
      tintQ8:tint?( /(зелен|green)/iu.test(instruction)?Math.min(32,magnitude):-Math.min(32,magnitude)):0,
    });
    explanation='Подобран мягкий баланс белого. Оцените цвет кожи и белых тканей после предпросмотра.';
  }else{
    parameters=Object.freeze({
      inputBlack:0,inputMidpoint:128,inputWhite:255,
      outputBlack:amount(instruction,1,3,6),outputWhite:255,
    });
    explanation='Начальная настройка Levels. Она не определяет художественный контраст автоматически; проверьте свет и тени.';
  }
  return asDraft('ADJUSTMENT',instruction,{
    operation,parameters,target:'MASKED_REGION',needsCoreMask:true,warnings,explanation,
  });
}

/**
 * The model/backend can later propose the same bounded schema. Always
 * constrain to the exact current source + Core mask at execution time.
 * Never pass unchecked free-form model JSON to a local/Core executor.
 */
export function sanitizePhotoAdjustmentDraft(draft) {
  if(!draft || draft.kind!=='ADJUSTMENT')throw new Error('Only deterministic, explicit adjustment drafts are executable');
  const operation=draft.operation;
  const params=draft.parameters||{};
  if(operation==='BACKGROUND_ISOLATION'){
    return Object.freeze({operation,parameters:Object.freeze({})});
  }
  if(operation==='MASKED_EXPOSURE'){
    const value=params.eighthStops;
    if(!Number.isSafeInteger(value)||value < -32||value > 32||value===0)
      throw new Error('Exposure is out of bound or a no-op');
    return Object.freeze({operation,parameters:Object.freeze({eighthStops:value})});
  }
  if(operation==='MASKED_WHITE_BALANCE'){
    const {temperatureQ8,tintQ8}=params;
    if(!Number.isSafeInteger(temperatureQ8)||temperatureQ8 < -128||temperatureQ8 >128||
       !Number.isSafeInteger(tintQ8)||tintQ8 < -64||tintQ8 >64||
       (temperatureQ8===0&&tintQ8===0))throw new Error('White balance adjustment is invalid');
    return Object.freeze({operation,parameters:Object.freeze({temperatureQ8,tintQ8})});
  }
  if(operation==='MASKED_LEVELS'){
    const keys=['inputBlack','inputMidpoint','inputWhite','outputBlack','outputWhite'];
    if(!keys.every(key=>Number.isSafeInteger(params[key])))
      throw new Error('Levels needs five integer parameters');
    const {inputBlack,inputMidpoint,inputWhite,outputBlack,outputWhite}=params;
    if(inputBlack<0||inputBlack>254||inputWhite<1||inputWhite>255||
       inputBlack>=inputWhite||inputMidpoint<=inputBlack||inputMidpoint>=inputWhite||
       outputBlack<0||outputBlack>=outputWhite||outputWhite>255)
      throw new Error('Invalid Levels geometry');
    return Object.freeze({operation,parameters:Object.freeze(Object.fromEntries(
      keys.map(key=>[key,params[key]]),
    ))});
  }
  throw new Error('Adjustment is not in the Core admitted tool allowlist');
}
