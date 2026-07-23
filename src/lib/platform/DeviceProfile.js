export function createDeviceProfile() {
  const width = window.innerWidth; const height = window.innerHeight; const touch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  const formFactor = width < 640 ? 'phone' : width < 1024 ? 'tablet' : 'desktop';
  return { formFactor, touch, mouse: window.matchMedia('(pointer:fine)').matches, width, height, orientation: width > height ? 'landscape' : 'portrait', pixelRatio: window.devicePixelRatio || 1, compact: formFactor === 'phone', hybrid: formFactor === 'tablet' };
}