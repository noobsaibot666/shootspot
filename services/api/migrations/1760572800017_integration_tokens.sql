-- Up Migration
create table if not exists integration_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth_users(id) on delete cascade,
  label text not null default 'Portal',
  token_prefix text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists integration_tokens_user_active_idx
  on integration_tokens (user_id)
  where revoked_at is null;

-- Down Migration
drop table if exists integration_tokens;
