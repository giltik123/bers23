// FitValidator — pre-generation checks that the outfit fits the photo:
// a person must be present, and garment gender/season mismatches are flagged.
class FitValidator {
  validate({ outfit, selected, objects = [], memory = null }) {
    const errors = [];
    const warnings = [];

    const humanPresent = !!memory?.profiles?.identity?.human_present
      || objects.some((o) => /person|woman|man|face/i.test(o.label || ''));
    if (!humanPresent) errors.push('No person detected in the photo — try-on needs a person. Run "Detect objects" first.');

    if (selected.length === 0) errors.push('No try-on capable garments in this outfit (tops, bottoms or dresses with photos).');

    for (const { garment } of selected) {
      if (outfit.gender && garment.gender && outfit.gender !== 'unisex' && garment.gender !== 'unisex' && garment.gender !== outfit.gender) {
        warnings.push(`"${garment.name}" is a ${garment.gender} piece in a ${outfit.gender} outfit.`);
      }
      if (garment.season && garment.season !== 'all_season' && outfit.season !== 'all_season' && garment.season !== outfit.season) {
        warnings.push(`"${garment.name}" is off-season for this outfit.`);
      }
    }

    const hasDress = selected.some((s) => s.fashnCategory === 'one-pieces');
    const hasBottoms = selected.some((s) => s.fashnCategory === 'bottoms');
    if (hasDress && hasBottoms) warnings.push('Dress and bottoms will layer oddly — the dress is applied first.');

    return { ok: errors.length === 0, errors, warnings };
  }
}

export const fitValidator = new FitValidator();