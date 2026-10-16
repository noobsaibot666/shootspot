# ADR 0005 — Authentication

**Status:** Proposed · decide at the start of Phase 2

## Requirements

- EU data residency (D-01)
- member sign-up and sign-in on mobile
- **MFA for admins**
- server-side roles
- an account deletion workflow
- an age gate (D-02)
- runs on the NAS prototype and migrates to the cloud later

## Options

| Option                                               | Pros                                                                                                                   | Cons                                                                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Zitadel (self-hosted)** — proposed                 | OIDC/OAuth2, passkeys and TOTP MFA, Postgres-backed, single container; can move to Zitadel Cloud in an EU region later | Another service to run and back up on the NAS                                                                    |
| Keycloak (self-hosted)                               | Very mature, feature-complete                                                                                          | Heavy (JVM); its admin UX is complex for a small team                                                            |
| Managed EU auth (e.g. Supabase Auth in an EU region) | No ops                                                                                                                 | A processor DPA is needed; ties us to a vendor schema; it would be the only external dependency in the prototype |
| Build our own in the API                             | Full control                                                                                                           | Security risk; MFA and passkeys are hard to get right                                                            |

## Proposal

Zitadel, self-hosted beside the API. The API validates tokens and keeps `users`, `roles` and `consents` in its own schema, keyed by the subject ID. The admin web gets a separate client with required MFA.
