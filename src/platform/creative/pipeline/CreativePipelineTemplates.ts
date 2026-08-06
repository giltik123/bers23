import type { CreativePipelineTemplate } from './types';

export class CreativePipelineTemplates {
  list(): CreativePipelineTemplate[] {
    return [{ name: 'Product Catalog', operations: ['color_correction', 'lighting_adjustment', 'background_check', 'virtual_try_on'] }, { name: 'Portrait Studio', operations: ['lighting_adjustment', 'color_correction', 'final_enhancement'] }, { name: 'Fashion Campaign', operations: ['segmentation', 'virtual_try_on', 'style_generation', 'quality_check'] }, { name: 'Social Media Post', operations: ['color_correction', 'style_generation', 'final_enhancement'] }, { name: 'Luxury Brand', operations: ['color_correction', 'lighting_adjustment', 'background_replacement', 'final_enhancement'] }, { name: 'Real Estate', operations: ['lighting_adjustment', 'background_check', 'color_correction'] }];
  }
}
