import type { CreativeEditIntent } from './types';

export class CreativeEditIntentAnalyzer {
  analyze(request: string): CreativeEditIntent {
    const text = request.toLowerCase();

    if (/(убери|удали|remove).*(объект|object|предмет)|object removal/i.test(text)) {
      return { intent: 'object_removal', goals: ['remove_distraction', 'clean_composition'], requiresAI: true, reason: 'requires semantic object removal', confidence: 0.85 };
    }
    if (/(париж|paris|нов(ый|ое) окруж|scene|environment|замени фон|replace background|фон)/i.test(text)) {
      return { intent: 'background_change', goals: ['replace_environment', 'preserve_subject'], requiresAI: true, reason: 'requires new environment generation', confidence: 0.86 };
    }
    if (/(одежд|clothes|outfit|пример|fashion style|модн)/i.test(text)) {
      return { intent: 'fashion_style', goals: ['style_outfit', 'improve_fashion_presentation'], requiresAI: true, reason: 'requires virtual try-on or fashion generation', confidence: 0.84 };
    }
    if (/(портрет|portrait|лицо|skin|ретуш)/i.test(text)) {
      return { intent: 'portrait_improvement', goals: ['improve_skin', 'improve_lighting', 'preserve_identity'], requiresAI: false, reason: 'portrait can start with local lighting and color correction', confidence: 0.8 };
    }
    if (/(товар|product|магазин|catalog|каталог)/i.test(text)) {
      return { intent: 'product_photo', goals: ['improve_product_clarity', 'color_accuracy', 'commercial_readiness'], requiresAI: false, reason: 'product photos can start with local catalog enhancement', confidence: 0.83 };
    }
    if (/(арт|artistic|cinema|кино|стиль|style transformation)/i.test(text)) {
      return { intent: 'artistic_transformation', goals: ['change_style', 'create_mood'], requiresAI: true, reason: 'requires style transformation', confidence: 0.81 };
    }
    if (/(профессион|дороже|premium|бренд|качест|professional|luxury)/i.test(text)) {
      return { intent: 'premium_enhancement', goals: ['lighting_improvement', 'color_upgrade', 'detail_enhancement'], requiresAI: false, reason: 'local improvements can achieve target quality', confidence: 0.84 };
    }
    if (/(ярче|brightness|светлее|контраст|цвет|color|sharp|коррекц)/i.test(text)) {
      return { intent: 'color_correction', goals: ['lighting_improvement', 'color_upgrade'], requiresAI: false, reason: 'supported by local editing operations', confidence: 0.88 };
    }

    return { intent: 'professional_enhancement', goals: ['increase_quality'], requiresAI: false, reason: 'default to free local enhancement first', confidence: 0.62 };
  }
}
