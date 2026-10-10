/**
 * Push-to-talk OS speech port. Privacy rule: ONLY start after the browser
 * explicitly confirms that a Russian on-device language pack is installed.
 * Web Speech's default can send audio remotely; NEVER use that default.
 * We deliberately do not select webkitSpeechRecognition or remote fallback.
 */
export const LOCAL_VOICE_MAX_MS=30_000;
export class LocalVoiceUnavailable extends Error {
  constructor(code,message){
    super(message);this.name='LocalVoiceUnavailable';this.code=code;
  }
}
export async function createLocalVoiceSession({
  SpeechRecognitionCtor=globalThis.SpeechRecognition,
  onPartial=()=>{},onFinal=()=>{},onEnd=()=>{},onError=()=>{},
  schedule=(f,ms)=>setTimeout(f,ms),unschedule=clearTimeout,
  maxDurationMs=LOCAL_VOICE_MAX_MS,locale='ru-RU',
}={}){
  if(locale!=='ru-RU'||!Number.isSafeInteger(maxDurationMs)||
     maxDurationMs<1000||maxDurationMs>LOCAL_VOICE_MAX_MS)
    throw new LocalVoiceUnavailable('VOICE_INVALID_POLICY','Неверная политика локального голосового ввода');
  if(typeof SpeechRecognitionCtor!=='function' ||
     typeof SpeechRecognitionCtor.available!=='function')
    throw new LocalVoiceUnavailable('LOCAL_ASR_UNSUPPORTED',
      'Браузер не подтверждает локальное распознавание речи. Запись не начата.');
  // The static method with processLocally=true must prove offline readiness.
  // 'downloadable' or 'downloading' does not count as locally ready.
  let available;
  try {
    available=await SpeechRecognitionCtor.available({
      langs:[locale],processLocally:true,
    });
  }catch{
    throw new LocalVoiceUnavailable('LOCAL_ASR_CHECK_FAILED',
      'Не удалось проверить локальную языковую модель. Запись не начата.');
  }
  if(available!=='available'){
    throw new LocalVoiceUnavailable(
      available==='downloadable'||available==='downloading'
        ?'LOCAL_ASR_PACK_MISSING':'LOCAL_ASR_UNAVAILABLE',
      'Для русского языка нет установленного локального распознавания. Аудио никуда не отправлено.',
    );
  }
  const recognizer=new SpeechRecognitionCtor();
  if(!('processLocally' in recognizer))
    throw new LocalVoiceUnavailable('LOCAL_ASR_UNVERIFIED',
      'Нельзя гарантировать обработку речи на устройстве.');
  recognizer.lang=locale;
  recognizer.processLocally=true;
  if(recognizer.processLocally!==true)
    throw new LocalVoiceUnavailable('LOCAL_ASR_UNVERIFIED',
      'Нельзя гарантировать обработку речи на устройстве.');
  recognizer.continuous=false;
  recognizer.interimResults=true;
  recognizer.maxAlternatives=1;
  let active=true,timeoutId=null;
  const close=()=>{
    if(!active)return false;
    active=false;
    if(timeoutId!==null)unschedule(timeoutId);
    return true;
  };
  recognizer.onresult=event=>{
    if(!active)return;
    let final='',interim='';
    for(let i=0;i<event.results.length;i++){
      const result=event.results[i];
      const segment=result?.[0]?.transcript;
      if(typeof segment!=='string')continue;
      if(result.isFinal)final+=segment+' ';
      else interim+=segment+' ';
    }
    if(interim.trim())onPartial(interim.trim().slice(0,1024));
    if(final.trim())onFinal(final.trim().slice(0,1024));
  };
  recognizer.onerror=event=>{
    if(close())onError(event?.error||'LOCAL_ASR_FAILED');
  };
  recognizer.onend=()=>{if(close())onEnd();};
  const abort=()=>{
    if(!close())return;
    recognizer.onresult=null;recognizer.onerror=null;recognizer.onend=null;
    recognizer.abort();
  };
  const stop=()=>{
    if(!active)return;
    recognizer.stop();
  };
  try{
    recognizer.start();
    timeoutId=schedule(()=>{
      if(!active)return;
      recognizer.stop();
    },maxDurationMs);
  }catch{
    abort();
    throw new LocalVoiceUnavailable('LOCAL_ASR_START_FAILED',
      'Не удалось включить микрофон или локальное распознавание речи.');
  }
  return Object.freeze({stop,abort,engine:'OS_ON_DEVICE',locale});
}
