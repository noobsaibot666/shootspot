import { Linking } from 'react-native';

/** Public pages on the shared docs hub (D-35): legal texts, account deletion and support. */
const DOCS = 'https://docs.alan-design.com/shootspot';

export const links = {
  privacy: `${DOCS}/legal/privacy/`,
  terms: `${DOCS}/legal/terms/`,
  imageLicence: `${DOCS}/legal/image-licence/`,
  deleteAccount: `${DOCS}/legal/delete-account/`,
  support: `${DOCS}/user-guide/support/`,
} as const;

export const SUPPORT_EMAIL = 'hello@expose-u.com';

/** Opens the mail app to the support address (App Review 1.2: a way to report abuse in-app). */
export function emailSupport(subject = 'ShootSpot') {
  openLink(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`);
}

export function openLink(url: string) {
  void Linking.openURL(url).catch(() => {});
}
