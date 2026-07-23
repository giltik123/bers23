// ImageValidator — validates every image before it enters the pipeline.
const LIMITS = {
  minWidth: 64, minHeight: 64,
  maxWidth: 8192, maxHeight: 8192,
  maxFileSize: 25 * 1024 * 1024,
  minAspect: 1 / 8, maxAspect: 8,
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
};

class ImageValidator {
  validate(loaded) {
    const errors = [];
    const { width, height, size, mimeType } = loaded;

    if (!width || !height) errors.push('Image is corrupted (no dimensions)');
    if (width < LIMITS.minWidth || height < LIMITS.minHeight) errors.push(`Image too small (min ${LIMITS.minWidth}×${LIMITS.minHeight}px)`);
    if (width > LIMITS.maxWidth || height > LIMITS.maxHeight) errors.push(`Image too large (max ${LIMITS.maxWidth}×${LIMITS.maxHeight}px)`);
    if (size > LIMITS.maxFileSize) errors.push('File exceeds 25MB');
    if (mimeType && !LIMITS.allowedTypes.includes(mimeType)) errors.push(`Unsupported color format: ${mimeType}`);

    const aspect = width && height ? width / height : 0;
    if (aspect && (aspect < LIMITS.minAspect || aspect > LIMITS.maxAspect)) errors.push('Extreme aspect ratio not supported');

    return {
      valid: errors.length === 0,
      errors,
      info: { width, height, size, mimeType, aspect, hasTransparency: mimeType === 'image/png' || mimeType === 'image/webp' },
    };
  }

  get limits() { return LIMITS; }
}

export const imageValidator = new ImageValidator();