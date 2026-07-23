// Flattens nested packs to dotted keys and compares packs for QA:
// missing translations, unused keys, duplicates and broken {placeholders}.
const flatten = (object, prefix = '', out = {}) => {
  for (const [key, value] of Object.entries(object || {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, out);
    else out[path] = value;
  }
  return out;
};
const placeholders = (value) => (typeof value === 'string' ? [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort() : []);

export const localizationValidator = {
  flatten,
  // Compare a target pack against the reference (usually English).
  validate(referencePack, targetPack, usedKeys = null) {
    const reference = flatten(referencePack);
    const target = flatten(targetPack);
    const referenceKeys = Object.keys(reference);
    const targetKeys = Object.keys(target);
    const missing = referenceKeys.filter((key) => !(key in target));
    const extra = targetKeys.filter((key) => !(key in reference));
    const brokenPlaceholders = referenceKeys.filter((key) => key in target && placeholders(reference[key]).join() !== placeholders(target[key]).join());
    const unused = usedKeys ? referenceKeys.filter((key) => !usedKeys.has(key)) : [];
    return { missing, extra, brokenPlaceholders, unused, ok: !missing.length && !brokenPlaceholders.length };
  },
};