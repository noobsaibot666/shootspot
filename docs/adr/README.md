# Architecture Decision Records

| #                                           | Decision                                                                                         | Status                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------ |
| [0001](0001-monorepo-and-toolchain.md)      | pnpm monorepo, TypeScript, Vitest, Node 24                                                       | Accepted                       |
| [0002](0002-mobile-framework-and-camera.md) | Expo (CNG) + React Native + VisionCamera v5; native modules only for proven gaps                 | Accepted, pending device spike |
| [0003](0003-media-pipeline.md)              | Client crop to JPEG, server re-validation with sharp, WebP derivatives, SeaweedFS object storage | Accepted                       |
| [0004](0004-nas-prototype-topology.md)      | TrueNAS prototype: containers, outbound tunnel, off-site backup                                  | Proposed                       |
| [0005](0005-authentication.md)              | Self-hosted OIDC provider (Zitadel) with MFA for admins                                          | Proposed — decide in Phase 2   |
| [0006](0006-maps-and-place-search.md)       | react-native-maps (Apple on iOS, Google on Android); place search per platform                   | Accepted (from D-18/D-21)      |
