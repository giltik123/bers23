export const creativeAnalyzer = {
  analyze({ project, objects = [], memory = null, workspace = null }) {
    const profiles = memory?.profiles || {};
    return {
      objects: objects.map((item) => item.label).filter(Boolean),
      composition: { orientation: project?.width > project?.height ? 'landscape' : 'portrait', subjectCount: objects.length },
      lighting: profiles.lighting || { type: 'unassessed', quality: 'unassessed' },
      color: profiles.color || { palette: [], grading_style: 'unassessed' },
      perspective: profiles.perspective || { horizon: 'unassessed' },
      style: profiles.style || { overall_style: 'unassessed', mood: 'unassessed' },
      workspace: workspace?.id || workspace?.name || 'universal',
      fashionRelevant: objects.some((item) => /person|shirt|dress|jacket|clothing|pants/i.test(item.label)),
    };
  },
};