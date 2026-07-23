// IdentityAnalyzer — extracts VISUAL CONSISTENCY descriptors for detected humans.
// IMPORTANT: no biometric data is ever stored — only appearance descriptors
// (hair color/length, skin tone, general proportions, etc.) used to keep edits consistent.
class IdentityAnalyzer {
  extract(raw = {}) {
    const i = raw.identity || {};
    if (!i.human_present) return { human_present: false, descriptors: null };
    const d = i.descriptors || {};
    return {
      human_present: true,
      descriptors: {
        hair_color: d.hair_color || null,
        hair_length: d.hair_length || null,
        skin_tone: d.skin_tone || null,
        face_proportions: d.face_proportions || null,
        eye_color: d.eye_color || null,
        age_estimate: d.age_estimate || null,
        facial_hair: d.facial_hair || null,
        accessories: d.accessories || null,
      },
    };
  }

  directive(p) {
    if (!p?.human_present) return '';
    const d = p.descriptors || {};
    const traits = [
      d.hair_color && `${d.hair_length || ''} ${d.hair_color} hair`.trim(),
      d.skin_tone && `${d.skin_tone} skin tone`,
      d.eye_color && `${d.eye_color} eyes`,
      d.facial_hair && d.facial_hair !== 'none' && d.facial_hair,
    ].filter(Boolean).join(', ');
    return `Strictly preserve the person's identity, face proportions and expression${traits ? ` (${traits})` : ''}.`;
  }

  drift(text, p) {
    if (!p?.human_present) return null;
    if (/face|identity|younger|older|nose|jaw|cheek|chin|eye shape|different person|makeover|reshape/i.test(text)) {
      return {
        category: 'identity', severity: 0.85,
        message: 'The current edit may change facial identity.',
        correction: "Strictly preserve the person's facial identity, proportions and unique features while applying the edit.",
      };
    }
    return null;
  }
}

export const identityAnalyzer = new IdentityAnalyzer();