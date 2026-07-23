import React from 'react';
import { usePlatformProfile } from '@/lib/platform/PlatformManager';

export default function AdaptiveToolbar({ children, className = '' }) { const profile = usePlatformProfile(); return <div className={`flex items-center gap-1 ${profile.compact ? 'max-w-[52%] overflow-x-auto scrollbar-none' : ''} ${className}`}>{children}</div>; }