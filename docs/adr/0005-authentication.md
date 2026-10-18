# ADR 0005 — Authentication

**Status:** Accepted · 2026-10-16 (product owner)

## Requirements

- EU data residency (D-01)
- member sign-up and sign-in on mobile
- **MFA for admins**
- server-side roles
- an account deletion workflow
- an age gate (D-02)
- runs on the NAS prototype and migrates to the cloud later
- **low memory footprint**: the NAS has about 3.5 GB realistically free, shared with other apps

## Decision

- **Auth runs inside our API**, using the open-source **Better Auth** library. Its tables (users, sessions, verification codes) live in our own Postgres. There is no extra service to run, update or back up.
- **Members sign in with a passwordless email code**: they enter their email, receive a 6-digit code, and enter it. There are no member passwords at all, so nothing to leak, reset or breach-check. Sign in with Apple and Google can be added later. Apple requires Sign in with Apple if any other social login is offered.
- **Admins** use the same email code plus a **required second factor** (TOTP authenticator app, with passkeys as an option). The admin web has its own session policy: shorter lifetime, and admin routes reject sessions without MFA.
- **Roles** (`member`, `owner`) are stored on our user record and checked server-side on every admin route.
- **Mobile sessions** use bearer tokens stored in the device keychain/keystore. The admin web uses httpOnly cookies.

## Alternatives rejected

| Option                | Why not                                                                    |
| --------------------- | -------------------------------------------------------------------------- |
| Zitadel (self-hosted) | Another 300–500 MB container on a memory-tight NAS; more ops               |
| Managed EU auth       | An external processor holds accounts during the pilot; a vendor dependency |
| Hand-rolled auth      | Security risk                                                              |

## Consequences

- Email delivery is required from day one (HANDWORK 3.2). In development, codes go to a local Mailpit inbox.
- Phase 2 pins the Better Auth version and checks its installed type definitions before use, because the library moves quickly.

## Amendment 2026-10-18 (D-37)

Members may set an optional password (Settings; `PUT /v1/me/password`) and sign in with `/api/auth/sign-in/email`. There is no password sign-up: accounts are still created only by email-code sign-in. Changing a password needs the current one or a sign-in from the last 15 minutes, and signs out other sessions. The admin web accepts only password sessions (`auth_password_sessions`) plus TOTP, for owners listed in `ADMIN_EMAILS`; an email code only lets an admin set or reset the password. Admin sign-ins and new authenticators are emailed to the admin.
