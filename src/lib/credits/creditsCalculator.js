// CreditsCalculator — the ONLY place credit costs are computed.
// Consumes existing estimations (AI Planner plans, Recipe credits, Try-On counts)
// and applies provider-specific pricing. No other service prices anything.

export const PROVIDER_PRICING = {
  reve: { edit: 30 },
  fashn: { tryon: 50 }, // per garment
  sam3: { segmentation: 10 },
};

const HIGH_RES_SURCHARGE = 5;

class CreditsCalculator {
  priceFor(provider, operation) {
    return PROVIDER_PRICING[provider]?.[operation] ?? PROVIDER_PRICING.reve.edit;
  }

  // AI Planner / Recipe Engine path — plan is the aiPlanner output, recipe optional.
  estimateEdit({ plan = null, recipe = null, provider = 'reve' }) {
    const breakdown = [];
    const base = recipe?.credits ?? this.priceFor(provider, 'edit');
    breakdown.push({ item: recipe ? `Recipe: ${recipe.name}` : 'AI edit', credits: base });
    // The planner flags high-resolution work in its own estimation breakdown.
    if (plan?.credits?.breakdown?.some((b) => /high resolution/i.test(b.item))) {
      breakdown.push({ item: 'High resolution', credits: HIGH_RES_SURCHARGE });
    }
    return this._total(breakdown);
  }

  // Recipe chain — one edit per step.
  estimateChain(chain) {
    const breakdown = (chain.steps || []).map((s) => ({ item: s.label, credits: this.priceFor('reve', 'edit') }));
    return this._total(breakdown);
  }

  // Virtual Try-On — priced per garment.
  estimateTryOn(garmentCount) {
    const per = this.priceFor('fashn', 'tryon');
    return this._total([{ item: `Try-on (${garmentCount} garment${garmentCount === 1 ? '' : 's'})`, credits: per * garmentCount }]);
  }

  estimateSegmentation() {
    return this._total([{ item: 'Object segmentation', credits: this.priceFor('sam3', 'segmentation') }]);
  }

  // Future providers: register pricing here and price by (provider, operation, units).
  estimate({ provider, operation, units = 1, label = null }) {
    return this._total([{ item: label || operation, credits: this.priceFor(provider, operation) * units }]);
  }

  _total(breakdown) {
    return { credits: breakdown.reduce((s, b) => s + b.credits, 0), breakdown };
  }
}

export const creditsCalculator = new CreditsCalculator();