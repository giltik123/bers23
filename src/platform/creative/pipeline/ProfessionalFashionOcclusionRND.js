import { compositeMaskedLinearLightRND } from './ProfessionalMaskedCompositeRND.js';

/**
 * BERS Fashion foreground occlusion candidate — research only.
 *
 * The caller supplies explicit ORIGINAL-space matte coverage for foreground
 * hands/hair. A pixel with matte=255 restores the ORIGINAL photograph over the
 * garment composite; 0 retains the garment; intermediate values blend in
 * premultiplied linear-light, avoiding dark halos at translucent boundaries.
 *
 * No auto-segmentation, pose understanding, Core authority, or provider
 * admission is granted here. The mask still needs canonical source lineage.
 */
export function restoreFashionForegroundRND({ original, garmentComposite, foregroundAlpha }) {
  if (!original || !garmentComposite ||
      !(original.data instanceof Uint8ClampedArray) ||
      !(garmentComposite.data instanceof Uint8ClampedArray) ||
      !(foregroundAlpha instanceof Uint8Array))
    throw new Error('Fashion foreground restoration needs exact RGBA8 images and alpha matte');
  if (!Number.isSafeInteger(original.width) || !Number.isSafeInteger(original.height) ||
      original.width < 1 || original.height < 1 ||
      original.width * original.height > 24_000_000 ||
      original.width !== garmentComposite.width || original.height !== garmentComposite.height ||
      original.orientation !== 1 || garmentComposite.orientation !== 1 ||
      original.data.length !== original.width * original.height * 4 ||
      garmentComposite.data.length !== original.data.length ||
      foregroundAlpha.length !== original.width * original.height)
    throw new Error('Fashion foreground source, garment and matte geometry must match');
  if (!foregroundAlpha.some(alpha => alpha > 0))
    throw new Error('Foreground matte is empty; no occlusion evidence is supplied');

  const image = compositeMaskedLinearLightRND(
    garmentComposite,
    original,
    {
      coordinateSpace: 'ORIGINAL', width: original.width,
      height: original.height, alpha: foregroundAlpha,
    },
    {
      originalBounds: {
        x: 0, y: 0, width: original.width, height: original.height,
      },
      providerWidth: original.width, providerHeight: original.height,
      scaleX: 1, scaleY: 1,
    },
  );
  return image;
}
