-- Add agency branding/profile fields to the existing agencies table.
alter table agencies add column if not exists agency_name text;
alter table agencies add column if not exists slug text;
alter table agencies add column if not exists logo_url text;
alter table agencies add column if not exists brand_color text;
alter table agencies add column if not exists contact_email text;
alter table agencies add column if not exists user_id uuid;
alter table agencies add column if not exists created_at timestamptz default now();

update agencies
set agency_name = coalesce(agency_name, name),
    slug = coalesce(slug, lower(regexp_replace(coalesce(agency_name, name, 'agency'), '[^a-z0-9]+', '-', 'g'))),
    contact_email = coalesce(contact_email, email),
    user_id = coalesce(user_id, auth_user_id)
where agency_name is null
   or slug is null
   or contact_email is null
   or user_id is null;

create unique index if not exists agencies_slug_key on agencies(slug);
