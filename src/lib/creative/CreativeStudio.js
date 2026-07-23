import { creativeAnalyzer } from '@/lib/creative/CreativeAnalyzer';
import { creativeIdeaGenerator } from '@/lib/creative/CreativeIdeaGenerator';
import { creativeMoodBoards } from '@/lib/creative/CreativeMoodBoards';
import { creativeRecommendations } from '@/lib/creative/CreativeRecommendations';
import { creditsCalculator } from '@/lib/credits/creditsCalculator';
import { getCreativeGoal } from '@/lib/creative/CreativeGoals';

export const creativeStudio = {
  analyze(context) { return creativeAnalyzer.analyze(context); },
  generate({ goalId, analysis }) { const goal = getCreativeGoal(goalId); return { goal, ideas: creativeIdeaGenerator.generate(goal, analysis), moodBoards: creativeMoodBoards.forGoal(goalId, analysis) }; },
  strategy({ idea, goal, analysis, outfits }) { const recommendations = creativeRecommendations.build({ idea, goal, outfits }); const steps = recommendations.recipes.map((recipe) => ({ recipeId: recipe.id, label: recipe.name, objectHints: recipe.supportedObjectTypes || [] })); const chain = { id: `creative-${idea.id}`, name: idea.title, description: idea.description, icon: 'Sparkles', steps }; const estimate = creditsCalculator.estimateChain(chain); return { ...chain, goalId: goal.id, analysis, recommendations, requiredOperations: recommendations.recipes.map((recipe) => recipe.structuredPrompt.action), estimatedCredits: estimate.credits, estimatedTimeMs: steps.length * 30000, executionOrder: steps.map((step, index) => ({ ...step, order: index + 1 })) }; },
};