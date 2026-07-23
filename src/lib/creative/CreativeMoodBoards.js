import { CREATIVE_THEMES } from '@/lib/creative/CreativeThemes';

export const creativeMoodBoards = {
  forGoal(goalId, analysis) {
    const themes = CREATIVE_THEMES[goalId] || CREATIVE_THEMES.marketing;
    const palette = analysis.color.palette?.length ? analysis.color.palette : ['Neutral', 'Warm highlight', 'Deep shadow'];
    return themes.slice(0, 2).map((theme, index) => ({ id: `${goalId}-${index}`, name: theme, lighting: index ? 'Directional contrast' : 'Soft balanced light', palette, composition: analysis.composition.orientation === 'landscape' ? 'Layered wide composition' : 'Centered subject composition', style: theme, workspace: analysis.workspace }));
  },
};