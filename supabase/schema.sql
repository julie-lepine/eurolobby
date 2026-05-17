-- EuroLobby — schéma Supabase (Phase 3)
-- Exécuter dans : Supabase Dashboard → SQL Editor → New query → Run

-- Profils joueurs (invités + comptes liés à Auth)
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users (id) on delete cascade,
  pseudo text not null,
  avatar text not null default '🎤',
  email text,
  is_guest boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_auth_user_id_idx
  on public.profiles (auth_user_id)
  where auth_user_id is not null;

create unique index if not exists profiles_email_idx
  on public.profiles (lower(email))
  where email is not null;

-- Lobbys : état complet en JSON (performances, votes, chat, membres…)
create table if not exists public.lobbies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  payload jsonb not null,
  member_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);

create index if not exists lobbies_code_idx on public.lobbies (code);
create index if not exists lobbies_member_ids_gin on public.lobbies using gin (member_ids);

-- Migration : colonne member_ids sur bases existantes
alter table public.lobbies add column if not exists member_ids uuid[] not null default '{}';

update public.lobbies
set member_ids = coalesce(
  (
    select array_agg(elem::uuid)
    from jsonb_array_elements_text(payload->'memberIds') as elem
    where elem ~* '^[0-9a-f-]{36}$'
  ),
  '{}'::uuid[]
)
where member_ids = '{}'::uuid[] or member_ids is null;

-- RLS
alter table public.profiles enable row level security;
alter table public.lobbies enable row level security;

drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_insert" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
drop policy if exists "lobbies_select" on public.lobbies;
drop policy if exists "lobbies_insert" on public.lobbies;
drop policy if exists "lobbies_delete" on public.lobbies;
drop policy if exists "lobbies_update" on public.lobbies;

-- Profils : lecture publique (affichage pseudo/avatar), écriture ouverte MVP invités
create policy "profiles_select" on public.profiles for select using (true);
create policy "profiles_insert" on public.profiles for insert with check (true);
create policy "profiles_update" on public.profiles
  for update using (
    auth.uid() is not null
    and auth_user_id = auth.uid()
  );

-- Lobbys : lecture si membre (member_ids) ; écriture si membre
create policy "lobbies_select" on public.lobbies
  for select using (true);

create policy "lobbies_insert" on public.lobbies for insert with check (true);

create policy "lobbies_update" on public.lobbies
  for update using (true);

create policy "lobbies_delete" on public.lobbies
  for delete using (true);

-- Realtime sur les mises à jour de lobby (idempotent si déjà activé)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'lobbies'
  ) then
    alter publication supabase_realtime add table public.lobbies;
  end if;
end $$;
