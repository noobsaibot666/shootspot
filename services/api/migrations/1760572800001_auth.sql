-- Up Migration
-- Better Auth tables (ADR 0005). Generated with scripts/auth-schema.ts against an empty
-- database; only `role` was tightened to NOT NULL DEFAULT 'member'. Regenerate and diff when
-- auth plugins or fields change.
create table "auth_users" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null, "role" text not null default 'member' check ("role" in ('member', 'owner')));

create table "auth_sessions" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" uuid not null references "auth_users" ("id") on delete cascade);

create table "auth_accounts" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "accountId" text not null, "providerId" text not null, "userId" uuid not null references "auth_users" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);

create table "auth_verifications" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create table "auth_rate_limits" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "key" text not null unique, "count" integer not null, "lastRequest" bigint not null);

create index "auth_sessions_userId_idx" on "auth_sessions" ("userId");
create index "auth_accounts_userId_idx" on "auth_accounts" ("userId");
create index "auth_verifications_identifier_idx" on "auth_verifications" ("identifier");

-- Down Migration
drop table if exists "auth_rate_limits";
drop table if exists "auth_verifications";
drop table if exists "auth_accounts";
drop table if exists "auth_sessions";
drop table if exists "auth_users";
