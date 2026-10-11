import React from 'react';
import { usePlatformProfile } from '@/lib/platform/PlatformManager';

export default function AdaptiveLayout({ children, className = '' }) {
  const profile = usePlatformProfile();
  return (
    <div
      data-platform={profile.formFactor}
      className={['mx-auto w-full space-y-5 px-4 py-5 pb-10 sm:space-y-6 sm:px-6 sm:py-7', profile.compact ? 'max-w-none' : 'max-w-7xl', className].join(' ')}
    >
      {children}
    </div>
  );
}
