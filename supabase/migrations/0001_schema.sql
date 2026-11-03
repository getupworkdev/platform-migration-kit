-- Destination schema for the migration. RLS from the first migration.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- Keeps the link to the old platform so the migration can be re-run safely
-- and so support questions ("what was my old account?") can be answered.
create table public.legacy_user_map (
  legacy_id text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  kind text not null default 'article',
  slug text not null unique,
  title text not null,
  body text not null default '',
  author_id uuid references auth.users(id),
  published_at timestamptz,
  legacy_raw jsonb,                       -- the exported record, untouched; Phase 3 restructures from here
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.articles (published_at desc);
create index on public.articles using gin (legacy_raw jsonb_path_ops);

create table public.redirects (
  from_path text primary key,
  to_path text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles       enable row level security;
alter table public.legacy_user_map enable row level security;   -- service role only
alter table public.articles       enable row level security;
alter table public.redirects      enable row level security;

create policy profiles_self on public.profiles for select to authenticated using (id = auth.uid());
create policy articles_public_read on public.articles for select to anon, authenticated using (published_at is not null);
create policy articles_author_read on public.articles for select to authenticated using (author_id = auth.uid());
create policy articles_author_write on public.articles for all to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy redirects_public_read on public.redirects for select to anon, authenticated using (true);

-- Profile row on sign-up / admin createUser, carrying the display name over.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Used by the migration script (service role only) to link existing accounts by email.
create or replace function public.admin_find_user_by_email(p_email text)
returns table (id uuid)
language sql security definer set search_path = auth, pg_temp as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;
revoke all on function public.admin_find_user_by_email(text) from public, anon, authenticated;
