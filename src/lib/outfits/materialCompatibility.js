// MaterialCompatibility — detects fabric combinations that clash in texture,
// formality or season.
const CLASHES = [
  ['silk', 'denim', 'Silk and denim clash in formality — pair silk with tailored fabrics instead'],
  ['wool', 'linen', 'Wool and linen belong to opposite seasons'],
  ['velvet', 'linen', 'Velvet (winter, formal) clashes with linen (summer, casual)'],
  ['leather', 'linen', 'Heavy leather overwhelms lightweight linen'],
  ['velvet', 'denim', 'Velvet reads formal while denim reads casual — a risky mix'],
  ['silk', 'knit', 'Delicate silk against chunky knit creates a texture clash'],
];

class MaterialCompatibility {
  analyze(materials) {
    const set = [...new Set(materials.filter(Boolean).map((m) => m.toLowerCase()))];
    const clashes = [];
    for (const [a, b, note] of CLASHES) {
      if (set.includes(a) && set.includes(b)) clashes.push({ pair: [a, b], note });
    }
    const notes = [];
    if (set.length === 1) notes.push(`A single-material (${set[0]}) look is cohesive.`);
    if (set.length >= 4) notes.push('Many different fabrics — keeping to 2–3 materials usually looks more intentional.');
    const score = Math.max(20, 100 - clashes.length * 25 - Math.max(0, set.length - 3) * 5);
    return { score, clashes, notes, materials: set };
  }
}

export const materialCompatibility = new MaterialCompatibility();