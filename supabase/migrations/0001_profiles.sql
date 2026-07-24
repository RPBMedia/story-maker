-- StoryMaker: user profiles
-- Run in the Supabase SQL editor (or via `supabase db push` with the CLI).

-- 1. Table ------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  plan text not null default 'free'
    check (plan in ('free', 'creator', 'professional')),
  -- Advisory only for now: rendering is browser-side, so this counter cannot
  -- be trusted for billing. It models the groundwork for future server-side
  -- enforcement (server renders / signed export jobs will increment it in a
  -- trusted context).
  export_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_plan_idx on public.profiles (plan);

-- 2. Auto-create a profile row for every new auth user -----------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name',
             new.raw_user_meta_data ->> 'name'),
    -- Google's OIDC avatar arrives as `picture`; other providers use
    -- `avatar_url`. Capture whichever is present. (The app also reads the
    -- avatar from the live session metadata, so this is best-effort.)
    coalesce(new.raw_user_meta_data ->> 'avatar_url',
             new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Keep updated_at fresh ----------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- 4. Row Level Security --------------------------------------------------------
alter table public.profiles enable row level security;

-- Users can read ONLY their own profile.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- Users can update ONLY their own profile, and cannot change their plan or
-- export_count from the client (those are server-managed columns).
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and plan = (select p.plan from public.profiles p where p.id = auth.uid())
    and export_count = (select p.export_count from public.profiles p where p.id = auth.uid())
  );

-- No insert/delete policies: rows are created by the trigger (security
-- definer) and removed by the auth.users cascade.
