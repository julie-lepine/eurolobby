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
  updated_at timestamptz not null default now()
);

create index if not exists lobbies_code_idx on public.lobbies (code);

-- RLS (politiques ouvertes MVP — resserrer en production)
alter table public.profiles enable row level security;
alter table public.lobbies enable row level security;

drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_insert" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
drop policy if exists "lobbies_select" on public.lobbies;
drop policy if exists "lobbies_insert" on public.lobbies;
drop policy if exists "lobbies_update" on public.lobbies;

create policy "profiles_select" on public.profiles for select using (true);
create policy "profiles_insert" on public.profiles for insert with check (true);
create policy "profiles_update" on public.profiles for update using (true);

create policy "lobbies_select" on public.lobbies for select using (true);
create policy "lobbies_insert" on public.lobbies for insert with check (true);
create policy "lobbies_update" on public.lobbies for update using (true);

-- Realtime sur les mises à jour de lobby
alter publication supabase_realtime add table public.lobbies;
