const isNode = typeof window === 'undefined';
const storage = isNode ? undefined : window.localStorage;
const viteEnv = import.meta.env ?? {};

const toSnakeCase = (str) => str.replace(/([A-Z])/g, '_$1').toLowerCase();

const scrubLegacyBrowserAuth = () => {
  if (isNode) return;
  // Never migrate a JS-readable bearer into the new session model. A browser
  // must establish a fresh canonical HttpOnly session through Core auth.
  storage?.removeItem('core_access_token');
  storage?.removeItem('core_token');
  storage?.removeItem('token');

  const urlParams = new URLSearchParams(window.location.search);
  let changed = false;
  for (const name of ['access_token', 'clear_access_token']) {
    if (urlParams.has(name)) { urlParams.delete(name); changed = true; }
  }
  if (changed) {
    const next = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ''}${window.location.hash}`;
    window.history.replaceState({}, document.title, next);
  }
};

scrubLegacyBrowserAuth();

const getAppParamValue = (paramName, { defaultValue = undefined, removeFromUrl = false } = {}) => {
  if (isNode) return defaultValue;
  const storageKey = `core_${toSnakeCase(paramName)}`;
  const urlParams = new URLSearchParams(window.location.search);
  const searchParam = urlParams.get(paramName);
  if (removeFromUrl) {
    urlParams.delete(paramName);
    const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ''}${window.location.hash}`;
    window.history.replaceState({}, document.title, newUrl);
  }
  if (searchParam) {
    storage?.setItem(storageKey, searchParam);
    return searchParam;
  }
  if (defaultValue) {
    storage?.setItem(storageKey, defaultValue);
    return defaultValue;
  }
  return storage?.getItem(storageKey) || null;
};

const getAppParams = () => ({
  appId: getAppParamValue('app_id', { defaultValue: viteEnv.VITE_CORE_APP_ID }),
  fromUrl: getAppParamValue('from_url', { defaultValue: isNode ? undefined : window.location.href }),
  functionsVersion: getAppParamValue('functions_version', { defaultValue: viteEnv.VITE_CORE_API_VERSION }),
  appBaseUrl: getAppParamValue('app_base_url', { defaultValue: viteEnv.VITE_CORE_API_URL }),
});

export const appParams = { ...getAppParams() };
