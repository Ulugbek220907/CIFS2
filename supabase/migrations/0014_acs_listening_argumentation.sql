-- 0014_acs_listening_argumentation.sql
-- Academic Communication Skills (ACS) content: two sections (Listening Preparation, Argumentation Preparation),
-- each with 8 numbered items. An admin can rename each item, upload the audio of a listening, and write the
-- arguments (questions) of an argumentation item. Students read it; only admins write it.
-- Safe to run more than once. Requires 0010 (public.is_admin()).

create table if not exists public.acs_items (
  kind text not null check (kind in ('listening', 'argumentation')),
  position smallint not null check (position between 1 and 8),
  -- Optional name shown next to "Listening N". Blank means "just Listening N".
  title text not null default '' check (char_length(title) <= 80),
  -- Listening items only: where the audio lives in the public "acs-audio" storage bucket.
  audio_path text check (audio_path is null or audio_path ~ '^listening/[a-z0-9][a-z0-9._-]{0,119}$'),
  audio_name text check (audio_name is null or char_length(audio_name) <= 200),
  audio_size bigint check (audio_size is null or audio_size >= 0),
  -- Argumentation items only: the arguments / questions, in order, as an array of strings.
  arguments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (kind, position),
  constraint acs_items_audio_only_for_listening check (kind = 'listening' or audio_path is null),
  constraint acs_items_arguments_only_for_argumentation check (kind = 'argumentation' or arguments = '[]'::jsonb)
);

-- At most 40 arguments of at most 4000 characters each; every entry must be a string.
create or replace function public.acs_arguments_valid(items jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(items) = 'array'
    and jsonb_array_length(items) <= 40
    and not exists (
      select 1 from jsonb_array_elements(items) as element
      where jsonb_typeof(element) <> 'string' or char_length(element #>> '{}') > 4000
    );
$$;

alter table public.acs_items drop constraint if exists acs_items_arguments_valid;
alter table public.acs_items add constraint acs_items_arguments_valid check (public.acs_arguments_valid(arguments));

-- The 16 fixed slots exist from the start, so an admin only ever edits them.
insert into public.acs_items (kind, position)
select kinds.kind, slots.position
from (values ('listening'), ('argumentation')) as kinds(kind)
cross join generate_series(1, 8) as slots(position)
on conflict (kind, position) do nothing;

create or replace function public.acs_items_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists acs_items_touch on public.acs_items;
create trigger acs_items_touch
  before update on public.acs_items
  for each row execute function public.acs_items_touch_updated_at();

alter table public.acs_items enable row level security;

drop policy if exists "acs_items are readable by anyone" on public.acs_items;
create policy "acs_items are readable by anyone" on public.acs_items for select using (true);

drop policy if exists "acs_items are insertable by admins" on public.acs_items;
create policy "acs_items are insertable by admins" on public.acs_items for insert with check (public.is_admin());

drop policy if exists "acs_items are updatable by admins" on public.acs_items;
create policy "acs_items are updatable by admins" on public.acs_items for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "acs_items are deletable by admins" on public.acs_items;
create policy "acs_items are deletable by admins" on public.acs_items for delete using (public.is_admin());

-- Audio files: a public bucket (students stream straight from it), writable by admins only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'acs-audio',
  'acs-audio',
  true,
  52428800, -- 50 MB
  array[
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/wav', 'audio/x-wav',
    'audio/wave', 'audio/ogg', 'audio/opus', 'audio/webm', 'audio/flac', 'audio/x-flac'
  ]
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "acs audio is listable by admins" on storage.objects;
create policy "acs audio is listable by admins" on storage.objects
  for select to authenticated using (bucket_id = 'acs-audio' and public.is_admin());

drop policy if exists "acs audio is uploadable by admins" on storage.objects;
create policy "acs audio is uploadable by admins" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'acs-audio' and public.is_admin() and name ~ '^listening/[a-z0-9][a-z0-9._-]{0,119}$');

drop policy if exists "acs audio is replaceable by admins" on storage.objects;
create policy "acs audio is replaceable by admins" on storage.objects
  for update to authenticated
  using (bucket_id = 'acs-audio' and public.is_admin())
  with check (bucket_id = 'acs-audio' and public.is_admin());

drop policy if exists "acs audio is deletable by admins" on storage.objects;
create policy "acs audio is deletable by admins" on storage.objects
  for delete to authenticated using (bucket_id = 'acs-audio' and public.is_admin());

select pg_notify('pgrst', 'reload schema');
