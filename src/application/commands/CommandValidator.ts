import type { AICommand } from './AICommand';
import { withCommandStatus } from './AICommand';
import type { CommandContext } from './CommandContext';

export interface CommandValidationResult { readonly valid: boolean; readonly command: AICommand; readonly errors: readonly string[]; readonly warnings: readonly string[]; readonly clarificationRequired: boolean; readonly confirmationRequired: boolean; }

const imageRequired = new Set(['fashion_catalog_image', 'hair_color_change', 'background_replacement', 'portrait_enhancement', 'style_transfer', 'artistic_edit', 'generic_edit', 'identity_transformation']);
const garmentRequired = new Set(['fashion_catalog_image']);
const highRisk = new Set(['identity_transformation']);

export class CommandValidator {
  validate(command: AICommand, context: CommandContext): CommandValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let clarificationRequired = false;
    let confirmationRequired = false;

    if (!command.userInput) errors.push('Command input is required.');
    if (imageRequired.has(command.intent) && !context.input?.imageUrl) { clarificationRequired = true; errors.push('Image input is required.'); }
    if (garmentRequired.has(command.intent) && !context.input?.garmentImageUrl) { clarificationRequired = true; errors.push('Garment image input is required.'); }
    const denied = command.requiredCapabilities.filter((capability) => context.policy?.allowedCapabilities && !context.policy.allowedCapabilities.includes(capability));
    if (denied.length) errors.push(`Capabilities are not allowed: ${denied.join(', ')}.`);
    const availableCredits = context.budget?.availableCredits ?? Number.POSITIVE_INFINITY;
    const estimatedCredits = context.budget?.estimatedCredits ?? 0;
    if (estimatedCredits > availableCredits) errors.push('Not enough credits.');
    if (highRisk.has(command.intent) && !context.policy?.confirmation) { confirmationRequired = true; errors.push('Confirmation is required for high risk identity transformation.'); }
    if (command.confidence < 0.6) warnings.push('Low parser confidence.');

    const status = confirmationRequired ? 'CONFIRMATION_REQUIRED' : clarificationRequired ? 'CLARIFICATION_REQUIRED' : errors.length ? 'FAILED' : 'VALIDATED';
    return Object.freeze({ valid: errors.length === 0, command: withCommandStatus(command, status), errors: Object.freeze(errors), warnings: Object.freeze(warnings), clarificationRequired, confirmationRequired });
  }
}
