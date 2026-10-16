import { centerCrop, checkPublishable, type Framing, type PublishCheck } from '@shootspot/shared';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export interface ProcessedCapture {
  uri: string;
  width: number;
  height: number;
  source: { width: number; height: number };
  check: PublishCheck;
}

/**
 * Client half of the image rule (plan §5, upload step 1): load the captured file upright, apply
 * the centred publish crop, and re-encode as JPEG. Re-encoding drops the original EXIF (including
 * GPS); the server re-validates and re-encodes again regardless.
 */
export async function processCapture(fileUri: string, framing: Framing): Promise<ProcessedCapture> {
  const original = await ImageManipulator.manipulate(fileUri).renderAsync();
  const source = { width: original.width, height: original.height };
  const crop = centerCrop(source, framing);

  const cropped = await ImageManipulator.manipulate(fileUri)
    .crop({ originX: crop.left, originY: crop.top, width: crop.width, height: crop.height })
    .renderAsync();
  const saved = await cropped.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });

  return {
    uri: saved.uri,
    width: saved.width,
    height: saved.height,
    source,
    check: checkPublishable({ width: saved.width, height: saved.height }),
  };
}

/** Upright size of an image file (EXIF orientation applied), for the import crop screen. */
export async function uprightSize(fileUri: string): Promise<{ width: number; height: number }> {
  const r = await ImageManipulator.manipulate(fileUri).renderAsync();
  return { width: r.width, height: r.height };
}

/**
 * Import crop (D-28): the member placed the frame; crop that rectangle (in upright source
 * pixels) and re-encode as JPEG, which also drops the photo's metadata.
 */
export async function processImportCrop(
  fileUri: string,
  rect: { left: number; top: number; width: number; height: number },
): Promise<Omit<ProcessedCapture, 'source'>> {
  const cropped = await ImageManipulator.manipulate(fileUri)
    .crop({ originX: rect.left, originY: rect.top, width: rect.width, height: rect.height })
    .renderAsync();
  const saved = await cropped.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  return {
    uri: saved.uri,
    width: saved.width,
    height: saved.height,
    check: checkPublishable({ width: saved.width, height: saved.height }),
  };
}

export function toFileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}
