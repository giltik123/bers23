import { CREATIVE_THEMES, creativeThemeKey } from '@/lib/creative/CreativeThemes';

export const creativeMoodBoards = {
  forGoal(goalId, analysis) {
    const themes = CREATIVE_THEMES[goalId] || CREATIVE_THEMES.marketing;
    const palette = analysis.color.palette?.length ? analysis.color.palette : ['Neutral', 'Warm highlight', 'Deep shadow'];
    const orientation = analysis.composition.orientation;
    return themes.slice(0, 2).map((theme, index) => {
      const lightingKey = index ? 'directionalContrast' : 'softBalancedLight';
      const compositionKey = orientation === 'landscape' ? 'layeredWide' : 'centeredSubject';
      return {
        id: goalId + '-' + index,
        name: theme,
        themeKey: creativeThemeKey(theme),
        lighting: index ? 'Directional contrast' : 'Soft balanced light',
        lightingKey,
        palette,
        composition: orientation === 'landscape' ? 'Layered wide composition' : 'Centered subject composition',
        compositionKey,
        style: theme,
        workspace: analysis.workspace,
      };
    });
  },
};
