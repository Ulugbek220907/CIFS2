-- 0016_acs_listening_only.sql
-- Academic Communication Skills now has a single section, Listening Preparation. Each of its 8 listenings can hold an
-- audio recording AND a list of arguments (shown under the player), so the separate Argumentation Preparation section
-- is removed. Anything an admin had entered there is carried over to the matching listening first (a blank name or an
-- empty arguments list is filled in; nothing already on a listening is overwritten).
-- Safe to run more than once. Requires 0014.

alter table public.acs_items drop constraint if exists acs_items_arguments_only_for_argumentation;
alter table public.acs_items drop constraint if exists acs_items_audio_only_for_listening;

update public.acs_items as listening
set arguments = argumentation.arguments
from public.acs_items as argumentation
where listening.kind = 'listening'
  and argumentation.kind = 'argumentation'
  and argumentation.position = listening.position
  and listening.arguments = '[]'::jsonb
  and argumentation.arguments <> '[]'::jsonb;

update public.acs_items as listening
set title = argumentation.title
from public.acs_items as argumentation
where listening.kind = 'listening'
  and argumentation.kind = 'argumentation'
  and argumentation.position = listening.position
  and listening.title = ''
  and argumentation.title <> '';

delete from public.acs_items where kind = 'argumentation';

alter table public.acs_items drop constraint if exists acs_items_kind_check;
alter table public.acs_items add constraint acs_items_kind_check check (kind = 'listening');

select pg_notify('pgrst', 'reload schema');
