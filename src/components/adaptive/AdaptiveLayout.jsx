import React from 'react';
import { usePlatformProfile } from '@/lib/platform/PlatformManager';

export default function AdaptiveLayout({ children, className = '' }) { const profile = usePlatformProfile(); return <div data-platform={profile.formFactor} className={`mx-auto px-3 py-3 space-y-3 pb-6 ${profile.compact ? 'max-w-none' : 'max-w-5xl sm:px-4 sm:py-4 sm:space-y-4 sm:pb-8'} ${className}`}>{children}</div>; }