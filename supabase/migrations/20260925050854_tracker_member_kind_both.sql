-- Staff can sign up as a handler, an editor, or both. Someone who does both
-- has a column on the staffing board and is offered first as an editor.
alter table public.tracker_member
  drop constraint tracker_member_kind_check,
  add constraint tracker_member_kind_check
    check (kind in ('handler', 'editor', 'both'));
