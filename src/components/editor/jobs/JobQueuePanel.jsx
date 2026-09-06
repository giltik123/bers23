import React from 'react';
import JobCenter from '@/components/editor/jobs/JobCenter';

function editorProjectId() {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('id')?.trim() || null;
}

// Backward-compatible alias for the expanded Job Center. Recovery remains
// project-scoped; Core still owns tenant/user/project authorization.
export default function JobQueuePanel({ projectId }) {
  return <JobCenter projectId={projectId ?? editorProjectId()} />;
}