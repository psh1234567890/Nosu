create table if not exists public.nb_app_state (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.nb_app_state enable row level security;

drop policy if exists "nb_app_state_service_role_only" on public.nb_app_state;
drop policy if exists "nb_app_state_service_role_rw" on public.nb_app_state;

create policy "nb_app_state_service_role_rw"
on public.nb_app_state
for all
to service_role
using (true)
with check (true);

create index if not exists nb_app_state_updated_at_idx
on public.nb_app_state (updated_at desc);
