import type { LegalKind } from '@shootspot/shared';
import type { Config } from './config';

/**
 * Current versions of the documents members accept. Draft wording until counsel review
 * (HANDWORK 4.1). Bumping a version makes clients re-ask for acceptance.
 */
export function legalVersions(
  config: Config,
): Record<LegalKind, string> & { attribution_notice: string } {
  return {
    // 2026-10-21: 18+ and zero tolerance for objectionable content and abusive users (D-41).
    terms: '2026-10-21',
    privacy: '2026-10-21',
    image_license: config.IMAGE_LICENSE_VERSION,
    attribution_notice: '2026-10-draft',
  };
}
