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

export function openLink(url: string) {
  void Linking.openURL(url).catch(() => {});
}
