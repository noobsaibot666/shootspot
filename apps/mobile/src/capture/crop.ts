import { centerCrop, type CropRect, type Framing, type Size } from '@shootspot/shared';
import type { CameraOrientation } from 'react-native-vision-camera';

/**
 * Where the publish crop falls on the (portrait-locked) preview.
 *
 * The UI never rotates; the preview keeps sensor orientation, so when the phone turns sideways
 * the user sees the preview as landscape. We compute the crop in the user's upright view and map
 * it back to screen coordinates. Crops are centred, so the axis swap is the whole mapping.
 */
export function previewCropRect(
  preview: Size,
  orientation: CameraOrientation | undefined,
  framing: Framing,
): CropRect {
  const sideways = isSideways(orientation);
  const upright: Size = sideways ? { width: preview.height, height: preview.width } : preview;
  const crop = centerCrop(upright, framing);
  return sideways
    ? { left: crop.top, top: crop.left, width: crop.height, height: crop.width }
    : crop;
}

export function isSideways(orientation: CameraOrientation | undefined): boolean {
  return orientation === 'left' || orientation === 'right';
}

/** Degrees to rotate on-screen icons so they read upright for the user. */
export function iconRotation(orientation: CameraOrientation | undefined): number {
  switch (orientation) {
    case 'left':
      return 90;
    case 'right':
      return -90;
    case 'down':
      return 180;
    default:
      return 0;
  }
}
