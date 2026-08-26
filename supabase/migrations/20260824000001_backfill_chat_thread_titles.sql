-- Backfill the thread titles that were never derived.
--
-- `POST /api/chat` used to insert a thread with no title, leaving the column
-- default `'New chat'` standing, and deferred naming to a rename control that
-- phase 1 never shipped. Every row in the left rail therefore read `New chat`,
-- which makes a list of conversations useless as a list.
--
-- The route now derives a title from the opening question (`deriveThreadTitle`
-- in `apps/frontend/src/lib/chat-prompt.ts`). This does the same for the rows
-- written before it did.
--
-- ONE-TIME and NARROW. Only rows still holding the exact default are touched,
-- so a title a user set some other way is never overwritten, and re-running
-- this file is a no-op rather than a second rewrite.

update public.chat_thread as t
set title = case
              when char_length(m.text) > 60 then left(m.text, 60) || '…'
              else m.text
            end
from (
  -- The FIRST user message of each thread. `id` is the identity column the
  -- route inserts in turn order, so it is the replay order too.
  select distinct on (thread_id)
         thread_id,
         btrim(regexp_replace(content, '\s+', ' ', 'g')) as text
  from public.chat_message
  where role = 'user'
  order by thread_id, id
) as m
where m.thread_id = t.id
  and t.title = 'New chat'
  -- A thread whose first message was pure whitespace keeps the default rather
  -- than taking an empty title the `char_length(title) between 1 and 120`
  -- CHECK would reject.
  and m.text <> '';
