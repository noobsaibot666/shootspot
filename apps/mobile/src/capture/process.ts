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

export function toFileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}
