-- Work tracker: a person on the board is either a handler (runs accounts; one
-- column on the staffing board each) or an editor (cuts video; offered in
-- every card's Editor select, never a column). Every existing person is a
-- handler. Additive: the pre-kind loader never selects the column.

alter table public.tracker_member
  add column kind text not null default 'handler'
  check (kind in ('handler', 'editor'));
