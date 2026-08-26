-- Reply language — the language the coach writes ITS OWN prose in.
--
-- Deliberately NOT content_language. That column says what language the user's
-- VIDEOS are in, and it keeps governing the script text: hook, every spoken
-- line, call to action. This column governs the coach's explanation around the
-- script. A Chinese-language seller who wants the coaching in English can now
-- have both, which picking 'english' in content_language could never give —
-- that would hand a Chinese audience an English script.
--
-- NULLABLE ON PURPOSE, with no default. NULL means "follow content_language",
-- which is exactly what every existing row already did, so this migration
-- changes no behaviour anywhere until a user opens Settings and picks one.
-- A default would silently re-language every profile already on file.
--
-- Two values only, per owner request 2026-08-24. content_language's four
-- (chinese/english/malay/mixed) describe an audience; this describes a reader.

alter table public.user_profile
  add column reply_language text
    check (reply_language in ('english','chinese'));

comment on column public.user_profile.reply_language is
  'Language the coach writes its own prose in. NULL means follow content_language.';
