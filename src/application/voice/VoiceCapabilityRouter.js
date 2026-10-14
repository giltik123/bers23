/**
 * VI-0 Voice Capability Router — ASR identity is independent from the image
 * generation provider/Billing. Every route must prove on-device processing
 * under LOCAL_ONLY. A downloadable but uninstalled pack is not admissible.
 */
const TIERS=Object.freeze([
  'BERS_LOCAL_RUSSIAN','OS_ON_DEVICE','BERS_LOCAL_MULTILINGUAL',
  'REMOTE_EXPLICIT','BLOCKED',
]);
export const VOICE_ASR_TIERS=TIERS;
const packReady=(pack,locale)=>{
  return Boolean(pack && pack.admission==='VERIFIED' &&
    pack.installed===true && pack.onDevice===true &&
    typeof pack.createSession==='function' &&
    Array.isArray(pack.locales) && pack.locales.includes(locale) &&
    typeof pack.modelId==='string' && pack.modelId.length>0 &&
    typeof pack.modelVersion==='string' && pack.modelVersion.length>0);
};
export function chooseVoiceRecognitionRoute({
  locale='ru-RU',privacy='LOCAL_ONLY',
  localRussianPack=null,osOnDeviceAvailable=false,
  localMultilingualPack=null,remoteConfigured=false,
  remoteConsent=false,
}={}){
  if(locale!=='ru-RU'||!['LOCAL_ONLY','REMOTE_EXPLICIT'].includes(privacy))
    return Object.freeze({tier:'BLOCKED',reason:'VOICE_POLICY_UNSUPPORTED'});
  if(packReady(localRussianPack,locale))
    return Object.freeze({tier:'BERS_LOCAL_RUSSIAN',pack:localRussianPack,locale});
  if(osOnDeviceAvailable===true)
    return Object.freeze({tier:'OS_ON_DEVICE',locale});
  if(packReady(localMultilingualPack,locale))
    return Object.freeze({tier:'BERS_LOCAL_MULTILINGUAL',pack:localMultilingualPack,locale});
  if(privacy==='REMOTE_EXPLICIT' && remoteConfigured===true && remoteConsent===true)
    return Object.freeze({tier:'REMOTE_EXPLICIT',locale,
      reason:'Explicit remote policy only; not selected by LOCAL_ONLY'});
  return Object.freeze({tier:'BLOCKED',reason:'NO_ADMITTED_LOCAL_RUSSIAN_ENGINE'});
}
