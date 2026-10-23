-- The link with MATO Info (the vending app), run once in MATO Info's Supabase
-- project (bjzufmvwldoltpitkrvx), not in Prikklok's. It only adds: a private
-- table with one row and one read-only function. Nothing that exists changes.
--
-- Prikklok's Edge Function mato calls public.prikklok_refill_visits with the
-- secret in Prikklok's app_private.mato; this side keeps only its sha256, and
-- the organisation whose refills it may read. The function answers with every
-- machine visit in a time range: which machine, when, how many items in and
-- out, by whom, and the round. The same grouping as refill_visits_all: a
-- round's stop is one visit; outside a round, changes to one machine by one
-- person within 30 minutes of each other are one visit.

create schema if not exists prikklok_private;
revoke all on schema prikklok_private from public, anon, authenticated;

create table if not exists prikklok_private.link (
  id          int primary key default 1 check (id = 1),
  org_id      uuid not null references public.organizations (id),
  secret_hash text not null, -- sha256 of the secret, hex
  created_at  timestamptz not null default now()
);
revoke all on prikklok_private.link from public, anon, authenticated;

create or replace function public.prikklok_refill_visits(p_secret text, p_from timestamptz, p_to timestamptz)
returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare l prikklok_private.link;
begin
  select * into l from prikklok_private.link where id = 1;
  if not found or p_secret is null or encode(extensions.digest(p_secret, 'sha256'), 'hex') <> l.secret_hash then
    raise exception using message = 'Not allowed.', errcode = '28000';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '40 days' then
    raise exception using message = 'Pick a shorter date range.', errcode = 'P0001';
  end if;
  return coalesce((
    with ev as (
      select se.machine_id, se.occurred_at, se.delta, se.type, se.refill_sheet_id, coalesce(se.filled_by, '') as filler,
             case when se.refill_sheet_id is null
                   and coalesce(lag(se.occurred_at) over w, '-infinity'::timestamptz) > se.occurred_at - interval '30 minutes'
                  then 0 else 1 end as starts
        from public.stock_events se
       where se.org_id = l.org_id and se.type in ('refill', 'correction') and se.delta <> 0
         and se.occurred_at >= p_from and se.occurred_at < p_to
      window w as (partition by se.machine_id, coalesce(se.filled_by, ''), se.refill_sheet_id is null order by se.occurred_at)
    ), numbered as (
      select ev.*, sum(starts) over (partition by machine_id, filler, refill_sheet_id is null order by occurred_at) as visit
        from ev
    ), visits as (
      select machine_id, filler, refill_sheet_id, min(occurred_at) as first_at, max(occurred_at) as last_at,
             sum(greatest(delta, 0))::int as added, sum(greatest(-delta, 0))::int as removed,
             bool_and(type = 'correction') as via_adjust, count(*)::int as events
        from numbered
       group by machine_id, filler, refill_sheet_id, coalesce(refill_sheet_id::text, 'v' || visit::text)
    )
    select json_agg(json_build_object(
        'machine_id', v.machine_id, 'machine', m.name, 'address', m.address, 'filler', nullif(v.filler, ''),
        'first_at', v.first_at, 'last_at', v.last_at, 'added', v.added, 'removed', v.removed,
        'via_adjust', v.via_adjust, 'events', v.events,
        'round_id', v.refill_sheet_id, 'round_no', rs.number, 'round_done', rs.completed_at is not null)
        order by v.first_at)
      from visits v
      join public.machines m on m.id = v.machine_id
      left join public.refill_sheets rs on rs.id = v.refill_sheet_id), '[]'::json);
end $$;
revoke all on function public.prikklok_refill_visits(text, timestamptz, timestamptz) from public, authenticated;
grant execute on function public.prikklok_refill_visits(text, timestamptz, timestamptz) to anon;

-- Then, with the secret Prikklok made (in Prikklok: select encode(extensions.digest(secret, 'sha256'), 'hex')
-- from app_private.mato), here:
--   insert into prikklok_private.link (org_id, secret_hash) values ('<Chens Garden organisation id>', '<that hash>');
