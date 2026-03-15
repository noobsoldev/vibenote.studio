create extension if not exists pgcrypto;

create table if not exists agencies (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  agency_name text,
  name text,
  email text,
  slug text unique,
  brand_color text,
  logo_url text,
  contact_email text,
  created_at timestamptz default now()
);

alter table agencies add column if not exists auth_user_id uuid;
alter table agencies add column if not exists agency_name text;
alter table agencies add column if not exists name text;
alter table agencies add column if not exists email text;
alter table agencies add column if not exists slug text;
alter table agencies add column if not exists brand_color text;
alter table agencies add column if not exists logo_url text;
alter table agencies add column if not exists contact_email text;
alter table agencies add column if not exists created_at timestamptz default now();

create unique index if not exists agencies_auth_user_id_key on agencies(auth_user_id);
create unique index if not exists agencies_slug_key on agencies(slug);
