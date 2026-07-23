import { adaptiveResolution } from '@/lib/platform/AdaptiveResolution';
import { adaptivePerformance } from '@/lib/platform/AdaptivePerformance';

export function adaptiveRenderer(profile, mode) { const performance = adaptivePerformance(profile, mode); return { quality: adaptiveResolution(profile, performance.mode), decoding: 'async', animations: performance.animations, imageRendering: performance.mode === 'battery-saver' ? 'auto' : 'high-quality' }; }