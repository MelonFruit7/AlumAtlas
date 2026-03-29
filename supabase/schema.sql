create extension if not exists pgcrypto;

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  admin_password_hash text not null default '',
  submissions_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.groups
add column if not exists admin_password_hash text not null default '';

alter table public.groups
add column if not exists submissions_locked boolean not null default false;

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  device_id_hash text not null,
  display_name text not null,
  linkedin_url text not null,
  company_name text not null,
  company_domain text not null,
  company_logo_url text,
  profile_photo_url text,
  location_text text not null,
  country_code text not null,
  country_name text not null,
  state_region text,
  city text,
  lat double precision not null,
  lng double precision not null,
  is_us boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entries_group_device_unique unique (group_id, device_id_hash)
);

create index if not exists entries_group_id_idx on public.entries(group_id);
create index if not exists entries_country_code_idx on public.entries(country_code);
create index if not exists entries_state_region_idx on public.entries(state_region);
create index if not exists entries_city_idx on public.entries(city);
create index if not exists entries_lat_lng_idx on public.entries(lat, lng);

create table if not exists public.geocode_cache (
  normalized_query text primary key,
  lat double precision not null,
  lng double precision not null,
  country_code text not null,
  country_name text not null,
  state_region text,
  city text,
  fetched_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists groups_touch_updated_at on public.groups;
create trigger groups_touch_updated_at
before update on public.groups
for each row execute function public.touch_updated_at();

drop trigger if exists entries_touch_updated_at on public.entries;
create trigger entries_touch_updated_at
before update on public.entries
for each row execute function public.touch_updated_at();

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do nothing;
