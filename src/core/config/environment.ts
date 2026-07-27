/** Runtime modes supported by the core platform. */
export type EnvironmentMode = 'development' | 'production' | 'test';

const viteMode = import.meta.env.MODE;

/** Environment information derived without relying on Base44. */
export const environment = Object.freeze({
  mode: (viteMode === 'production' || viteMode === 'test' ? viteMode : 'development') as EnvironmentMode,
  isDevelopment: viteMode !== 'production' && viteMode !== 'test',
  isProduction: viteMode === 'production',
  isTest: viteMode === 'test',
});

