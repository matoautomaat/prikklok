-- Staff Shifts: database schema
-- Staff sign in with name + PIN. Every read and write goes through the
-- security-definer functions below; the tables themselves have RLS on and
-- no policies, so the browser can never touch them directly.
-- Error messages are in English; the web app translates them to Dutch.
-- Shifts and time entries are archived (cancelled_at / deleted_at), never
-- deleted, so payroll history stays intact.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

-- ---------------------------------------------------------------- tables

create table public.settings (
  id                int primary key default 1 check (id = 1),
  business_name     text not null default 'Ons team',
  drop_cutoff_hours int  not null default 24 check (drop_cutoff_hours between 0 and 336),
  grace_minutes     int  not null default 5  check (grace_minutes between 0 and 120),
  currency          text not null default '€',
  timezone          text, -- set from the manager's device; standard shifts use it
  wage_codes        jsonb not null default '{}'::jsonb -- Securex wage codes per contract type and kind of hours
);
insert into public.settings (id) values (1);

create table public.staff (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  pin_hash        text not null,
  role            text not null default 'staff' check (role in ('staff', 'manager')),
  hourly_rate     numeric(10, 2),
  active          boolean not null default true,
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  contract_type   text check (contract_type in ('student', 'flexi', 'extra', 'vast')),
  payroll_id      text check (length(payroll_id) <= 30), -- employee number at the social secretariat
  created_at      timestamptz not null default now()
);
create unique index staff_name_key on public.staff (lower(name));

create table public.sessions (
  token_hash text primary key,
  staff_id   uuid not null references public.staff (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_staff_idx on public.sessions (staff_id);

-- Standard shifts that repeat every week (e.g. Avond, Fri-Sun 17:30-22:30).
-- weekdays uses 0 = Sunday ... 6 = Saturday.
create table public.shift_templates (
  id          uuid primary key default gen_random_uuid(),
  label       text not null default '',
  weekdays    int[] not null check (cardinality(weekdays) > 0 and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]),
  start_time  time not null,
  end_time    time not null check (end_time <> start_time),
  people      int  not null default 1 check (people between 1 and 20),
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);
insert into public.shift_templates (label, weekdays, start_time, end_time, people) values
  ('Avond',  '{5,6,0}', '17:30', '22:30', 1),
  ('Middag', '{5,6}',   '11:30', '14:30', 1),
  ('Middag', '{0}',     '11:30', '15:00', 1);

create table public.shifts (
  id         uuid primary key default gen_random_uuid(),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  label      text not null default '',
  notes      text not null default '',
  staff_id   uuid references public.staff (id) on delete set null,
  cancelled_at timestamptz, -- removed shifts are archived, not deleted
  template_id   uuid references public.shift_templates (id), -- set when made from a standard shift
  template_day  date,
  template_slot int,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '24 hours')
);
create index shifts_starts_idx on public.shifts (starts_at);
create index shifts_staff_idx on public.shifts (staff_id, starts_at);
create index shifts_template_idx on public.shifts (template_id, template_day);
create unique index shifts_template_slot_key on public.shifts (template_id, template_day, template_slot)
  where template_id is not null;

create table public.time_entries (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.staff (id) on delete cascade,
  shift_id   uuid references public.shifts (id) on delete set null,
  clock_in   timestamptz not null,
  clock_out  timestamptz,
  note       text not null default '',
  edited     boolean not null default false,
  deleted_at timestamptz, -- removed entries are archived, not deleted
  created_at timestamptz not null default now(),
  check (clock_out is null or clock_out > clock_in)
);
create index time_entries_staff_idx on public.time_entries (staff_id, clock_in);
create index time_entries_in_idx on public.time_entries (clock_in);
create index time_entries_shift_idx on public.time_entries (shift_id);
create unique index time_entries_one_open on public.time_entries (staff_id) where clock_out is null;

-- A staff member's request to fix their own times. Nothing changes in
-- time_entries until a manager approves it.
create table public.time_edits (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid references public.time_entries (id) on delete cascade, -- null = add a missing entry
  staff_id     uuid not null references public.staff (id) on delete cascade,
  proposed_in  timestamptz not null,
  proposed_out timestamptz,
  reason       text not null,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  decided_by   uuid references public.staff (id) on delete set null,
  decided_at   timestamptz,
  created_at   timestamptz not null default now(),
  check (proposed_out is null or proposed_out > proposed_in)
);
create index time_edits_status_idx on public.time_edits (status);
create index time_edits_staff_idx on public.time_edits (staff_id);
create index time_edits_entry_idx on public.time_edits (entry_id);
create index time_edits_decided_by_idx on public.time_edits (decided_by);
create unique index time_edits_one_pending on public.time_edits (entry_id)
  where status = 'pending' and entry_id is not null;

alter table public.settings     enable row level security;
alter table public.shift_templates enable row level security;
alter table public.staff        enable row level security;
alter table public.sessions     enable row level security;
alter table public.shifts       enable row level security;
alter table public.time_entries enable row level security;
alter table public.time_edits   enable row level security;

revoke all on public.settings, public.shift_templates, public.staff, public.sessions, public.shifts,
              public.time_entries, public.time_edits
  from anon, authenticated;

-- --------------------------------------------------------------- helpers

create function app_private.hash_token(p_token text) returns text
language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex')
$$;

create function app_private.current_staff(p_token text) returns public.staff
language plpgsql stable set search_path = public, extensions as $$
declare v public.staff;
begin
  select st.* into v
    from public.sessions se
    join public.staff st on st.id = se.staff_id
   where se.token_hash = app_private.hash_token(coalesce(p_token, ''))
     and se.expires_at > now()
     and st.active;
  if not found then
    raise exception using message = 'Your sign-in has expired. Please sign in again.', errcode = '28000';
  end if;
  return v;
end $$;

create function app_private.current_manager(p_token text) returns public.staff
language plpgsql stable set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_staff(p_token);
  if v.role <> 'manager' then
    raise exception using message = 'Only managers can do that.', errcode = 'P0001';
  end if;
  return v;
end $$;

create function app_private.new_session(p_staff uuid) returns text
language plpgsql set search_path = public, extensions as $$
declare v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  delete from public.sessions where expires_at < now();
  insert into public.sessions (token_hash, staff_id, expires_at)
  values (app_private.hash_token(v_token), p_staff, now() + interval '30 days');
  return v_token;
end $$;

create function app_private.check_pin(p_pin text) returns void
language plpgsql set search_path = public as $$
begin
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then
    raise exception using message = 'PIN must be 4 to 8 digits.', errcode = 'P0001';
  end if;
end $$;

create function app_private.clean_name(p_name text) returns text
language plpgsql set search_path = public as $$
declare v text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if length(v) < 1 or length(v) > 60 then
    raise exception using message = 'Enter a name (up to 60 characters).', errcode = 'P0001';
  end if;
  return v;
end $$;

create function app_private.clean_text(p_text text, p_max int) returns text
language sql immutable set search_path = public as $$
  select left(btrim(coalesce(p_text, '')), p_max)
$$;

-- The shift a check-in at p_at belongs to: one of the person's shifts that
-- is running, or starts within the next two hours.
create function app_private.match_shift(p_staff uuid, p_at timestamptz) returns uuid
language sql stable set search_path = public as $$
  select id from public.shifts
   where staff_id = p_staff
     and cancelled_at is null
     and p_at >= starts_at - interval '2 hours'
     and p_at < ends_at
   order by abs(extract(epoch from (starts_at - p_at)))
   limit 1
$$;

create function app_private.check_entry_times(p_in timestamptz, p_out timestamptz) returns void
language plpgsql set search_path = public as $$
begin
  if p_in is null then
    raise exception using message = 'Enter a check-in time.', errcode = 'P0001';
  end if;
  if p_out is not null and p_out <= p_in then
    raise exception using message = 'Check-out must be after check-in.', errcode = 'P0001';
  end if;
  if p_out is not null and p_out - p_in > interval '24 hours' then
    raise exception using message = 'One entry can''t be longer than 24 hours.', errcode = 'P0001';
  end if;
end $$;

create function app_private.shift_json(p_shift_id uuid) returns json
language sql stable set search_path = public as $$
  select json_build_object('id', sh.id, 'starts_at', sh.starts_at, 'ends_at', sh.ends_at, 'label', sh.label)
    from public.shifts sh where sh.id = p_shift_id
$$;

-- Creates the shifts that standard shift patterns call for, from today up to
-- 92 days ahead, in the business's time zone. Safe to call repeatedly: a day
-- that already has its pattern shift (even one a manager removed) is skipped.
create function app_private.ensure_template_shifts(p_from timestamptz, p_to timestamptz) returns void
language plpgsql set search_path = public as $$
declare v_tz text; v_today date; d date; v_last date; t public.shift_templates; i int;
begin
  select timezone into v_tz from public.settings where id = 1;
  if v_tz is null or p_from is null or p_to is null
     or not exists (select 1 from public.shift_templates where archived_at is null) then
    return;
  end if;
  v_today := (now() at time zone v_tz)::date;
  d := greatest(v_today, (p_from at time zone v_tz)::date);
  v_last := least(v_today + 92, ((p_to - interval '1 second') at time zone v_tz)::date);
  while d <= v_last loop
    for t in select * from public.shift_templates
              where archived_at is null and extract(dow from d)::int = any(weekdays) loop
      for i in 1..t.people loop
        insert into public.shifts (starts_at, ends_at, label, template_id, template_day, template_slot)
        values ((d + t.start_time) at time zone v_tz,
                ((case when t.end_time > t.start_time then d else d + 1 end) + t.end_time) at time zone v_tz,
                t.label, t.id, d, i)
        on conflict (template_id, template_day, template_slot) where template_id is not null do nothing;
      end loop;
    end loop;
    d := d + 1;
  end loop;
end $$;

revoke all on all functions in schema app_private from public, anon, authenticated;

-- ------------------------------------------------------- sign in / setup

create function public.app_status() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'setup_needed', not exists (select 1 from public.staff),
    'business_name', (select business_name from public.settings where id = 1))
$$;

create function public.setup_first_manager(p_business_name text, p_name text, p_pin text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(814201);
  if exists (select 1 from public.staff) then
    raise exception using message = 'This app is already set up. Sign in instead.', errcode = 'P0001';
  end if;
  perform app_private.check_pin(p_pin);
  update public.settings
     set business_name = coalesce(nullif(app_private.clean_text(p_business_name, 80), ''), business_name)
   where id = 1;
  insert into public.staff (name, pin_hash, role)
  values (app_private.clean_name(p_name), extensions.crypt(p_pin, extensions.gen_salt('bf', 8)), 'manager')
  returning id into v_id;
  return json_build_object('ok', true, 'token', app_private.new_session(v_id));
end $$;

-- Returns {ok:false, error} instead of raising so failed attempts are saved.
create function public.login(p_name text, p_pin text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  v public.staff;
  v_key text := lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'));
begin
  select * into v from public.staff where lower(name) = v_key;
  if not found or not v.active then
    perform extensions.crypt(coalesce(p_pin, ''), extensions.gen_salt('bf', 8));
    return json_build_object('ok', false, 'error', 'That name and PIN don''t match.');
  end if;
  if v.locked_until is not null and v.locked_until > now() then
    return json_build_object('ok', false, 'error', format(
      'Too many wrong PINs. Try again in %s min, or ask your manager to reset your PIN.',
      ceil(extract(epoch from (v.locked_until - now())) / 60)::int));
  end if;
  if v.pin_hash = extensions.crypt(coalesce(p_pin, ''), v.pin_hash) then
    update public.staff set failed_attempts = 0, locked_until = null where id = v.id;
    return json_build_object('ok', true, 'token', app_private.new_session(v.id));
  end if;
  update public.staff
     set failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end,
         locked_until    = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' end
   where id = v.id;
  return json_build_object('ok', false, 'error', 'That name and PIN don''t match.');
end $$;

create function public.logout(p_token text) returns json
language sql security definer set search_path = public, extensions as $$
  delete from public.sessions where token_hash = app_private.hash_token(coalesce(p_token, ''));
  select json_build_object('ok', true)
$$;

create function public.get_me(p_token text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_staff(p_token);
  return json_build_object(
    'me', json_build_object('id', v.id, 'name', v.name, 'role', v.role),
    'settings', (select json_build_object(
        'business_name', business_name, 'drop_cutoff_hours', drop_cutoff_hours,
        'grace_minutes', grace_minutes, 'currency', currency, 'timezone', timezone,
        'wage_codes', case when v.role = 'manager' then wage_codes end)
      from public.settings where id = 1),
    'open_entry', (select json_build_object('id', e.id, 'clock_in', e.clock_in, 'shift', app_private.shift_json(e.shift_id))
      from public.time_entries e where e.staff_id = v.id and e.clock_out is null and e.deleted_at is null),
    'next_shifts', coalesce((select json_agg(json_build_object(
        'id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'label', s.label) order by s.starts_at)
      from (select * from public.shifts
             where staff_id = v.id and cancelled_at is null and ends_at > now()
             order by starts_at limit 3) s), '[]'::json),
    'pending_requests', case when v.role = 'manager'
      then (select count(*) from public.time_edits where status = 'pending') else 0 end,
    'server_time', now());
end $$;

-- -------------------------------------------------------- check in / out

create function public.clock_in(p_token text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; v_id uuid;
begin
  v := app_private.current_staff(p_token);
  insert into public.time_entries (staff_id, shift_id, clock_in)
  values (v.id, app_private.match_shift(v.id, now()), now())
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id);
exception when unique_violation then
  raise exception using message = 'You''re already checked in.', errcode = 'P0001';
end $$;

create function public.clock_out(p_token text, p_note text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; v_id uuid;
begin
  v := app_private.current_staff(p_token);
  update public.time_entries
     set clock_out = greatest(now(), clock_in + interval '1 second'),
         note = coalesce(nullif(app_private.clean_text(p_note, 300), ''), note)
   where staff_id = v.id and clock_out is null
  returning id into v_id;
  if v_id is null then
    raise exception using message = 'You''re not checked in.', errcode = 'P0001';
  end if;
  return json_build_object('ok', true, 'id', v_id);
end $$;

-- ---------------------------------------------------------------- shifts

create function public.list_shifts(p_token text, p_from timestamptz, p_to timestamptz) returns json
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_staff(p_token);
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '62 days' then
    raise exception using message = 'Pick a shorter date range.', errcode = 'P0001';
  end if;
  perform app_private.ensure_template_shifts(p_from, p_to);
  return coalesce((select json_agg(json_build_object(
      'id', sh.id, 'starts_at', sh.starts_at, 'ends_at', sh.ends_at, 'label', sh.label, 'notes', sh.notes,
      'staff_id', sh.staff_id, 'staff_name', st.name, 'mine', coalesce(sh.staff_id = v.id, false),
      'standard', sh.template_id is not null)
      order by sh.starts_at, st.name nulls last, sh.template_slot)
    from public.shifts sh left join public.staff st on st.id = sh.staff_id
   where sh.cancelled_at is null and sh.starts_at < p_to and sh.ends_at > p_from), '[]'::json);
end $$;

create function public.claim_shift(p_token text, p_shift_id uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; s public.shifts;
begin
  v := app_private.current_staff(p_token);
  select * into s from public.shifts where id = p_shift_id and cancelled_at is null for update;
  if not found then
    raise exception using message = 'That shift no longer exists.', errcode = 'P0001';
  end if;
  if s.staff_id = v.id then
    return json_build_object('ok', true);
  end if;
  if s.staff_id is not null then
    raise exception using message = 'Someone else already picked up this shift.', errcode = 'P0001';
  end if;
  if s.ends_at <= now() then
    raise exception using message = 'This shift is already over.', errcode = 'P0001';
  end if;
  if exists (select 1 from public.shifts
              where staff_id = v.id and cancelled_at is null
                and starts_at < s.ends_at and ends_at > s.starts_at) then
    raise exception using message = 'This overlaps a shift you already have.', errcode = 'P0001';
  end if;
  update public.shifts set staff_id = v.id where id = p_shift_id;
  return json_build_object('ok', true);
end $$;

create function public.release_shift(p_token text, p_shift_id uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; s public.shifts; v_cut int;
begin
  v := app_private.current_staff(p_token);
  select * into s from public.shifts
   where id = p_shift_id and staff_id = v.id and cancelled_at is null for update;
  if not found then
    raise exception using message = 'That isn''t one of your shifts.', errcode = 'P0001';
  end if;
  select drop_cutoff_hours into v_cut from public.settings where id = 1;
  if v.role <> 'manager' and s.starts_at < now() + make_interval(hours => v_cut) then
    raise exception using errcode = 'P0001', message = format(
      'Shifts can''t be dropped less than %s hours before they start. Ask your manager.', v_cut);
  end if;
  update public.shifts set staff_id = null where id = p_shift_id;
  return json_build_object('ok', true);
end $$;

-- ------------------------------------------------------------- own hours

create function public.my_hours(p_token text, p_from timestamptz, p_to timestamptz) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_staff(p_token);
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '62 days' then
    raise exception using message = 'Pick a shorter date range.', errcode = 'P0001';
  end if;
  return json_build_object(
    'hourly_rate', v.hourly_rate,
    'entries', coalesce((select json_agg(json_build_object(
        'id', e.id, 'clock_in', e.clock_in, 'clock_out', e.clock_out, 'note', e.note, 'edited', e.edited,
        'shift', app_private.shift_json(e.shift_id),
        'pending', (select json_build_object('id', d.id, 'proposed_in', d.proposed_in,
                      'proposed_out', d.proposed_out, 'reason', d.reason)
                      from public.time_edits d where d.entry_id = e.id and d.status = 'pending'))
        order by e.clock_in desc)
      from public.time_entries e
     where e.staff_id = v.id and e.deleted_at is null
       and e.clock_in >= p_from and e.clock_in < p_to), '[]'::json),
    'requests', coalesce((select json_agg(json_build_object(
        'id', d.id, 'entry_id', d.entry_id, 'proposed_in', d.proposed_in, 'proposed_out', d.proposed_out,
        'reason', d.reason, 'status', d.status, 'created_at', d.created_at, 'decided_at', d.decided_at)
        order by d.created_at desc)
      from public.time_edits d
     where d.staff_id = v.id
       and (d.status = 'pending'
            or (d.status in ('approved', 'rejected') and d.decided_at > now() - interval '14 days'))), '[]'::json));
end $$;

create function public.request_time_edit(p_token text, p_entry_id uuid, p_in timestamptz,
                                         p_out timestamptz, p_reason text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; e public.time_entries; v_reason text := app_private.clean_text(p_reason, 300);
begin
  v := app_private.current_staff(p_token);
  if length(v_reason) < 3 then
    raise exception using message = 'Add a short reason so your manager knows what happened.', errcode = 'P0001';
  end if;
  perform app_private.check_entry_times(p_in, p_out);
  if p_in > now() or p_out > now() + interval '1 minute' then
    raise exception using message = 'Times can''t be in the future.', errcode = 'P0001';
  end if;
  if p_entry_id is not null then
    select * into e from public.time_entries
     where id = p_entry_id and staff_id = v.id and deleted_at is null;
    if not found then
      raise exception using message = 'That time entry wasn''t found.', errcode = 'P0001';
    end if;
    if p_out is null and e.clock_out is not null then
      raise exception using message = 'Enter a check-out time.', errcode = 'P0001';
    end if;
    -- a newer request replaces an older pending one for the same entry
    update public.time_edits set status = 'withdrawn', decided_at = now()
     where entry_id = p_entry_id and status = 'pending';
  elsif p_out is null then
    raise exception using message = 'Enter a check-out time.', errcode = 'P0001';
  end if;
  insert into public.time_edits (entry_id, staff_id, proposed_in, proposed_out, reason)
  values (p_entry_id, v.id, p_in, p_out, v_reason);
  return json_build_object('ok', true);
end $$;

create function public.cancel_time_edit(p_token text, p_edit_id uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_staff(p_token);
  update public.time_edits set status = 'withdrawn', decided_at = now()
   where id = p_edit_id and staff_id = v.id and status = 'pending';
  return json_build_object('ok', true);
end $$;

-- --------------------------------------------------------------- manager

create function public.mgr_overview(p_token text, p_day_start timestamptz, p_day_end timestamptz) returns json
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  perform app_private.ensure_template_shifts(p_day_start, p_day_start + interval '8 days');
  return json_build_object(
    'working', coalesce((select json_agg(json_build_object(
        'entry_id', e.id, 'staff_id', st.id, 'name', st.name, 'clock_in', e.clock_in,
        'shift', app_private.shift_json(e.shift_id)) order by e.clock_in)
      from public.time_entries e join public.staff st on st.id = e.staff_id
     where e.clock_out is null and e.deleted_at is null), '[]'::json),
    'today', coalesce((select json_agg(json_build_object(
        'id', sh.id, 'starts_at', sh.starts_at, 'ends_at', sh.ends_at, 'label', sh.label,
        'staff_id', sh.staff_id, 'staff_name', st.name,
        'entry', (select json_build_object('clock_in', e.clock_in, 'clock_out', e.clock_out)
                    from public.time_entries e
                   where e.shift_id = sh.id and e.deleted_at is null order by e.clock_in limit 1))
        order by sh.starts_at, st.name nulls last)
      from public.shifts sh left join public.staff st on st.id = sh.staff_id
     where sh.cancelled_at is null and sh.starts_at < p_day_end and sh.ends_at > p_day_start), '[]'::json),
    'pending_requests', (select count(*) from public.time_edits where status = 'pending'),
    'open_shifts_week', (select count(*) from public.shifts
       where staff_id is null and cancelled_at is null
         and starts_at > now() and starts_at < now() + interval '7 days'));
end $$;

create function public.mgr_staff_list(p_token text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  return coalesce((select json_agg(json_build_object(
      'id', id, 'name', name, 'role', role, 'hourly_rate', hourly_rate, 'active', active,
      'locked', coalesce(locked_until > now(), false), 'created_at', created_at,
      'contract_type', contract_type, 'payroll_id', payroll_id)
      order by active desc, lower(name))
    from public.staff), '[]'::json);
end $$;

create function public.mgr_save_staff(p_token text, p_id uuid, p_name text, p_pin text, p_role text,
                                      p_hourly_rate numeric, p_active boolean) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; old public.staff; v_name text; v_id uuid; v_pin text := nullif(p_pin, '');
        v_active boolean := coalesce(p_active, true);
begin
  v := app_private.current_manager(p_token);
  v_name := app_private.clean_name(p_name);
  if p_role is null or p_role not in ('staff', 'manager') then
    raise exception using message = 'Pick a role.', errcode = 'P0001';
  end if;
  if p_hourly_rate is not null and (p_hourly_rate < 0 or p_hourly_rate > 10000) then
    raise exception using message = 'Check the hourly rate.', errcode = 'P0001';
  end if;
  if p_id is null then
    perform app_private.check_pin(v_pin);
    insert into public.staff (name, pin_hash, role, hourly_rate, active)
    values (v_name, extensions.crypt(v_pin, extensions.gen_salt('bf', 8)), p_role, p_hourly_rate, v_active)
    returning id into v_id;
  else
    select * into old from public.staff where id = p_id for update;
    if not found then
      raise exception using message = 'That person wasn''t found.', errcode = 'P0001';
    end if;
    if old.role = 'manager' and old.active and (p_role <> 'manager' or not v_active)
       and not exists (select 1 from public.staff where role = 'manager' and active and id <> p_id) then
      raise exception using message = 'The team needs at least one active manager.', errcode = 'P0001';
    end if;
    if v_pin is not null then
      perform app_private.check_pin(v_pin);
    end if;
    update public.staff
       set name = v_name, role = p_role, hourly_rate = p_hourly_rate, active = v_active,
           pin_hash        = case when v_pin is null then pin_hash else extensions.crypt(v_pin, extensions.gen_salt('bf', 8)) end,
           failed_attempts = case when v_pin is null then failed_attempts else 0 end,
           locked_until    = case when v_pin is null then locked_until end
     where id = p_id;
    v_id := p_id;
    if not v_active or v_pin is not null then
      delete from public.sessions
       where staff_id = p_id and token_hash <> app_private.hash_token(coalesce(p_token, ''));
    end if;
    if not v_active then
      update public.shifts set staff_id = null where staff_id = p_id and starts_at > now();
    end if;
  end if;
  return json_build_object('ok', true, 'id', v_id);
exception when unique_violation then
  raise exception using message = 'Someone on the team already has that name. Try adding a last initial.', errcode = 'P0001';
end $$;

create function public.mgr_save_settings(p_token text, p_business_name text, p_drop_cutoff_hours int,
                                         p_grace_minutes int, p_currency text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  if p_drop_cutoff_hours is null or p_drop_cutoff_hours not between 0 and 336 then
    raise exception using message = 'Drop cutoff must be between 0 and 336 hours.', errcode = 'P0001';
  end if;
  if p_grace_minutes is null or p_grace_minutes not between 0 and 120 then
    raise exception using message = 'Grace period must be between 0 and 120 minutes.', errcode = 'P0001';
  end if;
  update public.settings
     set business_name     = coalesce(nullif(app_private.clean_text(p_business_name, 80), ''), business_name),
         drop_cutoff_hours = p_drop_cutoff_hours,
         grace_minutes     = p_grace_minutes,
         currency          = app_private.clean_text(p_currency, 4)
   where id = 1;
  return json_build_object('ok', true);
end $$;

-- p_slots: [{starts_at, ends_at}, ...] - the browser expands "repeat weekly"
-- so local times stay right across daylight-saving changes.
create function public.mgr_create_shifts(p_token text, p_slots jsonb, p_label text, p_notes text,
                                         p_count int, p_staff_id uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; s jsonb; i int; n int := 0; v_start timestamptz; v_end timestamptz; v_who text;
begin
  v := app_private.current_manager(p_token);
  if jsonb_typeof(p_slots) is distinct from 'array' or jsonb_array_length(p_slots) not between 1 and 60 then
    raise exception using message = 'Add between 1 and 60 dates at a time.', errcode = 'P0001';
  end if;
  if p_count is null or p_count not between 1 and 20 then
    raise exception using message = 'Number of people must be between 1 and 20.', errcode = 'P0001';
  end if;
  if p_staff_id is not null then
    select name into v_who from public.staff where id = p_staff_id and active;
    if not found then
      raise exception using message = 'Pick an active team member.', errcode = 'P0001';
    end if;
  end if;
  for s in select * from jsonb_array_elements(p_slots) loop
    v_start := (s ->> 'starts_at')::timestamptz;
    v_end   := (s ->> 'ends_at')::timestamptz;
    if v_start is null or v_end is null or v_end <= v_start then
      raise exception using message = 'A shift must end after it starts.', errcode = 'P0001';
    end if;
    if v_end - v_start > interval '24 hours' then
      raise exception using message = 'A shift can be at most 24 hours long.', errcode = 'P0001';
    end if;
    if p_staff_id is not null and exists (select 1 from public.shifts
         where staff_id = p_staff_id and cancelled_at is null and starts_at < v_end and ends_at > v_start) then
      raise exception using errcode = 'P0001',
        message = format('%s already has a shift that overlaps one of these.', v_who);
    end if;
    for i in 1..p_count loop
      insert into public.shifts (starts_at, ends_at, label, notes, staff_id)
      values (v_start, v_end, app_private.clean_text(p_label, 60), app_private.clean_text(p_notes, 300),
              case when i = 1 then p_staff_id end);
      n := n + 1;
    end loop;
  end loop;
  return json_build_object('ok', true, 'created', n);
end $$;

create function public.mgr_update_shift(p_token text, p_id uuid, p_starts timestamptz, p_ends timestamptz,
                                        p_label text, p_notes text, p_staff_id uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; v_who text;
begin
  v := app_private.current_manager(p_token);
  if p_starts is null or p_ends is null or p_ends <= p_starts then
    raise exception using message = 'A shift must end after it starts.', errcode = 'P0001';
  end if;
  if p_ends - p_starts > interval '24 hours' then
    raise exception using message = 'A shift can be at most 24 hours long.', errcode = 'P0001';
  end if;
  if p_staff_id is not null then
    select name into v_who from public.staff where id = p_staff_id and active;
    if not found then
      raise exception using message = 'Pick an active team member.', errcode = 'P0001';
    end if;
    if exists (select 1 from public.shifts
                where staff_id = p_staff_id and id <> p_id and cancelled_at is null
                  and starts_at < p_ends and ends_at > p_starts) then
      raise exception using message = format('%s already has a shift that overlaps.', v_who), errcode = 'P0001';
    end if;
  end if;
  update public.shifts
     set starts_at = p_starts, ends_at = p_ends, label = app_private.clean_text(p_label, 60),
         notes = app_private.clean_text(p_notes, 300), staff_id = p_staff_id
   where id = p_id and cancelled_at is null;
  if not found then
    raise exception using message = 'That shift no longer exists.', errcode = 'P0001';
  end if;
  return json_build_object('ok', true);
end $$;

create function public.mgr_assign_shift(p_token text, p_id uuid, p_staff_id uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; s public.shifts;
begin
  v := app_private.current_manager(p_token);
  select * into s from public.shifts where id = p_id and cancelled_at is null;
  if not found then
    raise exception using message = 'That shift no longer exists.', errcode = 'P0001';
  end if;
  return public.mgr_update_shift(p_token, p_id, s.starts_at, s.ends_at, s.label, s.notes, p_staff_id);
end $$;

-- Removing a shift archives it, so past schedules stay on record.
create function public.mgr_remove_shift(p_token text, p_id uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  update public.shifts set cancelled_at = now() where id = p_id and cancelled_at is null;
  return json_build_object('ok', true);
end $$;

create function public.mgr_report(p_token text, p_from timestamptz, p_to timestamptz) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff; v_grace int;
begin
  v := app_private.current_manager(p_token);
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '370 days' then
    raise exception using message = 'Pick a date range up to a year long.', errcode = 'P0001';
  end if;
  select grace_minutes into v_grace from public.settings where id = 1;
  return (
    with ent as (
      select e.*, sh.starts_at as sh_start, sh.ends_at as sh_end, sh.label as sh_label
        from public.time_entries e left join public.shifts sh on sh.id = e.shift_id
       where e.deleted_at is null and e.clock_in >= p_from and e.clock_in < p_to
    ), sch as (
      select * from public.shifts
       where staff_id is not null and cancelled_at is null and starts_at >= p_from and starts_at < p_to
    ), missed as (
      select s.* from sch s
       where s.ends_at < now()
         and not exists (select 1 from public.time_entries e where e.shift_id = s.id and e.deleted_at is null)
    )
    select json_build_object(
      'grace_minutes', v_grace,
      'staff', coalesce((select json_agg(r order by lower(r.name)) from (
          select st.id, st.name, st.hourly_rate, st.active, st.contract_type, st.payroll_id,
            coalesce((select round(sum(extract(epoch from (e.clock_out - e.clock_in))) / 60, 1)
                        from ent e where e.staff_id = st.id and e.clock_out is not null), 0) as worked_minutes,
            (select count(*) from ent e where e.staff_id = st.id) as entries,
            (select count(*) from ent e where e.staff_id = st.id and e.clock_out is null) as open_entries,
            (select count(*) from ent e where e.staff_id = st.id and e.edited) as edited_entries,
            coalesce((select round(sum(extract(epoch from (s.ends_at - s.starts_at))) / 60, 1)
                        from sch s where s.staff_id = st.id), 0) as scheduled_minutes,
            (select count(*) from sch s where s.staff_id = st.id) as shifts,
            (select count(*) from ent e where e.staff_id = st.id and e.sh_start is not null
                and e.clock_in > e.sh_start + make_interval(mins => v_grace)) as late,
            (select count(*) from ent e where e.staff_id = st.id and e.sh_end is not null and e.clock_out is not null
                and e.clock_out < e.sh_end - make_interval(mins => v_grace)) as left_early,
            (select count(*) from missed m where m.staff_id = st.id) as missed,
            (select count(*) from public.time_edits d where d.staff_id = st.id and d.status = 'pending') as pending_requests
          from public.staff st
         where st.active
            or st.id in (select staff_id from ent)
            or st.id in (select staff_id from sch)
        ) r), '[]'::json),
      'entries', coalesce((select json_agg(json_build_object(
          'id', e.id, 'staff_id', e.staff_id, 'name', st.name, 'clock_in', e.clock_in, 'clock_out', e.clock_out,
          'note', e.note, 'edited', e.edited, 'shift_start', e.sh_start, 'shift_end', e.sh_end, 'label', e.sh_label,
          'pending', exists (select 1 from public.time_edits d where d.entry_id = e.id and d.status = 'pending'))
          order by e.clock_in)
        from ent e join public.staff st on st.id = e.staff_id), '[]'::json),
      'missed', coalesce((select json_agg(json_build_object(
          'id', m.id, 'staff_id', m.staff_id, 'name', st.name, 'starts_at', m.starts_at,
          'ends_at', m.ends_at, 'label', m.label) order by m.starts_at)
        from missed m join public.staff st on st.id = m.staff_id), '[]'::json))
  );
end $$;

create function public.mgr_requests(p_token text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  return json_build_object(
    'pending', coalesce((select json_agg(json_build_object(
        'id', d.id, 'staff_id', d.staff_id, 'name', st.name, 'entry_id', d.entry_id,
        'proposed_in', d.proposed_in, 'proposed_out', d.proposed_out, 'reason', d.reason,
        'created_at', d.created_at, 'current_in', e.clock_in, 'current_out', e.clock_out,
        'shift', app_private.shift_json(e.shift_id)) order by d.created_at)
      from public.time_edits d
      join public.staff st on st.id = d.staff_id
      left join public.time_entries e on e.id = d.entry_id
     where d.status = 'pending'), '[]'::json),
    'recent', coalesce((select json_agg(x order by x.decided_at desc) from (
        select d.id, st.name, d.entry_id, d.proposed_in, d.proposed_out, d.reason, d.status, d.decided_at,
               dm.name as decided_by
          from public.time_edits d
          join public.staff st on st.id = d.staff_id
          left join public.staff dm on dm.id = d.decided_by
         where d.status in ('approved', 'rejected')
         order by d.decided_at desc
         limit 15) x), '[]'::json));
end $$;

create function public.mgr_decide_request(p_token text, p_id uuid, p_approve boolean) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; d public.time_edits;
begin
  v := app_private.current_manager(p_token);
  select * into d from public.time_edits where id = p_id for update;
  if not found or d.status <> 'pending' then
    raise exception using message = 'This request was already handled.', errcode = 'P0001';
  end if;
  if p_approve then
    if d.entry_id is null then
      insert into public.time_entries (staff_id, shift_id, clock_in, clock_out, note, edited)
      values (d.staff_id, app_private.match_shift(d.staff_id, d.proposed_in), d.proposed_in, d.proposed_out,
              'Toegevoegd: ' || d.reason, true);
    else
      update public.time_entries
         set clock_in  = d.proposed_in,
             clock_out = coalesce(d.proposed_out, clock_out),
             edited    = true,
             note      = concat_ws(' · ', nullif(note, ''), 'Aangepast: ' || d.reason)
       where id = d.entry_id and deleted_at is null;
      if not found then
        raise exception using message = 'That time entry was removed.', errcode = 'P0001';
      end if;
    end if;
  end if;
  update public.time_edits
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = v.id, decided_at = now()
   where id = p_id;
  return json_build_object('ok', true);
exception
  when check_violation then
    raise exception using message = 'These times don''t fit the entry any more. Edit it directly in Monthly.', errcode = 'P0001';
  when unique_violation then
    raise exception using message = 'This person is checked in right now. Check them out first.', errcode = 'P0001';
end $$;

create function public.mgr_save_entry(p_token text, p_id uuid, p_staff_id uuid, p_in timestamptz,
                                      p_out timestamptz, p_note text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; v_id uuid;
begin
  v := app_private.current_manager(p_token);
  perform app_private.check_entry_times(p_in, p_out);
  if p_id is null then
    if not exists (select 1 from public.staff where id = p_staff_id) then
      raise exception using message = 'Pick a team member.', errcode = 'P0001';
    end if;
    insert into public.time_entries (staff_id, shift_id, clock_in, clock_out, note, edited)
    values (p_staff_id, app_private.match_shift(p_staff_id, p_in), p_in, p_out,
            app_private.clean_text(p_note, 300), true)
    returning id into v_id;
  else
    update public.time_entries
       set clock_in = p_in, clock_out = p_out, note = app_private.clean_text(p_note, 300), edited = true,
           shift_id = coalesce(shift_id, app_private.match_shift(staff_id, p_in))
     where id = p_id and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception using message = 'That time entry no longer exists.', errcode = 'P0001';
    end if;
  end if;
  return json_build_object('ok', true, 'id', v_id);
exception when unique_violation then
  raise exception using message = 'This person is already checked in. Close that entry first.', errcode = 'P0001';
end $$;

create function public.mgr_check_out(p_token text, p_entry_id uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  update public.time_entries
     set clock_out = greatest(now(), clock_in + interval '1 second'),
         note = concat_ws(' · ', nullif(note, ''), 'Uitgeklokt door ' || v.name),
         edited = true
   where id = p_entry_id and clock_out is null and deleted_at is null;
  return json_build_object('ok', true);
end $$;

-- Removing an entry archives it; it stops counting toward hours.
create function public.mgr_remove_entry(p_token text, p_id uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  update public.time_entries
     set deleted_at = now(),
         clock_out = coalesce(clock_out, greatest(now(), clock_in + interval '1 second'))
   where id = p_id and deleted_at is null;
  update public.time_edits set status = 'withdrawn', decided_at = now(), decided_by = v.id
   where entry_id = p_id and status = 'pending';
  return json_build_object('ok', true);
end $$;

-- ------------------------------------------------------- standard shifts

create function public.mgr_set_timezone(p_token text, p_tz text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  if p_tz is null or not exists (select 1 from pg_timezone_names where name = p_tz) then
    raise exception using message = 'That time zone isn''t recognised.', errcode = 'P0001';
  end if;
  update public.settings set timezone = p_tz where id = 1;
  return json_build_object('ok', true);
end $$;

create function public.mgr_templates(p_token text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  return coalesce((select json_agg(json_build_object(
      'id', id, 'label', label, 'weekdays', weekdays, 'start_time', to_char(start_time, 'HH24:MI'),
      'end_time', to_char(end_time, 'HH24:MI'), 'people', people) order by start_time, label)
    from public.shift_templates where archived_at is null), '[]'::json);
end $$;

create function public.mgr_save_template(p_token text, p_id uuid, p_label text, p_weekdays jsonb,
                                         p_start text, p_end text, p_people int) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; v_days int[]; v_start time; v_end time; v_id uuid;
begin
  v := app_private.current_manager(p_token);
  if jsonb_typeof(p_weekdays) is distinct from 'array' then
    raise exception using message = 'Pick at least one day.', errcode = 'P0001';
  end if;
  select array_agg(distinct x::int order by x::int) into v_days from jsonb_array_elements_text(p_weekdays) x;
  if v_days is null or not (v_days <@ array[0, 1, 2, 3, 4, 5, 6]) then
    raise exception using message = 'Pick at least one day.', errcode = 'P0001';
  end if;
  begin
    v_start := p_start::time;
    v_end := p_end::time;
  exception when others then
    raise exception using message = 'Enter start and end times like 17:30.', errcode = 'P0001';
  end;
  if v_start is null or v_end is null or v_start = v_end then
    raise exception using message = 'Start and end can''t be the same time.', errcode = 'P0001';
  end if;
  if p_people is null or p_people not between 1 and 20 then
    raise exception using message = 'People needed must be between 1 and 20.', errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.shift_templates (label, weekdays, start_time, end_time, people)
    values (app_private.clean_text(p_label, 60), v_days, v_start, v_end, p_people)
    returning id into v_id;
  else
    update public.shift_templates
       set label = app_private.clean_text(p_label, 60), weekdays = v_days,
           start_time = v_start, end_time = v_end, people = p_people
     where id = p_id and archived_at is null
    returning id into v_id;
    if v_id is null then
      raise exception using message = 'That standard shift no longer exists.', errcode = 'P0001';
    end if;
    -- Upcoming open shifts from this pattern are archived and detached so they
    -- get recreated with the new settings. Shifts someone already took stay as they are.
    update public.shifts set cancelled_at = now(), template_id = null
     where template_id = p_id and staff_id is null and cancelled_at is null and starts_at > now();
  end if;
  return json_build_object('ok', true, 'id', v_id);
end $$;

create function public.mgr_archive_template(p_token text, p_id uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  update public.shift_templates set archived_at = now() where id = p_id and archived_at is null;
  update public.shifts set cancelled_at = now()
   where template_id = p_id and staff_id is null and cancelled_at is null and starts_at > now();
  return json_build_object('ok', true);
end $$;

-- -------------------------------------------------- payslips and history

-- Monthly payslips (loonfiches) the manager uploads; each person downloads their own.
create table public.payslips (
  id           uuid primary key default gen_random_uuid(),
  staff_id     uuid not null references public.staff (id),
  month        date not null check (extract(day from month) = 1),
  file_name    text not null,
  content_type text not null,
  size_bytes   int  not null,
  data         bytea,
  uploaded_by  uuid references public.staff (id),
  created_at   timestamptz not null default now(),
  archived_at  timestamptz -- replaced or removed; the file itself is cleared
);
create unique index payslips_one_per_month on public.payslips (staff_id, month) where archived_at is null;
create index payslips_staff_idx on public.payslips (staff_id, month);
create index payslips_uploaded_by_idx on public.payslips (uploaded_by);
alter table public.payslips enable row level security;
revoke all on public.payslips from anon, authenticated;

create function public.mgr_upload_payslip(p_token text, p_staff_id uuid, p_month date, p_file_name text,
                                          p_content_type text, p_data text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; v_bytes bytea; v_id uuid;
begin
  v := app_private.current_manager(p_token);
  if not exists (select 1 from public.staff where id = p_staff_id) then
    raise exception using message = 'Pick a team member.', errcode = 'P0001';
  end if;
  if p_month is null then
    raise exception using message = 'Pick a month.', errcode = 'P0001';
  end if;
  if p_content_type is null or p_content_type not in ('application/pdf', 'image/png', 'image/jpeg') then
    raise exception using message = 'Upload a PDF, PNG or JPG file.', errcode = 'P0001';
  end if;
  begin
    v_bytes := decode(p_data, 'base64');
  exception when others then
    raise exception using message = 'That file couldn''t be read. Try again.', errcode = 'P0001';
  end;
  if v_bytes is null or length(v_bytes) = 0 then
    raise exception using message = 'That file is empty.', errcode = 'P0001';
  end if;
  if length(v_bytes) > 4 * 1024 * 1024 then
    raise exception using message = 'That file is over 4 MB. Save it as a smaller PDF and try again.', errcode = 'P0001';
  end if;
  update public.payslips set archived_at = now(), data = null
   where staff_id = p_staff_id and month = date_trunc('month', p_month)::date and archived_at is null;
  insert into public.payslips (staff_id, month, file_name, content_type, size_bytes, data, uploaded_by)
  values (p_staff_id, date_trunc('month', p_month)::date,
          coalesce(nullif(app_private.clean_text(p_file_name, 120), ''), 'payslip.pdf'),
          p_content_type, length(v_bytes), v_bytes, v.id)
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id);
end $$;

create function public.mgr_remove_payslip(p_token text, p_id uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  update public.payslips set archived_at = now(), data = null where id = p_id and archived_at is null;
  return json_build_object('ok', true);
end $$;

create function public.mgr_payslips(p_token text, p_month date) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  return coalesce((select json_agg(json_build_object(
      'id', p.id, 'staff_id', p.staff_id, 'file_name', p.file_name, 'size_bytes', p.size_bytes,
      'created_at', p.created_at))
    from public.payslips p
   where p.month = date_trunc('month', p_month)::date and p.archived_at is null), '[]'::json);
end $$;

create function public.my_payslips(p_token text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_staff(p_token);
  return coalesce((select json_agg(json_build_object(
      'id', p.id, 'month', p.month, 'file_name', p.file_name, 'size_bytes', p.size_bytes,
      'created_at', p.created_at) order by p.month desc)
    from public.payslips p where p.staff_id = v.id and p.archived_at is null), '[]'::json);
end $$;

-- The file itself: for the person it belongs to, or a manager.
create function public.get_payslip(p_token text, p_id uuid) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff; p public.payslips;
begin
  v := app_private.current_staff(p_token);
  select * into p from public.payslips
   where id = p_id and archived_at is null and (staff_id = v.id or v.role = 'manager');
  if not found then
    raise exception using message = 'That payslip isn''t available.', errcode = 'P0001';
  end if;
  return json_build_object('file_name', p.file_name, 'content_type', p.content_type,
                           'data', encode(p.data, 'base64'));
end $$;

-- Hours and estimated pay per month, for every month with check-ins.
create function public.mgr_month_totals(p_token text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff; v_tz text;
begin
  v := app_private.current_manager(p_token);
  select coalesce(timezone, 'UTC') into v_tz from public.settings where id = 1;
  return coalesce((select json_agg(json_build_object(
      'month', r.month, 'worked_minutes', r.worked_minutes, 'entries', r.entries, 'people', r.people,
      'pay', r.pay,
      'payslips', (select count(*) from public.payslips p where p.month = r.month and p.archived_at is null),
      'exported_at', (select max(x.created_at) from public.payroll_exports x where x.month = r.month),
      'exported_by', (select st.name from public.payroll_exports x join public.staff st on st.id = x.created_by
                       where x.month = r.month order by x.created_at desc limit 1))
      order by r.month desc)
    from (
      select date_trunc('month', e.clock_in at time zone v_tz)::date as month,
             round(sum(extract(epoch from (e.clock_out - e.clock_in))) / 60, 1) as worked_minutes,
             count(*) as entries,
             count(distinct e.staff_id) as people,
             round(sum(extract(epoch from (e.clock_out - e.clock_in)) / 3600 * coalesce(st.hourly_rate, 0)), 2) as pay
        from public.time_entries e join public.staff st on st.id = e.staff_id
       where e.deleted_at is null and e.clock_out is not null
       group by 1) r), '[]'::json);
end $$;

-- ------------------------------------------------------- Securex export

-- Each time the manager downloads the Securex file for a month.
create table public.payroll_exports (
  id         uuid primary key default gen_random_uuid(),
  month      date not null check (extract(day from month) = 1),
  rows       int not null,
  minutes    numeric(12, 1) not null,
  created_by uuid references public.staff (id),
  created_at timestamptz not null default now()
);
create index payroll_exports_month_idx on public.payroll_exports (month);
create index payroll_exports_created_by_idx on public.payroll_exports (created_by);
alter table public.payroll_exports enable row level security;
revoke all on public.payroll_exports from anon, authenticated;

create function public.mgr_save_staff_payroll(p_token text, p_id uuid, p_contract_type text, p_payroll_id text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; v_pid text := nullif(app_private.clean_text(p_payroll_id, 60), '');
begin
  v := app_private.current_manager(p_token);
  if p_contract_type is not null and p_contract_type not in ('student', 'flexi', 'extra', 'vast') then
    raise exception using message = 'Pick a valid contract type.', errcode = 'P0001';
  end if;
  if length(v_pid) > 30 then
    raise exception using message = 'The employee number can be at most 30 characters.', errcode = 'P0001';
  end if;
  update public.staff set contract_type = p_contract_type, payroll_id = v_pid where id = p_id;
  if not found then
    raise exception using message = 'That person wasn''t found.', errcode = 'P0001';
  end if;
  return json_build_object('ok', true);
end $$;

-- {student|flexi|extra|vast: {normal|sunday|holiday: code}}; unknown keys are ignored.
create function public.mgr_save_wage_codes(p_token text, p_codes jsonb) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; v_clean jsonb;
begin
  v := app_private.current_manager(p_token);
  if jsonb_typeof(p_codes) is distinct from 'object' then
    raise exception using message = 'Wage codes must be short texts.', errcode = 'P0001';
  end if;
  select jsonb_object_agg(t, (select jsonb_object_agg(c, app_private.clean_text(p_codes -> t ->> c, 20))
                                from unnest(array['normal', 'sunday', 'holiday']) c))
    into v_clean
    from unnest(array['student', 'flexi', 'extra', 'vast']) t;
  update public.settings set wage_codes = v_clean where id = 1;
  return json_build_object('ok', true);
end $$;

create function public.mgr_record_export(p_token text, p_month date, p_rows int, p_minutes numeric) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  if p_month is null then
    raise exception using message = 'Pick a month.', errcode = 'P0001';
  end if;
  insert into public.payroll_exports (month, rows, minutes, created_by)
  values (date_trunc('month', p_month)::date, greatest(coalesce(p_rows, 0), 0), greatest(coalesce(p_minutes, 0), 0), v.id);
  return json_build_object('ok', true);
end $$;
