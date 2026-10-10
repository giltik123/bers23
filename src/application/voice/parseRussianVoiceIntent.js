import { normalizeRussianFashionVoice } from './normalizeRussianFashionVoice.js';

/** VI-2 Russian deterministic recognizer: strictly bounded, never executes. */
const normalize=s=>s.toLocaleLowerCase('ru-RU').replace(/ё/g,'е')
  .replace(/[.!?]+$/u,'').replace(/\s+/g,' ').trim();
const targets=[
  ['prompt',/^(?:открой|покажи|перейди в|вернись в)\s+(?:поле\s+)?промпт$/u],
  ['creative',/^(?:открой|покажи|перейди в)\s+(?:creative studio|креативную студию|творческую студию)$/u],
  ['agent',/^(?:открой|покажи|перейди в)\s+(?:агент[а]?|ии агента|ai agent)$/u],
  ['fashion',/^(?:открой|покажи|перейди в)\s+(?:гардероб|fashion|одежду)$/u],
  ['outfits',/^(?:открой|покажи|перейди в)\s+(?:образы|наряды|примерку|try.on)$/u],
];
const format=s=>s.replace(/\s+/g,' ').trim();
const numberWord=Object.freeze({
  'ноль':0,'один':1,'одна':1,'два':2,'три':3,'четыре':4,'пять':5,
  'девяносто':90,'сто восемьдесят':180,'двести семьдесят':270,
});
export function parseRussianVoiceNumber(value){
  if(typeof value!=='string')return null;
  const cleaned=normalize(value);
  if(/^\d{1,5}$/.test(cleaned))return Number(cleaned);
  return Object.hasOwn(numberWord,cleaned)?numberWord[cleaned]:null;
}
function action(kind,params={},targetSurface='EDITOR',confirmation='CONFIRM_BEFORE_ACTION'){
  return Object.freeze({kind,params:Object.freeze(params),
    targetSurface,confirmation});
}
function parseResize(text){
  const match=text.match(/^(?:сделай|измени размер(?: изображения)? на|поставь размер|установи размер|размер)\s+(\d{1,5})\s*(?:на|x|х|×)\s*(\d{1,5})(?:\s*(?:пиксел[ьяеий]*|px))?$/u);
  if(!match)return null;
  const width=Number(match[1]),height=Number(match[2]);
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||
     width<1||height<1||width>16384||height>16384||width*height>24_000_000)
    return action('AMBIGUOUS',{reason:'Неподдерживаемые размеры'},'EDITOR');
  return action('RESIZE',{width,height});
}
export function parseRussianVoiceIntent(transcript){
  if(typeof transcript!=='string'||transcript.trim().length<1||transcript.length>1024)
    throw new Error('VOICE_INVALID_TRANSCRIPT');
  const text=normalize(transcript);
  for(const [tab,regex]of targets){
    if(regex.test(text))return action('NAVIGATE',{tab},'EDITOR','NO_CONFIRMATION');
  }
  if(/^(?:отмени|шаг назад|отмени последнее действие)$/u.test(text))
    return action('HISTORY_UNDO',{},'EDITOR');
  if(/^(?:повтори|верни отмененное|шаг вперед)$/u.test(text))
    return action('HISTORY_REDO',{},'EDITOR');
  if(/^(?:верни оригинал|восстанови оригинал|верни исходное изображение)$/u.test(text))
    return action('HISTORY_RESTORE',{},'EDITOR');
  const compound=text.match(/^поверни(?: фото| фотографию| изображение)?\s+(вправо|влево)\s+и\s+затем\s+сделай\s+(\d{1,5})\s*(?:на|x|х|×)\s*(\d{1,5})$/u);
  if(compound){
    const width=Number(compound[2]),height=Number(compound[3]);
    if(width<1||height<1||width>16384||height>16384||
      width*height>24_000_000)
      return action('AMBIGUOUS',{reason:'Размеры Agent выходят за пределы BERS'});
    return action('AGENT_PROPOSAL',{
      mode:compound[1]==='вправо'?'ROTATE_90_CW':'ROTATE_270_CW',
      width,height,
    },'AGENT');
  }
  if(text==='сделай это через агента'||text==='открой план агента')
    return action('AGENT_PROPOSAL',{},'AGENT');
  const resize=parseResize(text);
  if(resize)return resize;
  if(/^(?:отрази|отзеркаль)(?: фото| изображение)?(?: по горизонтали| горизонтально)$/u.test(text))
    return action('TRANSFORM',{mode:'FLIP_HORIZONTAL'});
  if(/^(?:отрази|отзеркаль)(?: фото| изображение)?(?: по вертикали| вертикально)$/u.test(text))
    return action('TRANSFORM',{mode:'FLIP_VERTICAL'});
  const rotate=text.match(/^поверни(?: фото| фотографию| изображение)?(?: на)?\s+(девяносто|сто восемьдесят|двести семьдесят|90|180|270)(?:\s+градусов?|\s+градуса)?(?:\s+(вправо|влево|по часовой стрелке|против часовой стрелки))?$/u);
  if(rotate){
    const degrees=parseRussianVoiceNumber(rotate[1]);
    const direction=rotate[2];
    if(degrees===90&&!direction)
      return action('AMBIGUOUS',{reason:'Укажите направление: вправо или влево'});
    const counter=direction==='влево'||direction==='против часовой стрелки';
    const mode=degrees===180?'ROTATE_180':
      (degrees===270 ? (counter?'ROTATE_90_CW':'ROTATE_270_CW'):
        (counter?'ROTATE_270_CW':'ROTATE_90_CW'));
    return action('TRANSFORM',{mode});
  }
  if(/^(?:поверни|отрази|обрежь|измени размер|сделай\s+\d)/u.test(text))
    return action('AMBIGUOUS',{reason:'Нужно уточнить параметры операции'});
  if(/^(?:покажи|найди)\s+.+$/u.test(text)){
    const query=format(text.replace(/^(?:покажи|найди)\s+/u,''));
    if(/^(?:избранное|любимые вещи)$/u.test(query))
      return action('WARDROBE_QUERY',{query,hints:null},'WARDROBE','NO_CONFIRMATION');
    const hints=normalizeRussianFashionVoice(query);
    if(hints.categories.length||hints.colors.length||hints.styles.length)
      return action('WARDROBE_QUERY',{query,hints},'WARDROBE','NO_CONFIRMATION');
  }
  if(/^примерь\s+.+$/u.test(text)){
    const query=format(text.replace(/^примерь\s+/u,''));
    return action('TRYON_SELECT_PROPOSAL',
      {query,hints:normalizeRussianFashionVoice(query)},'TRY_ON');
  }
  if(/^(?:запусти примерку|продолжи примерку|восстанови примерку|обнови гардероб|добавь вещь|запусти агента)$/u.test(text))
    return action('REQUIRES_CANONICAL_CONTEXT',{spoken:transcript},'AGENT');
  if(/^(?:прими|подтверди результат|примен[ий]|оплати|удали проект|сохрани|запусти|создай|отмени все)/u.test(text))
    return action('ACTION_NEEDS_UI',{reason:'Нельзя выполнять эту команду голосом'});
  return null;
}
