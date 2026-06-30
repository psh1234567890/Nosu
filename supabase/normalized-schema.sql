-- Nosu Best production normalized storage schema.
-- Run this in the Supabase SQL Editor before setting SUPABASE_STORAGE_MODE=normalized.
-- The app checks these tables through GET /api/admin/storage-check before public launch.

create table if not exists public.nb_users (
  id text primary key,
  login_id text unique not null,
  password_hash text,
  password_salt text,
  auth_provider text not null,
  phone text,
  phone_verified boolean not null default false,
  display_name text not null,
  title text not null,
  bio text not null,
  photo_url text,
  role text not null default 'member',
  coins integer not null default 0,
  accent_color text not null default 'blue',
  profile_frame text not null default 'clean',
  banner_style text not null default 'plain',
  featured_badge text not null default '신규 토론러',
  owned_item_ids jsonb not null default '[]'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  deactivated_at timestamptz,
  deactivation_reason text,
  updated_at timestamptz not null default now()
);

alter table public.nb_users
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivation_reason text;

create table if not exists public.nb_user_claims (
  id text primary key,
  user_id text not null references public.nb_users(id) on delete cascade,
  label text not null,
  value text not null,
  status text not null,
  submitted_reason text,
  evidence_text text,
  evidence_url text,
  evidence_files jsonb not null default '[]'::jsonb,
  submitted_at text,
  reviewer_id text,
  reviewer_name text,
  reviewed_at text,
  review_memo text,
  updated_at timestamptz not null default now()
);

alter table public.nb_user_claims
  add column if not exists submitted_reason text,
  add column if not exists evidence_text text,
  add column if not exists evidence_url text,
  add column if not exists evidence_files jsonb not null default '[]'::jsonb,
  add column if not exists submitted_at text,
  add column if not exists reviewer_id text,
  add column if not exists reviewer_name text,
  add column if not exists reviewed_at text,
  add column if not exists review_memo text;

create table if not exists public.nb_rooms (
  id text primary key,
  title text not null,
  topic text not null,
  created_by text references public.nb_users(id) on delete set null,
  created_at_text text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.nb_channels (
  id text primary key,
  room_id text not null references public.nb_rooms(id) on delete cascade,
  title text not null,
  visibility text not null,
  invite_code text,
  format text not null,
  status text not null,
  phase text not null,
  created_by text references public.nb_users(id) on delete set null,
  participant_limit integer not null default 2,
  active_speaker_id text references public.nb_users(id) on delete set null,
  phase_started_at bigint,
  phase_ends_at bigint,
  turn_started_at bigint,
  coin_stake integer not null default 0,
  ai_judgement jsonb,
  final_result jsonb,
  created_at_text text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.nb_channel_participants (
  channel_id text not null references public.nb_channels(id) on delete cascade,
  user_id text not null references public.nb_users(id) on delete cascade,
  stance text not null,
  remaining_seconds numeric not null default 300,
  snapshot jsonb not null,
  primary key (channel_id, user_id)
);

create table if not exists public.nb_channel_spectators (
  channel_id text not null references public.nb_channels(id) on delete cascade,
  user_id text not null references public.nb_users(id) on delete cascade,
  primary key (channel_id, user_id)
);

create table if not exists public.nb_debate_messages (
  id text primary key,
  channel_id text not null references public.nb_channels(id) on delete cascade,
  author_id text references public.nb_users(id) on delete set null,
  phase text,
  body text not null,
  created_at_text text not null
);

create table if not exists public.nb_spectator_messages (
  id text primary key,
  channel_id text not null references public.nb_channels(id) on delete cascade,
  author_id text references public.nb_users(id) on delete set null,
  body text not null,
  created_at_text text not null
);

create table if not exists public.nb_votes (
  id text primary key,
  channel_id text not null references public.nb_channels(id) on delete cascade,
  voter_id text references public.nb_users(id) on delete set null,
  target_user_id text references public.nb_users(id) on delete set null,
  created_at_text text not null
);

create table if not exists public.nb_reactions (
  id text primary key,
  channel_id text not null references public.nb_channels(id) on delete cascade,
  spectator_id text references public.nb_users(id) on delete set null,
  target_user_id text references public.nb_users(id) on delete set null,
  created_at_text text not null
);

create table if not exists public.nb_reports (
  id text primary key,
  reporter_id text references public.nb_users(id) on delete set null,
  target_type text not null,
  target_id text not null,
  channel_id text references public.nb_channels(id) on delete set null,
  reason text not null,
  status text not null default 'open',
  created_at_text text not null,
  resolved_at_text text,
  resolved_by text references public.nb_users(id) on delete set null,
  evidence_files jsonb not null default '[]'::jsonb
);

alter table public.nb_reports
  add column if not exists evidence_files jsonb not null default '[]'::jsonb;

create table if not exists public.nb_coin_ledger (
  id text primary key,
  type text not null,
  user_id text references public.nb_users(id) on delete set null,
  amount integer not null,
  memo text not null,
  created_at_text text not null
);

create table if not exists public.nb_app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists nb_users_role_idx on public.nb_users(role);
create index if not exists nb_user_claims_user_idx on public.nb_user_claims(user_id);
create index if not exists nb_rooms_created_by_idx on public.nb_rooms(created_by);
create index if not exists nb_channels_room_status_idx on public.nb_channels(room_id, status);
create index if not exists nb_channels_created_by_idx on public.nb_channels(created_by);
create index if not exists nb_channels_active_speaker_idx on public.nb_channels(active_speaker_id);
create index if not exists nb_channel_participants_user_idx on public.nb_channel_participants(user_id);
create index if not exists nb_channel_spectators_user_idx on public.nb_channel_spectators(user_id);
create index if not exists nb_debate_messages_channel_idx on public.nb_debate_messages(channel_id);
create index if not exists nb_debate_messages_author_idx on public.nb_debate_messages(author_id);
create index if not exists nb_spectator_messages_channel_idx on public.nb_spectator_messages(channel_id);
create index if not exists nb_spectator_messages_author_idx on public.nb_spectator_messages(author_id);
create index if not exists nb_votes_channel_idx on public.nb_votes(channel_id);
create index if not exists nb_votes_voter_idx on public.nb_votes(voter_id);
create index if not exists nb_votes_target_user_idx on public.nb_votes(target_user_id);
create unique index if not exists nb_votes_channel_voter_uidx on public.nb_votes(channel_id, voter_id) where voter_id is not null;
create index if not exists nb_reactions_channel_idx on public.nb_reactions(channel_id);
create index if not exists nb_reactions_spectator_idx on public.nb_reactions(spectator_id);
create index if not exists nb_reactions_target_user_idx on public.nb_reactions(target_user_id);
create index if not exists nb_reports_status_idx on public.nb_reports(status);
create index if not exists nb_reports_reporter_idx on public.nb_reports(reporter_id);
create index if not exists nb_reports_channel_idx on public.nb_reports(channel_id);
create index if not exists nb_reports_resolved_by_idx on public.nb_reports(resolved_by);
create index if not exists nb_coin_ledger_user_idx on public.nb_coin_ledger(user_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nb_users_role_check') then
    alter table public.nb_users add constraint nb_users_role_check check (role in ('admin', 'moderator', 'member')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nb_users_auth_provider_check') then
    alter table public.nb_users add constraint nb_users_auth_provider_check check (auth_provider in ('local', 'google', 'apple', 'naver', 'kakao')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nb_users_coins_nonnegative_check') then
    alter table public.nb_users add constraint nb_users_coins_nonnegative_check check (coins >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nb_user_claims_status_check') then
    alter table public.nb_user_claims add constraint nb_user_claims_status_check check (status in ('verified', 'pending', 'self_reported', 'rejected')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nb_channels_visibility_check') then
    alter table public.nb_channels add constraint nb_channels_visibility_check check (visibility in ('public', 'private')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nb_channels_format_check') then
    alter table public.nb_channels add constraint nb_channels_format_check check (format in ('text', 'voice')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nb_channels_status_check') then
    alter table public.nb_channels add constraint nb_channels_status_check check (status in ('waiting', 'live', 'voting', 'finished')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nb_channels_phase_check') then
    alter table public.nb_channels add constraint nb_channels_phase_check check (phase in ('ready', 'opening', 'crossfire', 'closing', 'voting', 'finished')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nb_channels_participant_limit_check') then
    alter table public.nb_channels add constraint nb_channels_participant_limit_check check (participant_limit between 1 and 20) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nb_channels_coin_stake_nonnegative_check') then
    alter table public.nb_channels add constraint nb_channels_coin_stake_nonnegative_check check (coin_stake >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nb_channel_participants_stance_check') then
    alter table public.nb_channel_participants add constraint nb_channel_participants_stance_check check (stance in ('agree', 'disagree')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nb_channel_participants_remaining_seconds_check') then
    alter table public.nb_channel_participants add constraint nb_channel_participants_remaining_seconds_check check (remaining_seconds >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nb_reports_target_type_check') then
    alter table public.nb_reports add constraint nb_reports_target_type_check check (target_type in ('channel', 'debate_message', 'spectator_message', 'user')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nb_reports_status_check') then
    alter table public.nb_reports add constraint nb_reports_status_check check (status in ('open', 'reviewing', 'resolved', 'dismissed')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nb_coin_ledger_type_check') then
    alter table public.nb_coin_ledger add constraint nb_coin_ledger_type_check check (type in ('signup', 'debate_win', 'debate_loss', 'debate_reward', 'debate_result', 'admin_grant', 'shop_purchase', 'shop_reserve')) not valid;
  end if;
end $$;

alter table public.nb_users enable row level security;
alter table public.nb_user_claims enable row level security;
alter table public.nb_rooms enable row level security;
alter table public.nb_channels enable row level security;
alter table public.nb_channel_participants enable row level security;
alter table public.nb_channel_spectators enable row level security;
alter table public.nb_debate_messages enable row level security;
alter table public.nb_spectator_messages enable row level security;
alter table public.nb_votes enable row level security;
alter table public.nb_reactions enable row level security;
alter table public.nb_reports enable row level security;
alter table public.nb_coin_ledger enable row level security;
alter table public.nb_app_settings enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'nb_users',
    'nb_user_claims',
    'nb_rooms',
    'nb_channels',
    'nb_channel_participants',
    'nb_channel_spectators',
    'nb_debate_messages',
    'nb_spectator_messages',
    'nb_votes',
    'nb_reactions',
    'nb_reports',
    'nb_coin_ledger',
    'nb_app_settings'
  ]
  loop
    execute format('drop policy if exists "%s_service_role_rw" on public.%I', table_name, table_name);
    execute format(
      'create policy "%s_service_role_rw" on public.%I for all to service_role using (true) with check (true)',
      table_name,
      table_name
    );
  end loop;
end $$;
