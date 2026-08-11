export const clamp = (value: number) => Math.max(0, Math.min(1, value));
export const immutable = <T>(value: T): Readonly<T> => deepFreeze(structuredClone(value));
const deepFreeze = <T>(value: T): T => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; };
export const average = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
export const hash = (value: string) => { let result = 2166136261; for (const character of value) { result ^= character.charCodeAt(0); result = Math.imul(result, 16777619); } return result >>> 0; };
