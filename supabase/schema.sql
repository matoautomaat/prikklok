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
  wage_codes        jsonb not null default '{}'::jsonb, -- Securex wage codes per contract type and kind of hours
  require_shift     boolean not null default true, -- staff can only check in during one of their shifts
  clock_in_early_minutes int not null default 15 check (clock_in_early_minutes between 0 and 120),
  contract_info     jsonb not null default '{}'::jsonb, -- the employer's details on student contracts (Studentencontracten)
  -- the restaurant: drivers clock in and out within site_radius_m of it (Ritten)
  site_lat          double precision check (site_lat between -90 and 90),
  site_lng          double precision check (site_lng between -180 and 180),
  site_radius_m     int not null default 150 check (site_radius_m between 25 and 2000),
  -- also keep the driver's route by GPS (only while the app is open on his phone); off, the round comes from MATO Info
  track_route       boolean not null default false,
  -- the statuten that clock in; managers, drivers and people without a statuut always can
  clock_types       text[] not null default '{student}' check (clock_types <@ array['student', 'flexi', 'extra', 'vast']),
  -- who does not clock in earns daily_xp a day, from daily_xp_from on
  daily_xp          int not null default 50 check (daily_xp between 0 and 500),
  daily_xp_from     date not null default current_date,
  -- who staff contact to cancel a shift too close to its start (the day itself)
  contact_name      text check (length(contact_name) <= 60),
  contact_phone     text check (length(contact_phone) <= 30)
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
  created_at      timestamptz not null default now(),
  -- profile: the person fills it in, a manager can too; start_date only a manager
  avatar          jsonb, -- the cartoon the person built (web/avatar.js); null shows initials
  phone           text check (length(phone) <= 30),
  email           text check (length(email) <= 120),
  birth_date      date,
  national_id     text check (national_id ~ '^[0-9]{11}$'), -- rijksregisternummer, digits only
  iban            text check (length(iban) <= 34),
  street          text check (length(street) <= 120),
  postcode        text check (length(postcode) <= 10),
  city            text check (length(city) <= 80),
  emergency_name  text check (length(emergency_name) <= 80),
  emergency_phone text check (length(emergency_phone) <= 30),
  start_date      date, -- in service since
  xp_bonus        int not null default 0 check (xp_bonus between 0 and 100000), -- XP a manager gave, on top of the work
  -- a family account (the app calls its role 'viewer'): it only sees the month overview, never works shifts
  view_only       boolean not null default false,
  pay_method      text check (pay_method in ('cash', 'registered')), -- paid in cash, or registered on the payroll
  officient_id    int unique, -- the same person in Exact Officient, once linked
  -- details changed in the app that Officient doesn't have yet ('phone', 'email', 'birth_date', 'national_id',
  -- 'iban', 'address'): the nightly sync keeps the app's value until the manager sends them
  officient_pending text[] not null default '{}',
  contract_minutes jsonb, -- contract hours per weekday from Officient, eg {"monday": 240, ...}
  -- a driver (the app calls its role 'driver'): no schedule; clocks in and out at the
  -- restaurant, and while clocked in the app keeps the route (route_points)
  driver          boolean not null default false,
  mato_name       text check (length(mato_name) <= 60), -- the name a driver fills under in MATO Info; empty = the first name
  lang            text check (lang in ('nl', 'zh')), -- the app's language for this person; empty = what the phone chose
  -- a funny title colleagues see on the person's card: a key from app_private.fun_title_level
  -- (picked by the person) or the manager's own words; empty = one the app picks
  fun_title       text check (length(fun_title) <= 40),
  -- the manager hides the schedule from this person for now: no open shifts, only their own
  shifts_hidden   boolean not null default false,
  -- a family account shown in the ranking too, with its avatar and level
  in_ranking      boolean not null default false
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
  created_at  timestamptz not null default now(),
  staff_id    uuid references public.staff (id) -- a fixed worker's own hours; null = open for anyone
);
-- Closed on Tuesday. Weekdays: Middag 11:30-14:30 and Avond 17:30-21:30;
-- Friday to Sunday the evening runs until 22:30 and Sunday lunch until 15:00.
insert into public.shift_templates (label, weekdays, start_time, end_time, people) values
  ('Avond',  '{5,6,0}',     '17:30', '22:30', 1),
  ('Middag', '{1,3,4,5,6}', '11:30', '14:30', 1),
  ('Middag', '{0}',         '11:30', '15:00', 1),
  ('Avond',  '{1,3,4}',     '17:30', '21:30', 1);

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

-- Who gave a shift back, and why. The shift itself simply becomes open again.
create table public.shift_releases (
  id         uuid primary key default gen_random_uuid(),
  shift_id   uuid not null references public.shifts (id),
  staff_id   uuid not null references public.staff (id),
  reason     text not null,
  created_at timestamptz not null default now()
);
create index shift_releases_shift_idx on public.shift_releases (shift_id, created_at);
create index shift_releases_staff_idx on public.shift_releases (staff_id);
create index shift_releases_created_idx on public.shift_releases (created_at);
alter table public.shift_releases enable row level security;
revoke all on public.shift_releases from anon, authenticated;

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

-- The quiz of the week: a manager writes multiple-choice questions for a week
-- (Monday to Sunday). Staff answer each question once during that week and
-- earn the quiz's XP for every right answer. Quizzes and questions are
-- archived, never deleted; answers stay.
create table public.quizzes (
  id              uuid primary key default gen_random_uuid(),
  week_start      date not null check (extract(isodow from week_start) = 1), -- the Monday
  title           text check (length(title) <= 80),
  xp_per_question int not null default 10 check (xp_per_question between 1 and 100), -- per right answer
  created_by      uuid references public.staff (id) on delete set null,
  created_at      timestamptz not null default now(),
  archived_at     timestamptz
);
create unique index quizzes_week_key on public.quizzes (week_start) where archived_at is null;
create index quizzes_created_by_idx on public.quizzes (created_by);

create table public.quiz_questions (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     uuid not null references public.quizzes (id) on delete cascade,
  position    int not null,
  question    text not null check (length(question) between 1 and 300),
  options     text[] not null check (cardinality(options) between 2 and 6),
  correct     int not null, -- the right option, counted from 0
  explanation text check (length(explanation) <= 300), -- shown once answered
  archived_at timestamptz,
  check (correct >= 0 and correct < cardinality(options))
);
create index quiz_questions_quiz_idx on public.quiz_questions (quiz_id, position);

create table public.quiz_answers (
  question_id uuid not null references public.quiz_questions (id) on delete cascade,
  staff_id    uuid not null references public.staff (id) on delete cascade,
  choice      int not null check (choice >= 0), -- counted from 0, like correct
  answered_at timestamptz not null default now(),
  primary key (question_id, staff_id)
);
create index quiz_answers_staff_idx on public.quiz_answers (staff_id, answered_at);

alter table public.quizzes        enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_answers   enable row level security;
revoke all on public.quizzes, public.quiz_questions, public.quiz_answers from anon, authenticated;

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

-- Anyone signed in, family accounts included. Almost everything uses
-- current_staff or current_manager instead.
create function app_private.current_account(p_token text) returns public.staff
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

create function app_private.current_staff(p_token text) returns public.staff
language plpgsql stable set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_account(p_token);
  if v.view_only then
    raise exception using message = 'This account can only look at the overview.', errcode = 'P0001';
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

-- A fixed worker's own weekly shift, still on their name. It lets them clock
-- in, but it stays out of the calendars: those are for students and
-- part-timers. Once given back it is an ordinary open shift again.
create function app_private.is_fixed_shift(p_template uuid, p_staff uuid) returns boolean
language sql stable set search_path = public as $$
  select p_template is not null and p_staff is not null
     and exists (select 1 from public.shift_templates where id = p_template and staff_id = p_staff)
$$;

-- 'staff', 'manager', 'viewer' (a family account) or 'driver'
create function app_private.role_of(p public.staff) returns text
language sql immutable set search_path = public as $$
  select case when p.view_only then 'viewer' when p.driver then 'driver' else p.role end
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
-- A fixed worker's pattern puts the shift on their name, unless they already
-- work then or no longer work here.
create function app_private.ensure_template_shifts(p_from timestamptz, p_to timestamptz) returns void
language plpgsql set search_path = public as $$
declare v_tz text; v_today date; d date; v_last date; t public.shift_templates; i int;
        v_start timestamptz; v_end timestamptz;
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
    for t in select tp.* from public.shift_templates tp
               left join public.staff s on s.id = tp.staff_id
              where tp.archived_at is null and extract(dow from d)::int = any(tp.weekdays)
                and (tp.staff_id is null or (s.active and not s.view_only)) loop
      v_start := (d + t.start_time) at time zone v_tz;
      v_end := ((case when t.end_time > t.start_time then d else d + 1 end) + t.end_time) at time zone v_tz;
      if t.staff_id is not null then
        continue when exists (select 1 from public.shifts where template_id = t.id and template_day = d)
                   or exists (select 1 from public.shifts where staff_id = t.staff_id and cancelled_at is null
                                                            and starts_at < v_end and ends_at > v_start);
      end if;
      for i in 1..t.people loop
        insert into public.shifts (starts_at, ends_at, label, template_id, template_day, template_slot, staff_id)
        values (v_start, v_end, t.label, t.id, d, i, t.staff_id)
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
  v := app_private.current_account(p_token);
  return json_build_object(
    'me', json_build_object('id', v.id, 'name', v.name, 'role', app_private.role_of(v), 'avatar', v.avatar,
                            'xp', app_private.xp_json(v.id), 'can_clock', not v.view_only and app_private.can_clock(v),
                            'lang', v.lang,
                            -- who picks open shifts, and is reminded of them (see shift_alerts)
                            'picks', not v.view_only and not v.driver and v.role <> 'manager' and v.contract_type is distinct from 'vast'
                                     and not v.shifts_hidden,
                            'shifts', not v.shifts_hidden),
    'settings', (select json_build_object(
        'business_name', business_name, 'drop_cutoff_hours', drop_cutoff_hours,
        'grace_minutes', grace_minutes, 'currency', currency, 'timezone', timezone,
        'require_shift', require_shift, 'clock_in_early_minutes', clock_in_early_minutes,
        'wage_codes', case when v.role = 'manager' then wage_codes end,
        'site', case when v.driver or v.role = 'manager'
                then json_build_object('lat', site_lat, 'lng', site_lng, 'radius_m', site_radius_m) end,
        'has_drivers', v.role = 'manager' and exists (select 1 from public.staff where driver and active),
        'track_route', track_route, 'daily_xp', daily_xp,
        'clock_types', case when v.role = 'manager' then clock_types end)
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

-- Unless the rule is off, staff (not managers) can only check in during one of
-- their shifts, or a few minutes before it starts.
create function public.clock_in(p_token text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; v_id uuid; v_shift uuid; st public.settings; nx public.shifts;
begin
  v := app_private.current_staff(p_token);
  if v.driver then
    raise exception using message = 'Drivers clock in at the restaurant, with their location.', errcode = 'P0001';
  end if;
  if not app_private.can_clock(v) then
    raise exception using message = 'Clocking in is off for you. Ask your manager.', errcode = 'P0001';
  end if;
  if exists (select 1 from public.time_entries where staff_id = v.id and clock_out is null) then
    raise exception using message = 'You''re already checked in.', errcode = 'P0001';
  end if;
  select * into st from public.settings where id = 1;
  v_shift := app_private.match_shift(v.id, now());
  if st.require_shift and v.role <> 'manager' then
    select id into v_shift from public.shifts
     where staff_id = v.id and cancelled_at is null and ends_at > now()
       and starts_at <= now() + make_interval(mins => st.clock_in_early_minutes)
     order by starts_at limit 1;
    if v_shift is null then
      select * into nx from public.shifts
       where staff_id = v.id and cancelled_at is null and starts_at > now()
         and starts_at < now() + interval '18 hours'
       order by starts_at limit 1;
      if found then
        raise exception using errcode = 'P0001', message = format('Your shift starts at %s. You can check in from %s.',
          to_char(nx.starts_at at time zone coalesce(st.timezone, 'UTC'), 'HH24:MI'),
          to_char((nx.starts_at - make_interval(mins => st.clock_in_early_minutes)) at time zone coalesce(st.timezone, 'UTC'), 'HH24:MI'));
      end if;
      raise exception using message = 'You''re not on the schedule right now. Pick up a shift first, or ask your manager.', errcode = 'P0001';
    end if;
  end if;
  insert into public.time_entries (staff_id, shift_id, clock_in)
  values (v.id, v_shift, now())
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
  if v.driver then
    raise exception using message = 'Drivers clock out at the restaurant, with their location.', errcode = 'P0001';
  end if;
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
      'staff_id', sh.staff_id, 'staff_name', st.name, 'staff_avatar', st.avatar, 'mine', coalesce(sh.staff_id = v.id, false),
      'standard', sh.template_id is not null,
      'released', case when v.role = 'manager' then (
        select json_build_object('name', rs.name, 'reason', r.reason, 'at', r.created_at)
          from public.shift_releases r join public.staff rs on rs.id = r.staff_id
         where r.shift_id = sh.id order by r.created_at desc limit 1) end)
      order by sh.starts_at, st.name nulls last, sh.template_slot)
    from public.shifts sh left join public.staff st on st.id = sh.staff_id
   where sh.cancelled_at is null and sh.starts_at < p_to and sh.ends_at > p_from
     and not app_private.is_fixed_shift(sh.template_id, sh.staff_id)
     and (not v.shifts_hidden or sh.staff_id = v.id)), '[]'::json);
end $$;

-- What to remind someone who picks shifts of: open shifts for the rest of this
-- month (and next month from the 20th on) that don't clash with their own,
-- with who gave a shift back in the last 30 days. Not for fixed workers,
-- drivers or managers.
create function public.shift_alerts(p_token text) returns json
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v public.staff; v_tz text; v_to timestamptz;
begin
  v := app_private.current_staff(p_token);
  if v.role = 'manager' or v.driver or v.contract_type = 'vast' or v.shifts_hidden then
    return json_build_object('open', '[]'::json);
  end if;
  select coalesce(timezone, 'UTC') into v_tz from public.settings where id = 1;
  v_to := (date_trunc('month', now() at time zone v_tz)
           + case when extract(day from now() at time zone v_tz) >= 20 then interval '2 months' else interval '1 month' end)
          at time zone v_tz;
  perform app_private.ensure_template_shifts(now(), v_to);
  return json_build_object('open', coalesce((select json_agg(json_build_object(
      'id', sh.id, 'starts_at', sh.starts_at, 'ends_at', sh.ends_at, 'label', sh.label,
      'released', case when r.staff_id <> v.id and r.created_at > now() - interval '30 days'
                       then json_build_object('name', rs.name, 'at', r.created_at) end)
      order by sh.starts_at)
    from public.shifts sh
    left join lateral (select * from public.shift_releases x where x.shift_id = sh.id order by x.created_at desc limit 1) r on true
    left join public.staff rs on rs.id = r.staff_id
   where sh.staff_id is null and sh.cancelled_at is null and sh.starts_at > now() and sh.starts_at < v_to
     and not exists (select 1 from public.shifts m
                      where m.staff_id = v.id and m.cancelled_at is null
                        and m.starts_at < sh.ends_at and m.ends_at > sh.starts_at)), '[]'::json));
end $$;

create function public.claim_shift(p_token text, p_shift_id uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; s public.shifts;
begin
  v := app_private.current_staff(p_token);
  if v.shifts_hidden then
    raise exception using message = 'Picking shifts is off for you for now. Ask your manager.', errcode = 'P0001';
  end if;
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

-- Kept for app versions from before reasons: giving a shift back now goes
-- through give_back_shift.
create function public.release_shift(p_token text, p_shift_id uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform app_private.current_staff(p_token);
  raise exception using message = 'Say briefly why you give this shift back.', errcode = 'P0001';
end $$;

-- Gives one of your shifts back, with a reason the managers see.
create function public.give_back_shift(p_token text, p_shift_id uuid, p_reason text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; s public.shifts; v_cut int; v_reason text := app_private.clean_text(p_reason, 300);
begin
  v := app_private.current_staff(p_token);
  if length(v_reason) < 3 then
    raise exception using message = 'Say briefly why you give this shift back.', errcode = 'P0001';
  end if;
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
  insert into public.shift_releases (shift_id, staff_id, reason) values (s.id, v.id, v_reason);
  update public.shifts set staff_id = null where id = p_shift_id;
  return json_build_object('ok', true);
end $$;

-- Who to contact to cancel a shift that can't be given back in the app any
-- more (it starts today, or within the drop cutoff).
create function public.shift_contact(p_token text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform app_private.current_staff(p_token);
  return (select json_build_object('name', contact_name, 'phone', contact_phone) from public.settings where id = 1);
end $$;

create function public.mgr_save_contact(p_token text, p_name text, p_phone text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; v_phone text := nullif(app_private.clean_text(p_phone, 30), '');
begin
  v := app_private.current_manager(p_token);
  if v_phone is not null and v_phone !~ '^\+?[0-9][0-9 ./()-]{5,28}$' then
    raise exception using message = 'Check the phone number.', errcode = 'P0001';
  end if;
  update public.settings set contact_name = nullif(app_private.clean_text(p_name, 60), ''), contact_phone = v_phone where id = 1;
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
     where sh.cancelled_at is null and sh.starts_at < p_day_end and sh.ends_at > p_day_start
       and not app_private.is_fixed_shift(sh.template_id, sh.staff_id)), '[]'::json),
    'pending_requests', (select count(*) from public.time_edits where status = 'pending'),
    'open_shifts_week', (select count(*) from public.shifts
       where staff_id is null and cancelled_at is null
         and starts_at > now() and starts_at < now() + interval '7 days'),
    'released', coalesce((select json_agg(x order by x.at desc) from (
        select r.id, r.reason, r.created_at as at, st.id as staff_id, st.name, sh.starts_at, sh.ends_at, sh.label,
               tk.name as taken_by
          from public.shift_releases r
          join public.staff st on st.id = r.staff_id
          join public.shifts sh on sh.id = r.shift_id
          left join public.staff tk on tk.id = sh.staff_id
         where r.created_at > now() - interval '14 days' and sh.ends_at > now() and sh.cancelled_at is null
         order by r.created_at desc
         limit 10) x), '[]'::json));
end $$;

create function public.mgr_staff_list(p_token text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  return coalesce((select json_agg(json_build_object(
      'id', id, 'name', name, 'role', app_private.role_of(staff), 'hourly_rate', hourly_rate, 'active', active,
      'locked', coalesce(locked_until > now(), false), 'created_at', created_at,
      'contract_type', contract_type, 'payroll_id', payroll_id, 'pay_method', pay_method,
      'avatar', avatar, 'xp', app_private.xp_json(id), 'start_date', start_date, 'national_id', national_id,
      'missing', array_remove(array[
        case when national_id is null then 'national_id' end, case when iban is null then 'iban' end,
        case when birth_date is null then 'birth_date' end, case when street is null or city is null then 'address' end,
        case when phone is null then 'phone' end], null))
      order by active desc, lower(name))
    from public.staff), '[]'::json);
end $$;

create function public.mgr_save_staff(p_token text, p_id uuid, p_name text, p_pin text, p_role text,
                                      p_hourly_rate numeric, p_active boolean) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; old public.staff; v_name text; v_id uuid; v_pin text := nullif(p_pin, '');
        v_active boolean := coalesce(p_active, true); v_view boolean := p_role = 'viewer';
        v_driver boolean := p_role = 'driver';
        v_role text := case when p_role in ('viewer', 'driver') then 'staff' else p_role end;
begin
  v := app_private.current_manager(p_token);
  v_name := app_private.clean_name(p_name);
  if p_role is null or p_role not in ('staff', 'manager', 'viewer', 'driver') then
    raise exception using message = 'Pick a role.', errcode = 'P0001';
  end if;
  if p_hourly_rate is not null and (p_hourly_rate < 0 or p_hourly_rate > 10000) then
    raise exception using message = 'Check the hourly rate.', errcode = 'P0001';
  end if;
  if p_id is null then
    perform app_private.check_pin(v_pin);
    insert into public.staff (name, pin_hash, role, view_only, driver, hourly_rate, active)
    values (v_name, extensions.crypt(v_pin, extensions.gen_salt('bf', 8)), v_role, v_view, v_driver,
            case when v_view then null else p_hourly_rate end, v_active)
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
       set name = v_name, role = v_role, view_only = v_view, driver = v_driver,
           hourly_rate = case when v_view then null else p_hourly_rate end, active = v_active,
           pin_hash        = case when v_pin is null then pin_hash else extensions.crypt(v_pin, extensions.gen_salt('bf', 8)) end,
           failed_attempts = case when v_pin is null then failed_attempts else 0 end,
           locked_until    = case when v_pin is null then locked_until end
     where id = p_id;
    v_id := p_id;
    if not v_active or v_pin is not null or v_view <> old.view_only or v_driver <> old.driver then
      update public.sessions set expires_at = now()
       where staff_id = p_id and token_hash <> app_private.hash_token(coalesce(p_token, ''));
    end if;
    -- a family account or a driver works no shifts: their upcoming ones open up again
    if not v_active or v_view or v_driver then
      update public.shift_templates set archived_at = now() where staff_id = p_id and archived_at is null;
      update public.shifts set cancelled_at = now()
       where staff_id = p_id and starts_at > now() and cancelled_at is null
         and template_id in (select id from public.shift_templates where staff_id = p_id);
      update public.shifts set staff_id = null where staff_id = p_id and starts_at > now() and cancelled_at is null;
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
          select st.id, st.name, st.hourly_rate, st.active, st.contract_type, st.payroll_id, st.pay_method, st.driver,
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
         where (st.active and not st.view_only)
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
      'id', tp.id, 'label', tp.label, 'weekdays', tp.weekdays, 'start_time', to_char(tp.start_time, 'HH24:MI'),
      'end_time', to_char(tp.end_time, 'HH24:MI'), 'people', tp.people,
      'staff_id', tp.staff_id, 'staff_name', st.name, 'staff_avatar', st.avatar)
      order by st.name nulls first, tp.start_time, tp.label)
    from public.shift_templates tp left join public.staff st on st.id = tp.staff_id
   where tp.archived_at is null and (tp.staff_id is null or (st.active and not st.view_only))), '[]'::json);
end $$;

-- Kept for app versions from before fixed workers' hours.
create function public.mgr_save_template(p_token text, p_id uuid, p_label text, p_weekdays jsonb,
                                         p_start text, p_end text, p_people int) returns json
language plpgsql security definer set search_path = public, extensions as $$
begin
  return public.mgr_save_shift_template(p_token, p_id, p_label, p_weekdays, p_start, p_end, p_people,
    (select staff_id from public.shift_templates where id = p_id));
end $$;

-- A weekly pattern: open for anyone (p_staff_id null), or one fixed worker's own hours.
create function public.mgr_save_shift_template(p_token text, p_id uuid, p_label text, p_weekdays jsonb,
                                               p_start text, p_end text, p_people int, p_staff_id uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; v_days int[]; v_start time; v_end time; v_id uuid; v_old uuid;
        v_people int := case when p_staff_id is null then p_people else 1 end;
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
  if v_people is null or v_people not between 1 and 20 then
    raise exception using message = 'People needed must be between 1 and 20.', errcode = 'P0001';
  end if;
  if p_staff_id is not null and not exists (select 1 from public.staff where id = p_staff_id and active and not view_only) then
    raise exception using message = 'Pick an active team member.', errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.shift_templates (label, weekdays, start_time, end_time, people, staff_id)
    values (app_private.clean_text(p_label, 60), v_days, v_start, v_end, v_people, p_staff_id)
    returning id into v_id;
  else
    select staff_id into v_old from public.shift_templates where id = p_id and archived_at is null for update;
    update public.shift_templates
       set label = app_private.clean_text(p_label, 60), weekdays = v_days,
           start_time = v_start, end_time = v_end, people = v_people, staff_id = p_staff_id
     where id = p_id and archived_at is null
    returning id into v_id;
    if v_id is null then
      raise exception using message = 'That standard shift no longer exists.', errcode = 'P0001';
    end if;
    -- Upcoming shifts from this pattern that are still open, or still on the
    -- fixed worker's name, are archived and detached so they get recreated
    -- with the new settings. Shifts someone else took stay as they are.
    update public.shifts set cancelled_at = now(), template_id = null
     where template_id = p_id and cancelled_at is null and starts_at > now()
       and (staff_id is null or staff_id is not distinct from v_old);
  end if;
  return json_build_object('ok', true, 'id', v_id);
end $$;

create function public.mgr_archive_template(p_token text, p_id uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; v_staff uuid;
begin
  v := app_private.current_manager(p_token);
  update public.shift_templates set archived_at = now() where id = p_id and archived_at is null
  returning staff_id into v_staff;
  update public.shifts set cancelled_at = now()
   where template_id = p_id and cancelled_at is null and starts_at > now()
     and (staff_id is null or staff_id is not distinct from v_staff);
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
  archived_at  timestamptz, -- replaced or removed; the file itself is cleared
  gross_pay    numeric(10, 2), -- read from the payslip when it is uploaded
  net_pay      numeric(10, 2),
  source_ref   text, -- eg 'officient:45262' when fetched from Officient
  -- The month's figures, from all its calculations (payslip_calcs). The net is
  -- everything paid for the month, also on an earlier calculation.
  days_worked  numeric(6, 1),
  hours_worked numeric(7, 2),
  hours_leave  numeric(7, 2), -- paid but not worked: public holidays, guaranteed pay when ill
  ecocheques   numeric(10, 2),
  read_at      timestamptz -- when the file was read for those figures
);
create unique index payslips_source_ref_key on public.payslips (source_ref) where source_ref is not null;
create unique index payslips_one_per_month on public.payslips (staff_id, month) where archived_at is null;
create index payslips_staff_idx on public.payslips (staff_id, month);
create index payslips_uploaded_by_idx on public.payslips (uploaded_by);
alter table public.payslips enable row level security;
revoke all on public.payslips from anon, authenticated;

-- Every calculation read from a payslip PDF. A month can have more than one:
-- a recalculation that replaces an earlier one ("Overdracht vorige betaling"),
-- a correction afterwards (only the differences), or ecocheques. The month's
-- figures on the payslip come from all of them. A document that is not the
-- month's payslip itself keeps its file here.
create table public.payslip_calcs (
  id               uuid primary key default gen_random_uuid(),
  staff_id         uuid not null references public.staff (id),
  month            date not null check (extract(day from month) = 1),
  payslip_id       uuid references public.payslips (id), -- read from that payslip's own file
  source_ref       text, -- the Officient document, when it is not on the payslip
  file_name        text,
  size_bytes       int,
  data             bytea,
  kind             text not null, -- as on the payslip: 'Bezoldiging', 'Ecocheque'; 'Onbekend' when unreadable
  calculated_at    timestamp, -- "Laatste berekening"
  days_worked      numeric(6, 1),
  hours_worked     numeric(7, 2),
  hours_leave      numeric(7, 2),
  gross_pay        numeric(10, 2),
  net_paid         numeric(10, 2), -- "Netto te betalen" on this calculation
  previous_payment numeric(10, 2), -- paid on an earlier calculation, which this one replaces
  ecocheques       numeric(10, 2),
  created_at       timestamptz not null default now()
);
create unique index payslip_calcs_source_ref_key on public.payslip_calcs (source_ref) where source_ref is not null;
create unique index payslip_calcs_payslip_key on public.payslip_calcs (payslip_id) where payslip_id is not null;
create index payslip_calcs_staff_idx on public.payslip_calcs (staff_id, month);
alter table public.payslip_calcs enable row level security;
revoke all on public.payslip_calcs from anon, authenticated;

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
  v_bytes := app_private.check_file(p_content_type, p_data);
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
      'created_at', p.created_at, 'gross_pay', p.gross_pay, 'net_pay', p.net_pay))
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
      'created_at', p.created_at, 'gross_pay', p.gross_pay, 'net_pay', p.net_pay) order by p.month desc)
    from public.payslips p where p.staff_id = v.id and p.archived_at is null), '[]'::json);
end $$;

-- The file itself: for the person it belongs to, or a manager.
create function public.get_payslip(p_token text, p_id uuid) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff; p public.payslips; c public.payslip_calcs;
begin
  v := app_private.current_staff(p_token);
  select * into p from public.payslips
   where id = p_id and archived_at is null and (staff_id = v.id or v.role = 'manager');
  if found then
    return json_build_object('file_name', p.file_name, 'content_type', p.content_type,
                             'data', encode(p.data, 'base64'));
  end if;
  -- another document of a month: a recalculation, a correction, ecocheques
  select * into c from public.payslip_calcs
   where id = p_id and data is not null and (staff_id = v.id or v.role = 'manager');
  if not found then
    raise exception using message = 'That payslip isn''t available.', errcode = 'P0001';
  end if;
  return json_build_object('file_name', coalesce(c.file_name, 'loonbrief.pdf'), 'content_type', 'application/pdf',
                           'data', encode(c.data, 'base64'));
end $$;

-- Per month, newest first: what the payslip says (hours, gross, net and its
-- documents) and the hours clocked in the app.
create function app_private.pay_months_json(p_staff uuid) returns json
language sql stable set search_path = public as $$
  with clocked as (
    select date_trunc('month', e.clock_in at time zone (select coalesce(timezone, 'UTC') from public.settings where id = 1))::date as month,
           round(sum(extract(epoch from (e.clock_out - e.clock_in))) / 60) as minutes
      from public.time_entries e
     where e.staff_id = p_staff and e.deleted_at is null and e.clock_out is not null
     group by 1),
  slips as (select * from public.payslips where staff_id = p_staff and archived_at is null),
  months as (select month from clocked union select month from slips)
  select coalesce(json_agg(json_build_object(
      'month', m.month,
      'clocked_minutes', c.minutes,
      'payslip', case when s.id is not null then json_build_object(
          'id', s.id, 'file_name', s.file_name, 'size_bytes', s.size_bytes, 'read', s.read_at is not null,
          'days_worked', s.days_worked, 'hours_worked', s.hours_worked, 'hours_leave', s.hours_leave,
          'gross_pay', s.gross_pay, 'net_pay', s.net_pay, 'ecocheques', s.ecocheques) end,
      'documents', (select coalesce(json_agg(json_build_object(
                        'id', coalesce(pc.payslip_id, pc.id), 'kind', pc.kind, 'calculated_at', pc.calculated_at,
                        'replaces', coalesce(pc.previous_payment, 0) <> 0, 'payslip', pc.payslip_id is not null)
                      order by pc.calculated_at nulls first, pc.created_at), '[]'::json)
                      from public.payslip_calcs pc
                     where pc.staff_id = p_staff and pc.month = m.month and (pc.data is not null or pc.payslip_id = s.id)))
    order by m.month desc), '[]'::json)
    from months m left join clocked c on c.month = m.month left join slips s on s.month = m.month
$$;

create function public.my_pay_months(p_token text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_staff(p_token);
  return app_private.pay_months_json(v.id);
end $$;

create function public.mgr_pay_months(p_token text, p_staff_id uuid) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  return app_private.pay_months_json(p_staff_id);
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
                       where x.month = r.month order by x.created_at desc limit 1),
      'exported_kind', (select x.kind from public.payroll_exports x where x.month = r.month order by x.created_at desc limit 1))
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
  created_at timestamptz not null default now(),
  kind       text not null default 'file' check (kind in ('file', 'officient')) -- the file downloaded, or the hours written into Officient
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

-- ---------------------------------------------- profiles, contracts, levels

-- Employment contracts the manager uploads; the person can download their own.
create table public.contracts (
  id           uuid primary key default gen_random_uuid(),
  staff_id     uuid not null references public.staff (id),
  title        text not null,
  starts_on    date,
  ends_on      date, -- null = open-ended
  file_name    text not null,
  content_type text not null,
  size_bytes   int  not null,
  data         bytea,
  uploaded_by  uuid references public.staff (id),
  created_at   timestamptz not null default now(),
  archived_at  timestamptz, -- removed; the file itself is cleared
  -- a student contract the app wrote: what it was made from (kind 'student', function, hours, ...)
  details      jsonb,
  officient_contract_id  text,        -- its copy in the person's contracts in Officient
  officient_sent_at      timestamptz,
  signature_requested_at timestamptz, -- Officient e-mailed the student to sign it
  officient_hours_at     timestamptz, -- the planned hours went into Officient's calendar
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index contracts_staff_idx on public.contracts (staff_id);
create index contracts_uploaded_by_idx on public.contracts (uploaded_by);
alter table public.contracts enable row level security;
revoke all on public.contracts from anon, authenticated;

-- An uploaded PDF or picture, checked and decoded.
create function app_private.check_file(p_content_type text, p_data text) returns bytea
language plpgsql immutable set search_path = public as $$
declare v_bytes bytea;
begin
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
  return v_bytes;
end $$;

-- Belgian national register number (also BIS numbers): 9 digits and a mod-97 check,
-- with a 2 in front for people born from 2000 on.
create function app_private.valid_national_id(p text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(p ~ '^[0-9]{11}$' and (
    97 - (left(p, 9)::bigint % 97) = right(p, 2)::int
    or 97 - (('2' || left(p, 9))::bigint % 97) = right(p, 2)::int), false)
$$;

create function app_private.valid_iban(p text) returns boolean
language plpgsql immutable set search_path = public as $$
declare s text := substr(p, 5) || left(p, 4); r int := 0; c text;
begin
  for i in 1..length(s) loop
    c := substr(s, i, 1);
    r := ((r::text || case when c ~ '[0-9]' then c else (ascii(c) - 55)::text end)::bigint % 97)::int;
  end loop;
  return r = 1;
end $$;

-- Saves the keys present in p; keys left out keep their value. start_date only from a manager.
create function app_private.save_profile(p_staff uuid, p jsonb, p_manager boolean) returns void
language plpgsql set search_path = public as $$
declare
  v_email text := nullif(lower(app_private.clean_text(p ->> 'email', 120)), '');
  v_nid   text := nullif(regexp_replace(coalesce(p ->> 'national_id', ''), '\D', '', 'g'), '');
  v_iban  text := nullif(upper(regexp_replace(coalesce(p ->> 'iban', ''), '\s', '', 'g')), '');
  v_birth date; v_start date;
  old public.staff;
begin
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception using message = 'These details couldn''t be saved.', errcode = 'P0001';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception using message = 'Check the email address.', errcode = 'P0001';
  end if;
  if v_nid is not null and not app_private.valid_national_id(v_nid) then
    raise exception using message = 'Check the national register number (11 digits).', errcode = 'P0001';
  end if;
  if v_iban is not null and (v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{8,30}$' or not app_private.valid_iban(v_iban)) then
    raise exception using message = 'Check the IBAN account number.', errcode = 'P0001';
  end if;
  begin
    v_birth := nullif(p ->> 'birth_date', '')::date;
    v_start := nullif(p ->> 'start_date', '')::date;
  exception when others then
    raise exception using message = 'Check the dates.', errcode = 'P0001';
  end;
  if v_birth is not null and (v_birth < date '1900-01-01' or v_birth > current_date) then
    raise exception using message = 'Check the date of birth.', errcode = 'P0001';
  end if;
  select * into old from public.staff where id = p_staff;
  update public.staff set
    phone           = case when p ? 'phone' then nullif(app_private.clean_text(p ->> 'phone', 30), '') else phone end,
    email           = case when p ? 'email' then v_email else email end,
    birth_date      = case when p ? 'birth_date' then v_birth else birth_date end,
    national_id     = case when p ? 'national_id' then v_nid else national_id end,
    iban            = case when p ? 'iban' then v_iban else iban end,
    street          = case when p ? 'street' then nullif(app_private.clean_text(p ->> 'street', 120), '') else street end,
    postcode        = case when p ? 'postcode' then nullif(app_private.clean_text(p ->> 'postcode', 10), '') else postcode end,
    city            = case when p ? 'city' then nullif(app_private.clean_text(p ->> 'city', 80), '') else city end,
    emergency_name  = case when p ? 'emergency_name' then nullif(app_private.clean_text(p ->> 'emergency_name', 80), '') else emergency_name end,
    emergency_phone = case when p ? 'emergency_phone' then nullif(app_private.clean_text(p ->> 'emergency_phone', 30), '') else emergency_phone end,
    start_date      = case when p_manager and p ? 'start_date' then v_start else start_date end
   where id = p_staff;
  if not found then
    raise exception using message = 'That person wasn''t found.', errcode = 'P0001';
  end if;
  -- someone in Officient: what changed here waits for the manager to send it there
  update public.staff s
     set officient_pending = array(select distinct f from unnest(s.officient_pending || array[
           case when s.phone is distinct from old.phone then 'phone' end,
           case when s.email is distinct from old.email then 'email' end,
           case when s.birth_date is distinct from old.birth_date then 'birth_date' end,
           case when s.national_id is distinct from old.national_id then 'national_id' end,
           case when s.iban is distinct from old.iban then 'iban' end,
           case when row(s.street, s.postcode, s.city) is distinct from row(old.street, old.postcode, old.city) then 'address' end]) f
         where f is not null order by 1)
   where s.id = p_staff and s.officient_id is not null;
end $$;

create function app_private.profile_json(s public.staff) returns json
language sql stable set search_path = public as $$
  select json_build_object(
    'phone', s.phone, 'email', s.email, 'birth_date', s.birth_date, 'national_id', s.national_id,
    'iban', s.iban, 'street', s.street, 'postcode', s.postcode, 'city', s.city,
    'emergency_name', s.emergency_name, 'emergency_phone', s.emergency_phone, 'start_date', s.start_date)
$$;

create function app_private.contracts_json(p_staff uuid) returns json
language sql stable set search_path = public as $$
  select coalesce(json_agg(json_build_object(
      'id', c.id, 'title', c.title, 'starts_on', c.starts_on, 'ends_on', c.ends_on,
      'file_name', c.file_name, 'size_bytes', c.size_bytes, 'created_at', c.created_at)
      order by c.starts_on desc nulls last, c.created_at desc), '[]'::json)
    from public.contracts c where c.staff_id = p_staff and c.archived_at is null
$$;

-- Levels: level L needs 12.5 * (L - 1) * (L + 2) XP, so 50, 125, 225, 350, ... and 5225 for level 20.
create function app_private.level_for(p_xp int) returns int
language sql immutable set search_path = public as $$
  select greatest(1, floor((sqrt(9 + 4 * greatest(coalesce(p_xp, 0), 0) / 12.5) - 1) / 2))::int
$$;

-- Who clocks in (Team → Instellingen): managers, drivers, people without a
-- statuut, and the statuten ticked there (students by default).
create function app_private.can_clock(p public.staff) returns boolean
language sql stable set search_path = public as $$
  select p.role = 'manager' or p.driver or p.contract_type is null
      or exists (select 1 from public.settings where id = 1 and p.contract_type = any(clock_types))
$$;

-- Who does not clock in earns settings.daily_xp every day: from daily_xp_from,
-- or the day the account was made, or p_since if later, up to today.
create function app_private.daily_xp(p_staff uuid, p_since timestamptz) returns int
language sql stable set search_path = public as $$
  select coalesce((
    select greatest(0, (now() at time zone st.tz)::date
                       - greatest(st.daily_xp_from, (s.created_at at time zone st.tz)::date,
                                  coalesce((p_since at time zone st.tz)::date, st.daily_xp_from)) + 1) * st.daily_xp
      from public.staff s,
           (select coalesce(timezone, 'UTC') as tz, daily_xp, daily_xp_from from public.settings where id = 1) st
     where s.id = p_staff and s.active and not s.view_only and not app_private.can_clock(s)), 0)::int
$$;

-- XP from the quiz of the week: the quiz's XP for every right answer (since
-- p_since). Counted from the answers, so fixing a question's right answer
-- fixes everyone's XP too.
create function app_private.quiz_xp(p_staff uuid, p_since timestamptz) returns int
language sql stable set search_path = public as $$
  select coalesce(sum(z.xp_per_question), 0)::int
    from public.quiz_answers a
    join public.quiz_questions q on q.id = a.question_id and q.archived_at is null
    join public.quizzes z on z.id = q.quiz_id and z.archived_at is null
   where a.staff_id = p_staff and a.choice = q.correct
     and (p_since is null or a.answered_at >= p_since)
$$;

-- XP: 10 per hour worked, +5 for starting a shift on time, +5 for staying until
-- it ends; for who does not clock in, the daily XP; right answers in the quiz;
-- plus the manager's bonus.
create function app_private.xp_json(p_staff uuid) returns json
language sql stable set search_path = public as $$
  with g as (select make_interval(mins => grace_minutes) as grace from public.settings where id = 1),
  e as (
    select extract(epoch from (e.clock_out - e.clock_in)) / 60 as mins,
           coalesce(e.clock_in <= sh.starts_at + g.grace, false) as on_time,
           coalesce(e.clock_out >= sh.ends_at - g.grace, false) as stayed
      from public.time_entries e
      left join public.shifts sh on sh.id = e.shift_id
      cross join g
     where e.staff_id = p_staff and e.deleted_at is null and e.clock_out is not null),
  x as (
    select coalesce(floor(sum(mins) / 6), 0)::int
             + 5 * (count(*) filter (where on_time))::int + 5 * (count(*) filter (where stayed))::int as xp,
           coalesce(round(sum(mins)), 0)::int as minutes, count(*)::int as entries,
           (count(*) filter (where on_time))::int as on_time, (count(*) filter (where stayed))::int as stayed
      from e)
  select json_build_object('xp', x.xp + b.bonus + d.daily + d.quiz, 'level', app_private.level_for(x.xp + b.bonus + d.daily + d.quiz),
                           'minutes', minutes, 'entries', entries, 'on_time', on_time, 'stayed', stayed, 'bonus', b.bonus,
                           'daily', d.daily, 'quiz', d.quiz)
    from x cross join (select coalesce((select xp_bonus from public.staff where id = p_staff), 0) as bonus) b
    cross join (select app_private.daily_xp(p_staff, null) as daily, app_private.quiz_xp(p_staff, null) as quiz) d
$$;

-- Checks an avatar before it is saved. Items above the person's level are refused,
-- unless they already wear them. Keep the levels in sync with UNLOCKS in web/avatar.js.
create function app_private.clean_avatar(p_avatar jsonb, p_level int, p_current jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare k text; val jsonb; v_need int;
  v_locks constant jsonb := '{"hat": {"cap": 2, "bandana": 5, "chef": 8, "crown": 10, "bucket": 14, "guapi": 25, "hairpin": 25},
    "shoes": {"bunny": 3, "monster": 7, "dragon": 18, "gold": 19}, "outer": {"puffer": 4, "apron": 13, "leather": 17},
    "glasses": {"sun": 6, "heart": 16}, "top": {"chef": 8, "garden": 15, "tang": 25, "qipao": 25}, "hairColor": {"pink": 9, "blue": 9, "lilac": 9},
    "neck": {"headphones": 11, "chain": 12}, "aura": {"gold": 20}}';
begin
  if p_avatar is null or jsonb_typeof(p_avatar) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_avatar) <> 'object' or length(p_avatar::text) > 2000 then
    raise exception using message = 'That avatar couldn''t be saved.', errcode = 'P0001';
  end if;
  for k, val in select key, value from jsonb_each(p_avatar) loop
    if length(k) > 20 or jsonb_typeof(val) not in ('string', 'boolean', 'number') or length(val::text) > 24 then
      raise exception using message = 'That avatar couldn''t be saved.', errcode = 'P0001';
    end if;
    v_need := (v_locks -> k ->> (val #>> '{}'))::int;
    if v_need is not null and coalesce(p_level, 1) < v_need
       and (p_current is null or p_current -> k is distinct from val) then
      raise exception using errcode = 'P0001', message = format('That item unlocks at level %s.', v_need);
    end if;
  end loop;
  return p_avatar;
end $$;

revoke all on all functions in schema app_private from public, anon, authenticated;

create function public.my_profile(p_token text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_staff(p_token);
  return json_build_object(
    'profile', app_private.profile_json(v),
    'work', json_build_object('role', app_private.role_of(v), 'hourly_rate', v.hourly_rate, 'contract_type', v.contract_type,
                              'payroll_id', v.payroll_id, 'start_date', v.start_date, 'created_at', v.created_at,
                              'can_clock', app_private.can_clock(v), 'lang', v.lang),
    'avatar', v.avatar, 'title', v.fun_title,
    'xp', app_private.xp_json(v.id),
    'contracts', app_private.contracts_json(v.id));
end $$;

create function public.save_my_profile(p_token text, p_profile jsonb) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_staff(p_token);
  perform app_private.save_profile(v.id, p_profile, false);
  return json_build_object('ok', true);
end $$;

create function public.save_my_avatar(p_token text, p_avatar jsonb) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_staff(p_token);
  update public.staff
     set avatar = app_private.clean_avatar(p_avatar, (app_private.xp_json(v.id) ->> 'level')::int, v.avatar)
   where id = v.id;
  return json_build_object('ok', true);
end $$;

create function public.change_my_pin(p_token text, p_old text, p_new text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_staff(p_token);
  if v.pin_hash <> extensions.crypt(coalesce(p_old, ''), v.pin_hash) then
    raise exception using message = 'Your current PIN isn''t right.', errcode = 'P0001';
  end if;
  perform app_private.check_pin(p_new);
  update public.staff set pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 8)) where id = v.id;
  -- sign out the person's other devices
  update public.sessions set expires_at = now()
   where staff_id = v.id and token_hash <> app_private.hash_token(coalesce(p_token, ''));
  return json_build_object('ok', true);
end $$;

create function public.get_contract(p_token text, p_id uuid) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff; c public.contracts;
begin
  v := app_private.current_staff(p_token);
  select * into c from public.contracts
   where id = p_id and archived_at is null and (staff_id = v.id or v.role = 'manager');
  if not found then
    raise exception using message = 'That contract isn''t available.', errcode = 'P0001';
  end if;
  return json_build_object('file_name', c.file_name, 'content_type', c.content_type,
                           'data', encode(c.data, 'base64'));
end $$;

create function public.mgr_get_staff(p_token text, p_id uuid) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff; s public.staff;
begin
  v := app_private.current_manager(p_token);
  select * into s from public.staff where id = p_id;
  if not found then
    raise exception using message = 'That person wasn''t found.', errcode = 'P0001';
  end if;
  return json_build_object(
    'person', json_build_object('id', s.id, 'name', s.name, 'role', app_private.role_of(s), 'hourly_rate', s.hourly_rate,
      'active', s.active, 'locked', coalesce(s.locked_until > now(), false), 'contract_type', s.contract_type,
      'payroll_id', s.payroll_id, 'created_at', s.created_at, 'avatar', s.avatar, 'xp_bonus', s.xp_bonus,
      'pay_method', s.pay_method, 'officient_id', s.officient_id, 'contract_minutes', s.contract_minutes,
      'officient_pending', s.officient_pending,
      'officient_connected', (select o.refresh_token is not null from app_private.officient o where o.id = 1),
      'mato_name', app_private.mato_name(s), 'mato_name_own', s.mato_name,
      'lang', s.lang, 'can_clock', not s.view_only and app_private.can_clock(s), 'fun_title', s.fun_title,
      'shifts_hidden', s.shifts_hidden, 'in_ranking', s.in_ranking),
    'profile', app_private.profile_json(s),
    'xp', app_private.xp_json(s.id),
    'contracts', app_private.contracts_json(s.id),
    'payslips', coalesce((select json_agg(json_build_object(
        'id', p.id, 'month', p.month, 'file_name', p.file_name, 'size_bytes', p.size_bytes,
        'gross_pay', p.gross_pay, 'net_pay', p.net_pay, 'created_at', p.created_at) order by p.month desc)
      from public.payslips p where p.staff_id = s.id and p.archived_at is null), '[]'::json));
end $$;

create function public.mgr_save_profile(p_token text, p_id uuid, p_profile jsonb) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  perform app_private.save_profile(p_id, p_profile, true);
  return json_build_object('ok', true);
end $$;

create function public.mgr_upload_contract(p_token text, p_staff_id uuid, p_title text, p_starts_on date,
                                           p_ends_on date, p_file_name text, p_content_type text,
                                           p_data text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; v_bytes bytea; v_id uuid;
begin
  v := app_private.current_manager(p_token);
  if not exists (select 1 from public.staff where id = p_staff_id) then
    raise exception using message = 'Pick a team member.', errcode = 'P0001';
  end if;
  if p_ends_on < p_starts_on then
    raise exception using message = 'The end date must be after the start date.', errcode = 'P0001';
  end if;
  v_bytes := app_private.check_file(p_content_type, p_data);
  insert into public.contracts (staff_id, title, starts_on, ends_on, file_name, content_type, size_bytes, data, uploaded_by)
  values (p_staff_id, coalesce(nullif(app_private.clean_text(p_title, 80), ''), 'Contract'), p_starts_on, p_ends_on,
          coalesce(nullif(app_private.clean_text(p_file_name, 120), ''), 'contract.pdf'),
          p_content_type, length(v_bytes), v_bytes, v.id)
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id);
end $$;

create function public.mgr_remove_contract(p_token text, p_id uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  update public.contracts set archived_at = now(), data = null where id = p_id and archived_at is null;
  return json_build_object('ok', true);
end $$;

-- Gross and net pay as read from the payslip, so the person sees what was paid.
create function public.mgr_set_payslip_amounts(p_token text, p_id uuid, p_gross numeric, p_net numeric) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  if p_gross not between 0 and 100000 or p_net not between 0 and 100000 then
    raise exception using message = 'Check the amounts.', errcode = 'P0001';
  end if;
  update public.payslips set gross_pay = round(p_gross, 2), net_pay = round(p_net, 2)
   where id = p_id and archived_at is null;
  if not found then
    raise exception using message = 'That payslip isn''t available.', errcode = 'P0001';
  end if;
  return json_build_object('ok', true);
end $$;

create function public.mgr_save_clock_rules(p_token text, p_require_shift boolean, p_early_minutes int) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  if p_early_minutes is null or p_early_minutes not between 0 and 120 then
    raise exception using message = 'Early check-in must be between 0 and 120 minutes.', errcode = 'P0001';
  end if;
  update public.settings
     set require_shift = coalesce(p_require_shift, true), clock_in_early_minutes = p_early_minutes
   where id = 1;
  return json_build_object('ok', true);
end $$;

-- Which statuten clock in, and the XP a day for who does not.
create function public.mgr_save_clock_who(p_token text, p_types jsonb, p_daily_xp int) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; v_types text[];
begin
  v := app_private.current_manager(p_token);
  if jsonb_typeof(p_types) is distinct from 'array' then
    raise exception using message = 'Pick who clocks in.', errcode = 'P0001';
  end if;
  select coalesce(array_agg(distinct t order by t), '{}') into v_types from jsonb_array_elements_text(p_types) t;
  if not v_types <@ array['student', 'flexi', 'extra', 'vast'] then
    raise exception using message = 'Pick who clocks in.', errcode = 'P0001';
  end if;
  if p_daily_xp is null or p_daily_xp not between 0 and 500 then
    raise exception using message = 'The XP a day must be between 0 and 500.', errcode = 'P0001';
  end if;
  update public.settings set clock_types = v_types, daily_xp = p_daily_xp where id = 1;
  return json_build_object('ok', true);
end $$;

-- Hide the schedule from someone for now (or show it again).
create function public.mgr_set_shifts_hidden(p_token text, p_id uuid, p_hidden boolean) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  update public.staff set shifts_hidden = coalesce(p_hidden, false) where id = p_id;
  if not found then
    raise exception using message = 'That person wasn''t found.', errcode = 'P0001';
  end if;
  return json_build_object('ok', true);
end $$;

-- Show a family account in the ranking (or not).
create function public.mgr_set_in_ranking(p_token text, p_id uuid, p_on boolean) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  update public.staff set in_ranking = coalesce(p_on, false) where id = p_id;
  if not found then
    raise exception using message = 'That person wasn''t found.', errcode = 'P0001';
  end if;
  return json_build_object('ok', true);
end $$;

-- The app's language for yourself, or (a manager) for someone.
create function public.save_my_language(p_token text, p_lang text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_account(p_token);
  if p_lang is not null and p_lang not in ('nl', 'zh') then
    raise exception using message = 'Pick a language.', errcode = 'P0001';
  end if;
  update public.staff set lang = p_lang where id = v.id;
  return json_build_object('ok', true);
end $$;

create function public.mgr_set_language(p_token text, p_id uuid, p_lang text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  if p_lang is not null and p_lang not in ('nl', 'zh') then
    raise exception using message = 'Pick a language.', errcode = 'P0001';
  end if;
  update public.staff set lang = p_lang where id = p_id;
  if not found then
    raise exception using message = 'That person wasn''t found.', errcode = 'P0001';
  end if;
  return json_build_object('ok', true);
end $$;

-- --------------------------------------------------------------- ranking

-- XP earned since p_from, counted the same way as app_private.xp_json.
create function app_private.xp_since(p_staff uuid, p_from timestamptz) returns int
language sql stable set search_path = public as $$
  with g as (select make_interval(mins => grace_minutes) as grace from public.settings where id = 1)
  select (coalesce(floor(sum(extract(epoch from (e.clock_out - e.clock_in))) / 360), 0)
          + 5 * count(*) filter (where e.clock_in <= sh.starts_at + g.grace)
          + 5 * count(*) filter (where e.clock_out >= sh.ends_at - g.grace)
          + app_private.daily_xp(p_staff, p_from) + app_private.quiz_xp(p_staff, p_from))::int
    from public.time_entries e
    left join public.shifts sh on sh.id = e.shift_id
    cross join g
   where e.staff_id = p_staff and e.deleted_at is null and e.clock_out is not null and e.clock_in >= p_from
$$;

revoke all on all functions in schema app_private from public, anon, authenticated;

-- Everyone active with their level, for the Ranglijst. Only XP and level are
-- shared, not hours. month_xp counts from the 1st of this month.
create function public.leaderboard(p_token text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff; v_tz text; v_from timestamptz;
begin
  v := app_private.current_staff(p_token);
  select coalesce(timezone, 'UTC') into v_tz from public.settings where id = 1;
  v_from := date_trunc('month', now() at time zone v_tz) at time zone v_tz;
  return coalesce((select json_agg(json_build_object(
      'id', st.id, 'name', st.name, 'avatar', st.avatar, 'me', st.id = v.id, 'title', st.fun_title, 'family', st.view_only,
      'xp', (j.x ->> 'xp')::int, 'level', (j.x ->> 'level')::int,
      'month_xp', app_private.xp_since(st.id, v_from))
      order by lower(st.name))
    from public.staff st
    cross join lateral (select app_private.xp_json(st.id) as x) j
   where st.active and not st.driver and (not st.view_only or st.in_ranking)), '[]'::json);
end $$;

-- The funny titles staff pick from, and the level each needs. Keep in sync
-- with TITLES in web/app.js.
create function app_private.fun_title_level(p_key text) returns int
language sql immutable set search_path = public as $$
  select ('{"dumpling": 1, "wok": 1, "rice": 1, "tea": 1, "fortune": 1, "panda": 1, "spicy": 1, "clown": 1,
            "owl": 1, "bird": 1, "smile": 1, "noodle": 2, "dishes": 2, "karaoke": 3, "speed": 3,
            "chopsticks": 4, "springroll": 5, "boss": 6, "zen": 8, "dragon": 10, "emperor": 15, "legend": 20}'::jsonb
          ->> p_key)::int
$$;

revoke all on all functions in schema app_private from public, anon, authenticated;

-- A colleague's card: picture, level, title and since when they work here.
-- Nothing personal: no contract, wage or details.
create function public.colleague(p_token text, p_id uuid) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff; s public.staff; x json;
begin
  v := app_private.current_staff(p_token);
  select * into s from public.staff where id = p_id and active and (not view_only or in_ranking);
  if not found then
    raise exception using message = 'That person wasn''t found.', errcode = 'P0001';
  end if;
  x := app_private.xp_json(s.id);
  return json_build_object('id', s.id, 'name', s.name, 'avatar', s.avatar, 'role', app_private.role_of(s),
    'me', s.id = v.id, 'title', s.fun_title, 'xp', (x ->> 'xp')::int, 'level', (x ->> 'level')::int,
    'since', coalesce(s.start_date, (s.created_at at time zone coalesce((select timezone from public.settings where id = 1), 'UTC'))::date),
    'since_app', s.start_date is null);
end $$;

-- Your own funny title, from the list (some need a level); null clears it.
create function public.save_my_title(p_token text, p_key text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; v_need int;
begin
  v := app_private.current_staff(p_token);
  if p_key is not null then
    v_need := app_private.fun_title_level(p_key);
    if v_need is null then
      raise exception using message = 'Pick a title from the list.', errcode = 'P0001';
    end if;
    if (app_private.xp_json(v.id) ->> 'level')::int < v_need then
      raise exception using errcode = 'P0001', message = format('That title unlocks at level %s.', v_need);
    end if;
  end if;
  update public.staff set fun_title = p_key where id = v.id;
  return json_build_object('ok', true);
end $$;

-- A manager gives someone a title: one from the list or their own words.
create function public.mgr_set_title(p_token text, p_id uuid, p_title text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  update public.staff set fun_title = nullif(app_private.clean_text(p_title, 40), '') where id = p_id;
  if not found then
    raise exception using message = 'That person wasn''t found.', errcode = 'P0001';
  end if;
  return json_build_object('ok', true);
end $$;

-- Bonus XP a manager gives someone, on top of what their work earns. It counts
-- for the level and the all-time ranking, never for hours or pay.
create function public.mgr_set_xp_bonus(p_token text, p_id uuid, p_bonus int) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  if p_bonus is null or p_bonus not between 0 and 100000 then
    raise exception using message = 'Bonus XP must be between 0 and 100000.', errcode = 'P0001';
  end if;
  update public.staff set xp_bonus = p_bonus where id = p_id;
  if not found then
    raise exception using message = 'That person wasn''t found.', errcode = 'P0001';
  end if;
  return json_build_object('ok', true);
end $$;

-- ------------------------------------------------------- family account

-- How someone is paid: 'cash', 'registered', or null when not filled in.
create function public.mgr_set_pay_method(p_token text, p_id uuid, p_method text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  if p_method is not null and p_method not in ('cash', 'registered') then
    raise exception using message = 'Pick cash or registered.', errcode = 'P0001';
  end if;
  update public.staff set pay_method = p_method where id = p_id;
  if not found then
    raise exception using message = 'That person wasn''t found.', errcode = 'P0001';
  end if;
  return json_build_object('ok', true);
end $$;

-- One month for a family account (managers can look too): the calendar's
-- shifts with who works them, and per person the age, fixed hours, hours
-- worked, hourly rate and how they're paid. Family accounts are left out.
create function public.family_overview(p_token text, p_from timestamptz, p_to timestamptz) returns json
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_account(p_token);
  if not v.view_only and v.role <> 'manager' then
    raise exception using message = 'Only managers can do that.', errcode = 'P0001';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '62 days' then
    raise exception using message = 'Pick a shorter date range.', errcode = 'P0001';
  end if;
  perform app_private.ensure_template_shifts(p_from, p_to);
  return json_build_object(
    'shifts', coalesce((select json_agg(json_build_object(
        'id', sh.id, 'starts_at', sh.starts_at, 'ends_at', sh.ends_at, 'label', sh.label,
        'staff_id', sh.staff_id, 'staff_name', st.name)
        order by sh.starts_at, st.name nulls last, sh.template_slot)
      from public.shifts sh left join public.staff st on st.id = sh.staff_id
     where sh.cancelled_at is null and sh.starts_at < p_to and sh.ends_at > p_from
       and not app_private.is_fixed_shift(sh.template_id, sh.staff_id)), '[]'::json),
    'people', coalesce((select json_agg(r order by lower(r.name)) from (
        select st.id, st.name, st.active, app_private.role_of(st) as role, st.hourly_rate, st.pay_method, st.phone, st.avatar,
               extract(year from age(current_date, st.birth_date))::int as age,
               (select json_agg(json_build_object('label', tp.label, 'weekdays', tp.weekdays,
                         'start_time', to_char(tp.start_time, 'HH24:MI'), 'end_time', to_char(tp.end_time, 'HH24:MI'))
                         order by tp.start_time)
                  from public.shift_templates tp where tp.staff_id = st.id and tp.archived_at is null) as fixed,
               coalesce(w.minutes, 0) as worked_minutes, coalesce(w.times, 0) as times,
               (select count(*) from public.shifts s
                 where s.staff_id = st.id and s.cancelled_at is null
                   and s.starts_at >= p_from and s.starts_at < p_to) as shifts
          from public.staff st
          left join lateral (
            select round(sum(extract(epoch from (e.clock_out - e.clock_in))) / 60)::int as minutes, count(*) as times
              from public.time_entries e
             where e.staff_id = st.id and e.deleted_at is null and e.clock_out is not null
               and e.clock_in >= p_from and e.clock_in < p_to) w on true
         where not st.view_only and (st.active or coalesce(w.times, 0) > 0)) r), '[]'::json));
end $$;

-- ------------------------------------------------------- Exact Officient

-- The link with Exact Officient, the HR platform behind Securex: the
-- manager's own API app and the long-lived refresh token. Only the
-- 'officient' Edge Function reads the secrets; the app never gets them back.
create table app_private.officient (
  id              int primary key default 1 check (id = 1),
  client_id       text,
  client_secret   text,
  refresh_token   text,
  oauth_state     text,
  oauth_state_at  timestamptz,
  cron_secret     text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  connected_at    timestamptz,
  sync_started_at timestamptz,
  last_sync_at    timestamptz,
  last_report     jsonb,
  last_error      text,
  host            text -- the account's own address, eg 'xinsen.officient.io'; sign-in happens there
);
insert into app_private.officient (id) values (1);
revoke all on app_private.officient from public, anon, authenticated;

create function public.mgr_officient_status(p_token text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff; o app_private.officient;
begin
  v := app_private.current_manager(p_token);
  select * into o from app_private.officient where id = 1;
  return json_build_object(
    'configured', o.client_id is not null and o.client_secret is not null, 'client_id', o.client_id,
    'connected', o.refresh_token is not null, 'connected_at', o.connected_at,
    'syncing', coalesce(o.sync_started_at > now() - interval '5 minutes', false),
    'last_sync_at', o.last_sync_at, 'last_report', o.last_report, 'last_error', o.last_error,
    'host', o.host, 'linked', (select count(*) from public.staff where officient_id is not null),
    'pending', coalesce((select json_agg(json_build_object('id', st.id, 'name', st.name, 'fields', st.officient_pending) order by lower(st.name))
                           from public.staff st where st.officient_id is not null and st.officient_pending <> '{}'), '[]'::json),
    'unlinked', coalesce((select json_agg(json_build_object('id', st.id, 'name', st.name) order by lower(st.name))
                            from public.staff st where st.officient_id is null and st.active and not st.view_only), '[]'::json));
end $$;

-- The client ID and secret of the app the manager made under Developers in Officient.
create function public.mgr_officient_save_app(p_token text, p_client_id text, p_client_secret text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; v_id text := btrim(coalesce(p_client_id, '')); v_secret text := btrim(coalesce(p_client_secret, ''));
begin
  v := app_private.current_manager(p_token);
  if v_id = '' or v_secret = '' or length(v_id) > 200 or length(v_secret) > 200 then
    raise exception using message = 'Fill in the client ID and client secret from Officient.', errcode = 'P0001';
  end if;
  update app_private.officient
     set client_id = v_id, client_secret = v_secret, refresh_token = null, connected_at = null, last_error = null
   where id = 1;
  return json_build_object('ok', true);
end $$;

-- Starts signing in at Officient: the app sends the manager there with this state.
create function public.mgr_officient_authorize(p_token text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; o app_private.officient; v_state text := encode(extensions.gen_random_bytes(16), 'hex');
begin
  v := app_private.current_manager(p_token);
  select * into o from app_private.officient where id = 1 for update;
  if o.client_id is null or o.client_secret is null then
    raise exception using message = 'Fill in the client ID and client secret from Officient first.', errcode = 'P0001';
  end if;
  update app_private.officient set oauth_state = v_state, oauth_state_at = now() where id = 1;
  return json_build_object('client_id', o.client_id, 'state', v_state, 'host', coalesce(o.host, 'app.officient.io'));
end $$;

-- The account's own Officient address. A pasted link works too
-- ("https://xinsen.officient.io/dashboard"); only *.officient.io is taken.
create function public.mgr_officient_save_host(p_token text, p_host text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
  v_host text := nullif(split_part(regexp_replace(lower(btrim(coalesce(p_host, ''))), '^[a-z]+://', ''), '/', 1), '');
begin
  v := app_private.current_manager(p_token);
  if v_host is not null and v_host !~ '^[a-z0-9][a-z0-9-]*\.officient\.io$' then
    raise exception using message = 'Fill in your Officient address, like yourcompany.officient.io.', errcode = 'P0001';
  end if;
  update app_private.officient set host = v_host where id = 1;
  return json_build_object('ok', true, 'host', v_host);
end $$;

create function public.mgr_officient_disconnect(p_token text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  update app_private.officient
     set refresh_token = null, connected_at = null, oauth_state = null, sync_started_at = null, last_error = null
   where id = 1;
  return json_build_object('ok', true);
end $$;

-- The rest is for the Edge Function, which connects as the database owner.

-- Who may read Officient now: a manager (from the app), or the nightly job
-- with its secret. Returns what the function needs to talk to Officient,
-- or skip when the nightly job finds nothing connected.
create function app_private.officient_begin(p_token text, p_cron text, p_state text) returns json
language plpgsql set search_path = public, extensions as $$
declare o app_private.officient;
begin
  select * into o from app_private.officient where id = 1 for update;
  if p_cron is not null then
    if p_cron is distinct from o.cron_secret then
      raise exception using message = 'Not allowed.', errcode = '28000';
    end if;
    if o.refresh_token is null or o.client_secret is null then
      return json_build_object('skip', true);
    end if;
  else
    perform app_private.current_manager(p_token);
  end if;
  if o.client_id is null or o.client_secret is null then
    raise exception using message = 'Fill in the client ID and client secret from Officient first.', errcode = 'P0001';
  end if;
  if p_state is not null then
    if o.oauth_state is null or o.oauth_state <> p_state or o.oauth_state_at < now() - interval '30 minutes' then
      raise exception using message = 'The Officient sign-in took too long or came from elsewhere. Connect again.', errcode = 'P0001';
    end if;
    update app_private.officient set oauth_state = null where id = 1;
  elsif o.refresh_token is null then
    raise exception using message = 'Officient isn''t connected yet.', errcode = 'P0001';
  end if;
  if o.sync_started_at > now() - interval '5 minutes' then
    raise exception using message = 'Officient is already being read. Try again in a few minutes.', errcode = 'P0001';
  end if;
  update app_private.officient set sync_started_at = now() where id = 1;
  return json_build_object('client_id', o.client_id, 'client_secret', o.client_secret, 'refresh_token', o.refresh_token);
end $$;

create function app_private.officient_save_token(p_refresh text, p_new boolean) returns void
language sql set search_path = public as $$
  update app_private.officient
     set refresh_token = p_refresh, connected_at = case when p_new then now() else connected_at end
   where id = 1
$$;

create function app_private.officient_finish(p_report jsonb, p_error text) returns void
language sql set search_path = public as $$
  update app_private.officient
     set sync_started_at = null, last_error = p_error,
         last_sync_at = case when p_error is null then now() else last_sync_at end,
         last_report = coalesce(p_report, last_report)
   where id = 1
$$;

-- One person from Officient onto the same person in the app: by the link made
-- earlier, else the national register number, else the name. Official details
-- (national number, birth date, IBAN, address, start date, hourly rate,
-- contract hours) follow Officient; phone, e-mail and emergency contact are
-- only filled in when the app has none, so what staff typed themselves stays.
create function app_private.officient_apply_person(p jsonb) returns json
language plpgsql set search_path = public, extensions as $$
declare
  v_oid   int := nullif(p ->> 'id', '')::int;
  v_first text := btrim(coalesce(p ->> 'first_name', ''));
  v_last  text := btrim(coalesce(p ->> 'last_name', ''));
  v_name  text := coalesce(nullif(btrim(coalesce(p ->> 'name', '')), ''), btrim(v_first || ' ' || v_last));
  v_nid   text := nullif(regexp_replace(coalesce(p ->> 'national_number', ''), '\D', '', 'g'), '');
  v_iban  text := nullif(upper(regexp_replace(coalesce(p ->> 'bank_account_iban', ''), '\s', '', 'g')), '');
  v_mail  text := nullif(lower(btrim(coalesce(nullif(p ->> 'personal_email', ''), p ->> 'email', ''))), '');
  v_phone text := nullif(app_private.clean_text(p ->> 'phone', 30), '');
  v_street text := nullif(app_private.clean_text(concat_ws(' ', p -> 'address' ->> 'line_1', nullif(p -> 'address' ->> 'line_2', '')), 120), '');
  v_zip   text := nullif(app_private.clean_text(p -> 'address' ->> 'zipcode', 10), '');
  v_city  text := nullif(app_private.clean_text(p -> 'address' ->> 'city', 80), '');
  w       jsonb := p -> 'wage';
  v_type  text := w ->> 'type';
  v_rate  numeric;
  v_kind  text := lower(coalesce(w -> 'custom_payroll_data' ->> 'contract_type', w ->> 'contract_type', ''));
  v_birth date; v_start date;
  s public.staff; n public.staff;
  v_changed text[] := '{}';
begin
  if v_oid is null then
    return json_build_object('status', 'skipped');
  end if;
  select * into s from public.staff where officient_id = v_oid;
  if not found and v_nid is not null then
    select * into s from public.staff where national_id = v_nid limit 1;
  end if;
  if not found then
    select * into s from public.staff
     where lower(name) in (lower(v_name), lower(btrim(v_first || ' ' || v_last)), lower(btrim(v_last || ' ' || v_first)))
     order by active desc limit 1;
  end if;
  if not found then
    return json_build_object('status', 'unmatched', 'name', v_name);
  end if;
  -- a second Officient record for someone already handled in this run (an
  -- earlier employment, say): only its documents count, the link and the
  -- details stay with the first
  if s.officient_id is distinct from v_oid and coalesce(p -> 'handled', '[]'::jsonb) ? s.id::text then
    return json_build_object('status', 'matched', 'staff_id', s.id, 'name', s.name, 'changed', '{}'::text[], 'new_link', false);
  end if;
  begin v_birth := nullif(p ->> 'birthdate', '')::date; exception when others then v_birth := null; end;
  begin v_start := nullif(p -> 'employment' ->> 'first_employment_date', '')::date; exception when others then v_start := null; end;
  begin v_rate := nullif(w ->> 'rate', '')::numeric; exception when others then v_rate := null; end;
  if v_nid is not null and not app_private.valid_national_id(v_nid) then v_nid := null; end if;
  if v_iban is not null and (v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{8,30}$' or not app_private.valid_iban(v_iban)) then v_iban := null; end if;
  if v_mail is not null and v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_mail := null; end if;
  -- details changed in the app and not sent yet keep the app's value; the
  -- ones Officient now has the same are no longer waiting
  update public.staff set
    officient_id    = v_oid,
    national_id     = case when 'national_id' = any(officient_pending) then national_id else coalesce(v_nid, national_id) end,
    birth_date      = case when 'birth_date' = any(officient_pending) then birth_date else coalesce(v_birth, birth_date) end,
    iban            = case when 'iban' = any(officient_pending) then iban else coalesce(v_iban, iban) end,
    street          = case when 'address' = any(officient_pending) then street else coalesce(v_street, street) end,
    postcode        = case when 'address' = any(officient_pending) then postcode else coalesce(v_zip, postcode) end,
    city            = case when 'address' = any(officient_pending) then city else coalesce(v_city, city) end,
    officient_pending = array(select f from unnest(officient_pending) f where case f
                          when 'national_id' then v_nid is distinct from national_id
                          when 'birth_date' then v_birth is distinct from birth_date
                          when 'iban' then v_iban is distinct from iban
                          when 'address' then row(lower(v_street), lower(v_zip), lower(v_city)) is distinct from row(lower(street), lower(postcode), lower(city))
                          when 'phone' then regexp_replace(regexp_replace(coalesce(v_phone, ''), '\D', '', 'g'), '^(00)?32', '0')
                                            is distinct from regexp_replace(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '^(00)?32', '0')
                          when 'email' then v_mail is distinct from email
                          else true end),
    start_date      = coalesce(v_start, start_date),
    phone           = coalesce(phone, v_phone),
    email           = coalesce(email, left(v_mail, 120)),
    emergency_name  = coalesce(emergency_name, nullif(app_private.clean_text(p -> 'emergency_contact' ->> 'name', 80), '')),
    emergency_phone = coalesce(emergency_phone, nullif(app_private.clean_text(p -> 'emergency_contact' ->> 'phone', 30), '')),
    hourly_rate     = case when v_type like '%hourly' and v_rate between 0 and 10000 then round(v_rate, 2) else hourly_rate end,
    contract_minutes = case when jsonb_typeof(w -> 'weekly_time_engagement_minutes') = 'object'
                            then w -> 'weekly_time_engagement_minutes' else contract_minutes end,
    contract_type   = case when v_kind like '%flexi%' then 'flexi' when v_kind like '%student%' then 'student' else contract_type end
   where id = s.id
  returning * into n;
  if n.national_id is distinct from s.national_id then v_changed := array_append(v_changed, 'rijksregisternummer'); end if;
  if n.birth_date is distinct from s.birth_date then v_changed := array_append(v_changed, 'geboortedatum'); end if;
  if n.iban is distinct from s.iban then v_changed := array_append(v_changed, 'rekeningnummer'); end if;
  if row(n.street, n.postcode, n.city) is distinct from row(s.street, s.postcode, s.city) then v_changed := array_append(v_changed, 'adres'); end if;
  if n.start_date is distinct from s.start_date then v_changed := array_append(v_changed, 'in dienst sinds'); end if;
  if n.phone is distinct from s.phone then v_changed := array_append(v_changed, 'telefoon'); end if;
  if n.email is distinct from s.email then v_changed := array_append(v_changed, 'e-mail'); end if;
  if row(n.emergency_name, n.emergency_phone) is distinct from row(s.emergency_name, s.emergency_phone) then v_changed := array_append(v_changed, 'noodcontact'); end if;
  if n.hourly_rate is distinct from s.hourly_rate then v_changed := array_append(v_changed, 'uurloon'); end if;
  if n.contract_minutes is distinct from s.contract_minutes then v_changed := array_append(v_changed, 'contracturen'); end if;
  if n.contract_type is distinct from s.contract_type then v_changed := array_append(v_changed, 'statuut'); end if;
  return json_build_object('status', 'matched', 'staff_id', n.id, 'name', n.name, 'changed', v_changed,
                           'new_link', s.officient_id is distinct from v_oid);
end $$;

-- Before downloading: 'exists' when this Officient document is in the app
-- already, as a month's payslip or as one of its other documents.
create function app_private.officient_payslip_known(p_ref text, p_staff uuid, p_month date) returns text
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.payslips where source_ref = p_ref)
     or exists (select 1 from public.payslip_calcs where source_ref = p_ref) then
    return 'exists';
  end if;
  return null;
end $$;

-- For a caller that did not read the file: as officient_add_doc.
create function app_private.officient_add_payslip(p_staff uuid, p_month date, p_file_name text, p_data text, p_ref text) returns text
language plpgsql set search_path = public, extensions as $$
begin
  return app_private.officient_add_doc(p_staff, p_month, p_file_name, p_data, p_ref, null);
end $$;

-- A number from what was read off a payslip; null when missing or out of range.
create function app_private.json_num(p jsonb, p_key text) returns numeric
language plpgsql immutable set search_path = public as $$
declare v numeric;
begin
  v := (p ->> p_key)::numeric;
  return case when abs(v) < 99999 then v end;
exception when others then
  return null;
end $$;

-- Stores what was read from one payslip document (p_info, from payslip.js in
-- the Edge Function). p_data only for a document that is not the payslip itself.
create function app_private.payslip_calc_add(p_staff uuid, p_month date, p_payslip_id uuid, p_ref text,
                                             p_file_name text, p_data bytea, p_info jsonb) returns uuid
language plpgsql set search_path = public as $$
declare v_id uuid; v_at timestamp;
begin
  begin v_at := nullif(p_info ->> 'calculated_at', '')::timestamp; exception when others then v_at := null; end;
  insert into public.payslip_calcs (staff_id, month, payslip_id, source_ref, file_name, size_bytes, data, kind, calculated_at,
                                    days_worked, hours_worked, hours_leave, gross_pay, net_paid, previous_payment, ecocheques)
  values (p_staff, p_month, p_payslip_id, p_ref, p_file_name, length(p_data), p_data,
          coalesce(nullif(app_private.clean_text(p_info ->> 'kind', 40), ''), 'Onbekend'), v_at,
          app_private.json_num(p_info, 'days_worked'), app_private.json_num(p_info, 'hours_worked'),
          app_private.json_num(p_info, 'hours_leave'), app_private.json_num(p_info, 'gross_pay'),
          app_private.json_num(p_info, 'net_paid'), app_private.json_num(p_info, 'previous_payment'),
          app_private.json_num(p_info, 'ecocheques'))
  returning id into v_id;
  return v_id;
end $$;

-- The calculation already in the app with the same person, month, kind and
-- calculation time: the same document, fetched or uploaded twice.
create function app_private.payslip_calc_same(p_staff uuid, p_month date, p_info jsonb) returns uuid
language plpgsql stable set search_path = public as $$
declare v_at timestamp;
begin
  begin v_at := nullif(p_info ->> 'calculated_at', '')::timestamp; exception when others then return null; end;
  if v_at is null then
    return null;
  end if;
  return (select id from public.payslip_calcs
           where staff_id = p_staff and month = p_month and calculated_at = v_at
             and kind = coalesce(nullif(app_private.clean_text(p_info ->> 'kind', 40), ''), 'Onbekend')
           order by payslip_id is null desc limit 1);
end $$;

-- The month's figures on its payslip, from its calculations in the order they
-- were made. A recalculation that deducts an earlier payment covers the whole
-- month and replaces what came before; a correction adds its differences.
create function app_private.payslip_month_totals(p_staff uuid, p_month date) returns void
language plpgsql set search_path = public as $$
declare c record; v_wage boolean := false; v_days numeric := 0; v_hours numeric := 0; v_leave numeric := 0;
        v_gross numeric := 0; v_net numeric := 0; v_eco numeric;
begin
  for c in select pc.* from public.payslip_calcs pc
            where pc.staff_id = p_staff and pc.month = p_month
              and (pc.payslip_id is null or exists (select 1 from public.payslips p where p.id = pc.payslip_id and p.archived_at is null))
            order by pc.calculated_at nulls first, pc.created_at
  loop
    if c.kind = 'Bezoldiging' then
      if coalesce(c.previous_payment, 0) <> 0 then
        v_days := 0; v_hours := 0; v_leave := 0; v_gross := 0; v_net := c.previous_payment;
      end if;
      v_wage := true;
      v_days := v_days + coalesce(c.days_worked, 0);
      v_hours := v_hours + coalesce(c.hours_worked, 0);
      v_leave := v_leave + coalesce(c.hours_leave, 0);
      v_gross := v_gross + coalesce(c.gross_pay, 0);
      v_net := v_net + coalesce(c.net_paid, 0);
    elsif c.ecocheques is not null then
      v_eco := coalesce(v_eco, 0) + c.ecocheques;
    end if;
  end loop;
  update public.payslips
     set days_worked = case when v_wage then v_days end,
         hours_worked = case when v_wage then v_hours end,
         hours_leave = case when v_wage then v_leave end,
         gross_pay = case when v_wage then v_gross else gross_pay end,
         net_pay = case when v_wage then v_net else net_pay end,
         ecocheques = v_eco
   where staff_id = p_staff and month = p_month and archived_at is null;
end $$;

-- A payslip document from Officient, with what was read from it (p_info; null
-- when it could not be read). The first document of a month becomes the
-- month's payslip; more for that month (a recalculation, a correction,
-- ecocheques) are kept with it. The same calculation uploaded by hand is
-- recognised and only marked as this document.
create function app_private.officient_add_doc(p_staff uuid, p_month date, p_file_name text, p_data text, p_ref text, p_info jsonb)
returns text language plpgsql set search_path = public, extensions as $$
declare v_month date := date_trunc('month', p_month)::date; v_bytes bytea; v_name text; v_same uuid; c public.payslip_calcs; v_slip uuid;
begin
  if exists (select 1 from public.payslips where source_ref = p_ref)
     or exists (select 1 from public.payslip_calcs where source_ref = p_ref) then
    return 'exists';
  end if;
  v_same := app_private.payslip_calc_same(p_staff, v_month, p_info);
  if v_same is not null then
    select * into c from public.payslip_calcs where id = v_same;
    update public.payslips set source_ref = p_ref where id = c.payslip_id and source_ref is null;
    if not found then
      update public.payslip_calcs set source_ref = p_ref where id = c.id and source_ref is null;
    end if;
    return 'already';
  end if;
  v_bytes := app_private.check_file('application/pdf', p_data);
  v_name := coalesce(nullif(app_private.clean_text(p_file_name, 120), ''), 'loonbrief.pdf');
  if not exists (select 1 from public.payslips where staff_id = p_staff and month = v_month and archived_at is null) then
    insert into public.payslips (staff_id, month, file_name, content_type, size_bytes, data, source_ref, read_at)
    values (p_staff, v_month, v_name, 'application/pdf', length(v_bytes), v_bytes, p_ref, now())
    returning id into v_slip;
    if p_info is not null then
      perform app_private.payslip_calc_add(p_staff, v_month, v_slip, null, null, null, p_info);
    end if;
    perform app_private.payslip_month_totals(p_staff, v_month);
    return 'added';
  end if;
  perform app_private.payslip_calc_add(p_staff, v_month, null, p_ref, v_name, v_bytes, coalesce(p_info, '{}'::jsonb));
  perform app_private.payslip_month_totals(p_staff, v_month);
  return 'extra';
end $$;

-- Who may have payslip files read: a manager, or the nightly job.
create function app_private.payslip_read_allowed(p_token text, p_cron text) returns boolean
language plpgsql stable set search_path = public as $$
begin
  if p_cron is not null then
    if p_cron is distinct from (select cron_secret from app_private.officient where id = 1) then
      raise exception using message = 'Not allowed.', errcode = '28000';
    end if;
    return true;
  end if;
  perform app_private.current_manager(p_token);
  return true;
end $$;

-- Payslips whose file has not been read yet, a few at a time.
create function app_private.payslips_to_read(p_limit int) returns json
language sql stable set search_path = public as $$
  select coalesce(json_agg(json_build_object('id', p.id, 'data', encode(p.data, 'base64'))), '[]'::json)
    from (select id, data from public.payslips
           where archived_at is null and read_at is null and data is not null
           order by month desc limit greatest(1, least(p_limit, 20))) p
$$;

-- What was read from a payslip's own file (p_info null when it could not be
-- read). When Officient brought the same calculation as another document
-- first, that one now belongs to this payslip.
create function app_private.payslip_read(p_id uuid, p_info jsonb) returns text
language plpgsql set search_path = public as $$
declare p public.payslips; c public.payslip_calcs; v_same uuid;
begin
  select * into p from public.payslips where id = p_id and archived_at is null and read_at is null for update;
  if not found then
    return 'gone';
  end if;
  update public.payslips set read_at = now() where id = p_id;
  if p_info is null then
    return 'unreadable';
  end if;
  v_same := app_private.payslip_calc_same(p.staff_id, p.month, p_info);
  if v_same is null then
    perform app_private.payslip_calc_add(p.staff_id, p.month, p_id, null, null, null, p_info);
  else
    select * into c from public.payslip_calcs where id = v_same;
    update public.payslip_calcs set payslip_id = p_id, data = null, file_name = null, size_bytes = null,
                                    source_ref = case when p.source_ref is null then null else source_ref end
     where id = c.id;
    if p.source_ref is null and c.source_ref is not null then
      update public.payslips set source_ref = c.source_ref where id = p_id;
    end if;
  end if;
  perform app_private.payslip_month_totals(p.staff_id, p.month);
  return 'read';
end $$;


-- ------------------------------------------------------------ availability

-- When students and part-timers can work, per month: per day the open
-- services they can take (by the label of the standard shift, eg Middag,
-- Avond) and a note, eg "vanaf 18u". The app no longer asks for it (students
-- pick their own shifts); the table and its functions stay, unused, as the
-- live database has them.
create table public.availability (
  staff_id     uuid not null references public.staff (id),
  month        date not null check (extract(day from month) = 1),
  days         jsonb not null default '{}'::jsonb, -- {"2026-11-03": {"s": ["Middag", "Avond"], "n": "vanaf 18u"}}
  note         text not null default '',
  submitted_at timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (staff_id, month)
);
create index availability_month_idx on public.availability (month);
alter table public.availability enable row level security;
revoke all on public.availability from anon, authenticated;

-- The open services of each day in a month, from the standard shifts that are
-- open to anyone: {"2026-11-03": [{"label": "Middag", "start": "11:30", "end": "14:30"}, ...]}.
-- Without any, each day has one service: "Beschikbaar".
create function app_private.month_slots(p_month date) returns jsonb
language plpgsql stable set search_path = public as $$
declare v_month date := date_trunc('month', p_month)::date; v jsonb;
begin
  if not exists (select 1 from public.shift_templates where staff_id is null and archived_at is null) then
    return (select jsonb_object_agg(d::date::text, '[{"label": "Beschikbaar"}]'::jsonb)
              from generate_series(v_month, v_month + interval '1 month' - interval '1 day', interval '1 day') d);
  end if;
  select coalesce(jsonb_object_agg(day, slots), '{}'::jsonb) into v from (
    select x.day::text as day, jsonb_agg(jsonb_build_object('label', x.label, 'start', to_char(x.st, 'HH24:MI'), 'end', to_char(x.en, 'HH24:MI'))
                                   order by x.st) as slots
      from (select d::date as day, coalesce(nullif(t.label, ''), 'Shift') as label, min(t.start_time) as st, max(t.end_time) as en
              from generate_series(v_month, v_month + interval '1 month' - interval '1 day', interval '1 day') d
              join public.shift_templates t on t.staff_id is null and t.archived_at is null
                                           and extract(dow from d)::int = any(t.weekdays)
             group by 1, 2) x
     group by x.day) y;
  return v;
end $$;

create function public.my_availability(p_token text, p_month date) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff; v_month date := date_trunc('month', p_month)::date; a public.availability;
begin
  v := app_private.current_staff(p_token);
  if v_month is null then
    raise exception using message = 'Pick a month.', errcode = 'P0001';
  end if;
  select * into a from public.availability where staff_id = v.id and month = v_month;
  return json_build_object('month', v_month, 'slots', app_private.month_slots(v_month),
                           'days', coalesce(a.days, '{}'::jsonb), 'note', coalesce(a.note, ''), 'submitted_at', a.submitted_at);
end $$;

-- p_days: {"2026-11-03": {"s": ["Middag"], "n": "vanaf 12u"}}; days outside the
-- month and services that day doesn't have are left out.
create function public.save_my_availability(p_token text, p_month date, p_days jsonb, p_note text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; v_month date := date_trunc('month', p_month)::date; v_tz text; v_slots jsonb; v_clean jsonb := '{}'::jsonb;
        d record; v_day date; v_s jsonb; v_n text; v_at timestamptz;
begin
  v := app_private.current_staff(p_token);
  select coalesce(timezone, 'UTC') into v_tz from public.settings where id = 1;
  if v_month is null or v_month < date_trunc('month', now() at time zone v_tz)::date then
    raise exception using message = 'That month has passed.', errcode = 'P0001';
  end if;
  if v_month > date_trunc('month', now() at time zone v_tz)::date + interval '3 months' then
    raise exception using message = 'Pick a month in the next three months.', errcode = 'P0001';
  end if;
  v_slots := app_private.month_slots(v_month);
  if jsonb_typeof(p_days) = 'object' then
    for d in select key, value from jsonb_each(p_days) loop
      begin v_day := d.key::date; exception when others then continue; end;
      if date_trunc('month', v_day)::date <> v_month or jsonb_typeof(d.value) <> 'object' then continue; end if;
      select coalesce(jsonb_agg(distinct x), '[]'::jsonb) into v_s
        from jsonb_array_elements_text(case when jsonb_typeof(d.value -> 's') = 'array' then d.value -> 's' else '[]'::jsonb end) x
       where x in (select sl ->> 'label' from jsonb_array_elements(coalesce(v_slots -> v_day::text, '[]'::jsonb)) sl);
      v_n := app_private.clean_text(d.value ->> 'n', 120);
      if jsonb_array_length(v_s) > 0 or v_n <> '' then
        v_clean := v_clean || jsonb_build_object(v_day::text, jsonb_build_object('s', v_s, 'n', v_n));
      end if;
    end loop;
  end if;
  insert into public.availability (staff_id, month, days, note, submitted_at, updated_at)
  values (v.id, v_month, v_clean, app_private.clean_text(p_note, 500), now(), now())
  on conflict (staff_id, month) do update
     set days = excluded.days, note = excluded.note, submitted_at = now(), updated_at = now()
  returning submitted_at into v_at;
  return json_build_object('ok', true, 'submitted_at', v_at, 'days', v_clean);
end $$;

-- Everyone who works (not the family accounts), with what they handed in.
create function public.mgr_availability(p_token text, p_month date) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff; v_month date := date_trunc('month', p_month)::date;
begin
  v := app_private.current_manager(p_token);
  if v_month is null then
    raise exception using message = 'Pick a month.', errcode = 'P0001';
  end if;
  return json_build_object('month', v_month, 'slots', app_private.month_slots(v_month),
    'people', coalesce((select json_agg(json_build_object(
        'staff_id', st.id, 'name', st.name, 'avatar', st.avatar, 'role', app_private.role_of(st), 'contract_type', st.contract_type, 'phone', st.phone,
        'fixed', exists (select 1 from public.shift_templates tp where tp.staff_id = st.id and tp.archived_at is null),
        'submitted_at', a.submitted_at, 'days', coalesce(a.days, '{}'::jsonb), 'note', coalesce(a.note, ''))
        order by lower(st.name))
      from public.staff st left join public.availability a on a.staff_id = st.id and a.month = v_month
     where st.active and not st.view_only), '[]'::json));
end $$;

-- Today for the family view: every shift of today, fixed workers too, and
-- when each person clocked in and out.
create function public.family_today(p_token text) returns json
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v public.staff; v_tz text; v_from timestamptz; v_to timestamptz;
begin
  v := app_private.current_account(p_token);
  if not v.view_only and v.role <> 'manager' then
    raise exception using message = 'Only managers can do that.', errcode = 'P0001';
  end if;
  select coalesce(timezone, 'UTC') into v_tz from public.settings where id = 1;
  v_from := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  v_to := v_from + interval '1 day';
  perform app_private.ensure_template_shifts(v_from, v_to);
  return json_build_object(
    'grace_minutes', (select grace_minutes from public.settings where id = 1),
    'shifts', coalesce((select json_agg(json_build_object(
        'id', sh.id, 'starts_at', sh.starts_at, 'ends_at', sh.ends_at, 'label', sh.label,
        'staff_id', sh.staff_id, 'staff_name', st.name, 'avatar', st.avatar,
        'fixed', app_private.is_fixed_shift(sh.template_id, sh.staff_id))
        order by sh.starts_at, st.name nulls last)
      from public.shifts sh left join public.staff st on st.id = sh.staff_id
     where sh.cancelled_at is null and sh.starts_at < v_to and sh.ends_at > v_from), '[]'::json),
    'entries', coalesce((select json_agg(json_build_object(
        'staff_id', e.staff_id, 'staff_name', st.name, 'clock_in', e.clock_in, 'clock_out', e.clock_out, 'driver', st.driver) order by e.clock_in)
      from public.time_entries e join public.staff st on st.id = e.staff_id
     where e.deleted_at is null and e.clock_in < v_to and coalesce(e.clock_out, now()) > v_from), '[]'::json));
end $$;


-- -------------------------------------------- clocked hours to Officient

-- The minutes clocked per local day in a month, for each person linked to
-- Officient (an entry over midnight counts on both days), with what still
-- needs a look: someone still clocked in, or a change that waits.
create function app_private.clocked_by_day(p_month date) returns json
language sql stable set search_path = public as $$
  with tz as (select coalesce(timezone, 'UTC') as tz from public.settings where id = 1),
  bounds as (select date_trunc('month', p_month)::timestamp at time zone tz.tz as a,
                    (date_trunc('month', p_month) + interval '1 month')::timestamp at time zone tz.tz as b, tz.tz from tz),
  e as (select t.staff_id, greatest(t.clock_in, bounds.a) at time zone bounds.tz as li, least(t.clock_out, bounds.b) at time zone bounds.tz as lo
          from public.time_entries t, bounds
         where t.deleted_at is null and t.clock_out is not null and t.clock_out > bounds.a and t.clock_in < bounds.b),
  d as (select e.staff_id, g::date as day, extract(epoch from (least(e.lo, g + interval '1 day') - greatest(e.li, g))) / 60 as minutes
          from e, generate_series(date_trunc('day', e.li), date_trunc('day', e.lo - interval '1 microsecond'), interval '1 day') g)
  select coalesce(json_agg(json_build_object(
      'staff_id', st.id, 'officient_id', st.officient_id, 'name', st.name, 'contract_type', st.contract_type,
      'days', coalesce((select json_object_agg(q.day, q.m) from (
                select d.day::text as day, round(sum(d.minutes))::int as m from d where d.staff_id = st.id group by d.day having round(sum(d.minutes)) > 0) q), '{}'::json),
      'open', (select count(*) from public.time_entries t where t.staff_id = st.id and t.clock_out is null and t.deleted_at is null),
      'pending', (select count(*) from public.time_edits x where x.staff_id = st.id and x.status = 'pending'))
      order by lower(st.name)), '[]'::json)
    from public.staff st where st.officient_id is not null and not st.driver -- a driver's hours don't go to Officient
$$;

-- Notes that a manager wrote a month's hours into Officient.
create function app_private.officient_record_push(p_token text, p_month date, p_rows int, p_minutes numeric) returns void
language plpgsql set search_path = public as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  insert into public.payroll_exports (month, rows, minutes, created_by, kind)
  values (date_trunc('month', p_month)::date, greatest(coalesce(p_rows, 0), 0), greatest(coalesce(p_minutes, 0), 0), v.id, 'officient');
end $$;


-- Student contracts ----------------------------------------------------------
-- A student works on a contract for a short period (a month). The app writes
-- it on Securex's model (web/contract.js) from the profile and the planning,
-- keeps it with the person's contracts, and can put it in Officient to sign,
-- with the planned hours in Officient's calendar (Edge Function officient).

-- What a student contract needs from the profile and is missing.
create function app_private.contract_missing(s public.staff) returns json
language sql stable set search_path = public as $$
  select coalesce(json_agg(k), '[]'::json) from unnest(array[
    case when s.birth_date is null then 'birth_date' end,
    case when coalesce(s.street, '') = '' or coalesce(s.postcode, '') = '' or coalesce(s.city, '') = '' then 'address' end,
    case when coalesce(s.iban, '') = '' then 'iban' end,
    case when s.hourly_rate is null then 'hourly_rate' end]) k
   where k is not null
$$;

-- One person's shifts in a period, in local time, for the schedule on the contract.
create function app_private.contract_shifts(p_staff uuid, p_from date, p_to date) returns json
language sql stable set search_path = public as $$
  with tz as (select coalesce(timezone, 'UTC') as tz from public.settings where id = 1)
  select coalesce(json_agg(json_build_object(
      'date', (sh.starts_at at time zone tz.tz)::date, 'start', to_char(sh.starts_at at time zone tz.tz, 'HH24:MI'),
      'end', to_char(sh.ends_at at time zone tz.tz, 'HH24:MI'), 'minutes', round(extract(epoch from (sh.ends_at - sh.starts_at)) / 60),
      'label', sh.label) order by sh.starts_at), '[]'::json)
    from public.shifts sh, tz
   where sh.staff_id = p_staff and sh.cancelled_at is null
     and (sh.starts_at at time zone tz.tz)::date between p_from and p_to
$$;

-- Minutes planned per day for one person in a period, split at local midnight.
create function app_private.planned_by_day(p_staff uuid, p_from date, p_to date) returns json
language sql stable set search_path = public as $$
  with tz as (select coalesce(timezone, 'UTC') as tz from public.settings where id = 1),
  b as (select p_from::timestamp at time zone tz.tz as a, (p_to + 1)::timestamp at time zone tz.tz as z, tz.tz from tz),
  s as (select greatest(sh.starts_at, b.a) at time zone b.tz as li, least(sh.ends_at, b.z) at time zone b.tz as lo
          from public.shifts sh, b
         where sh.staff_id = p_staff and sh.cancelled_at is null and sh.ends_at > b.a and sh.starts_at < b.z),
  d as (select g::date as day, extract(epoch from (least(s.lo, g + interval '1 day') - greatest(s.li, g))) / 60 as minutes
          from s, generate_series(date_trunc('day', s.li), date_trunc('day', s.lo - interval '1 microsecond'), interval '1 day') g)
  select coalesce((select json_object_agg(q.day, q.m) from (
           select day::text as day, round(sum(minutes))::int as m from d group by day having round(sum(minutes)) > 0) q), '{}'::json)
$$;

-- What a contract was made from, keeping only what the app writes.
create function app_private.clean_contract_details(p jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'kind', 'student',
    'function', nullif(app_private.clean_text(p ->> 'function', 80), ''),
    'tasks', nullif(app_private.clean_text(p ->> 'tasks', 300), ''),
    'hours', app_private.json_num(p, 'hours'),
    'regime', case when p ->> 'regime' in ('deeltijds', 'voltijds') then p ->> 'regime' end,
    'option', case when p ->> 'option' in ('vast', 'vast4', 'vast_variabel', 'variabel') then p ->> 'option' end,
    'weekly', app_private.json_num(p, 'weekly'),
    'rate', app_private.json_num(p, 'rate'),
    'contingent', case when p ->> 'contingent' in ('uren', 'dagen') then p ->> 'contingent' end,
    'place', nullif(app_private.clean_text(p ->> 'place', 60), ''),
    'sign_date', case when p ->> 'sign_date' ~ '^\d{4}-\d{2}-\d{2}$' then p ->> 'sign_date' end))
$$;

-- The students and their contract for one month, with the hours planned.
create function public.mgr_student_contracts(p_token text, p_month date) returns json
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v public.staff; v_month date := date_trunc('month', p_month)::date; v_end date; v_tz text;
begin
  v := app_private.current_manager(p_token);
  if v_month is null then
    raise exception using message = 'Pick a month.', errcode = 'P0001';
  end if;
  v_end := (v_month + interval '1 month' - interval '1 day')::date;
  select coalesce(timezone, 'UTC') into v_tz from public.settings where id = 1;
  perform app_private.ensure_template_shifts(v_month::timestamp at time zone v_tz, (v_end + 1)::timestamp at time zone v_tz);
  return json_build_object('month', v_month, 'info', (select contract_info from public.settings where id = 1),
    'students', coalesce((select json_agg(json_build_object(
        'staff_id', st.id, 'name', st.name, 'avatar', st.avatar, 'officient_id', st.officient_id, 'email', st.email,
        'planned_minutes', coalesce((select sum(round(extract(epoch from (sh.ends_at - sh.starts_at)) / 60)) from public.shifts sh
                                      where sh.staff_id = st.id and sh.cancelled_at is null
                                        and (sh.starts_at at time zone v_tz)::date between v_month and v_end), 0),
        'planned_days', (select count(distinct (sh.starts_at at time zone v_tz)::date) from public.shifts sh
                          where sh.staff_id = st.id and sh.cancelled_at is null
                            and (sh.starts_at at time zone v_tz)::date between v_month and v_end),
        'missing', app_private.contract_missing(st),
        'contract', (select json_build_object('id', c.id, 'starts_on', c.starts_on, 'ends_on', c.ends_on, 'created_at', c.created_at,
                              'hours', c.details -> 'hours', 'officient_contract_id', c.officient_contract_id,
                              'officient_sent_at', c.officient_sent_at, 'signature_requested_at', c.signature_requested_at,
                              'officient_hours_at', c.officient_hours_at)
                       from public.contracts c
                      where c.staff_id = st.id and c.archived_at is null and c.details ->> 'kind' = 'student'
                        and c.starts_on <= v_end and coalesce(c.ends_on, c.starts_on) >= v_month
                      order by c.created_at desc limit 1))
        order by lower(st.name))
      from public.staff st where st.active and not st.view_only and st.contract_type = 'student'), '[]'::json));
end $$;

-- Everything to write one student's contract for a period: the profile, the
-- shifts planned, what the last contract said, and the employer's details.
create function public.mgr_student_contract_draft(p_token text, p_staff_id uuid, p_from date, p_to date) returns json
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v public.staff; s public.staff; v_tz text;
begin
  v := app_private.current_manager(p_token);
  select * into s from public.staff where id = p_staff_id and active and not view_only;
  if not found then
    raise exception using message = 'Pick a team member.', errcode = 'P0001';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception using message = 'The end date must be after the start date.', errcode = 'P0001';
  end if;
  if p_to - p_from > 366 then
    raise exception using message = 'Pick a shorter period.', errcode = 'P0001';
  end if;
  select coalesce(timezone, 'UTC') into v_tz from public.settings where id = 1;
  perform app_private.ensure_template_shifts(p_from::timestamp at time zone v_tz, (p_to + 1)::timestamp at time zone v_tz);
  return json_build_object(
    'student', json_build_object('id', s.id, 'name', s.name, 'birth_date', s.birth_date, 'street', s.street, 'postcode', s.postcode,
                                 'city', s.city, 'iban', s.iban, 'email', s.email, 'hourly_rate', s.hourly_rate, 'officient_id', s.officient_id),
    'shifts', app_private.contract_shifts(s.id, p_from, p_to),
    'missing', app_private.contract_missing(s),
    'last', (select c.details from public.contracts c
              where c.staff_id = s.id and c.archived_at is null and c.details ->> 'kind' = 'student'
              order by c.created_at desc limit 1),
    'info', (select contract_info from public.settings where id = 1));
end $$;

-- Keeps a student contract the app wrote (a PDF), with what it was made
-- from. p_replace: the contract it replaces, for the same person.
create function public.mgr_save_student_contract(p_token text, p_staff_id uuid, p_from date, p_to date,
                                                 p_details jsonb, p_data text, p_replace uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; s public.staff; v_bytes bytea; v_id uuid;
begin
  v := app_private.current_manager(p_token);
  select * into s from public.staff where id = p_staff_id;
  if not found then
    raise exception using message = 'Pick a team member.', errcode = 'P0001';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception using message = 'The end date must be after the start date.', errcode = 'P0001';
  end if;
  v_bytes := app_private.check_file('application/pdf', p_data);
  if p_replace is not null then
    update public.contracts set archived_at = now(), data = null
     where id = p_replace and staff_id = p_staff_id and archived_at is null and details ->> 'kind' = 'student';
  end if;
  insert into public.contracts (staff_id, title, starts_on, ends_on, file_name, content_type, size_bytes, data, uploaded_by, details)
  values (p_staff_id, 'Studentenovereenkomst ' || to_char(p_from, 'DD/MM') || ' – ' || to_char(p_to, 'DD/MM/YYYY'), p_from, p_to,
          'studentenovereenkomst-' || trim(both '-' from lower(regexp_replace(s.name, '[^A-Za-z0-9]+', '-', 'g'))) || '-' || to_char(p_from, 'YYYY-MM') || '.pdf',
          'application/pdf', length(v_bytes), v_bytes, v.id, app_private.clean_contract_details(p_details))
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id);
end $$;

-- The employer's details on student contracts.
create function public.mgr_save_contract_info(p_token text, p_info jsonb) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  update public.settings
     set contract_info = (select coalesce(jsonb_object_agg(k, app_private.clean_text(p_info ->> k, case when k = 'inspection' then 400 else 160 end)), '{}'::jsonb)
                            from unnest(array['employer', 'employer_address', 'vat', 'phone', 'representative', 'work_address', 'notify',
                                              'first_aid', 'first_aid_kit', 'prevention', 'prevention_phone', 'inspection', 'committee', 'place']) k
                           where app_private.clean_text(p_info ->> k, 400) <> '')
   where id = 1;
  return json_build_object('ok', true, 'info', (select contract_info from public.settings where id = 1));
end $$;

-- For the Edge Function: a student contract to put in Officient, after the manager check.
create function app_private.contract_for_officient(p_token text, p_id uuid) returns json
language plpgsql set search_path = public, extensions as $$
declare v public.staff; c public.contracts; s public.staff;
begin
  v := app_private.current_manager(p_token);
  select * into c from public.contracts where id = p_id and archived_at is null and data is not null and details ->> 'kind' = 'student';
  if not found then
    raise exception using message = 'That contract isn''t available.', errcode = 'P0001';
  end if;
  select * into s from public.staff where id = c.staff_id;
  if s.officient_id is null then
    raise exception using message = 'This person isn''t linked with Officient yet.', errcode = 'P0001';
  end if;
  return json_build_object('id', c.id, 'staff_id', s.id, 'officient_id', s.officient_id, 'name', s.name, 'title', c.title,
                           'data', encode(c.data, 'base64'), 'starts_on', c.starts_on, 'ends_on', c.ends_on,
                           'officient_contract_id', c.officient_contract_id);
end $$;

-- For the Edge Function: what went into Officient for a student contract.
create function app_private.contract_officient_done(p_id uuid, p_officient_id text, p_signature boolean, p_hours boolean) returns boolean
language plpgsql set search_path = public as $$
begin
  update public.contracts
     set officient_contract_id = coalesce(nullif(p_officient_id, ''), officient_contract_id),
         officient_sent_at = case when nullif(p_officient_id, '') is not null then now() else officient_sent_at end,
         signature_requested_at = case when p_signature then now() else signature_requested_at end,
         officient_hours_at = case when p_hours then now() else officient_hours_at end
   where id = p_id;
  return found;
end $$;


-- People into Officient ------------------------------------------------------
-- With personal.info:write and basics:write the manager sends details changed
-- in the app to Officient, or adds someone to Officient (Edge Function officient).

-- For the Edge Function: a person's details as the app has them, after the manager check.
create function app_private.person_for_officient(p_token text, p_staff uuid) returns json
language plpgsql set search_path = public, extensions as $$
declare v public.staff; s public.staff;
begin
  v := app_private.current_manager(p_token);
  select * into s from public.staff where id = p_staff and not view_only;
  if not found then
    raise exception using message = 'That person wasn''t found.', errcode = 'P0001';
  end if;
  return json_build_object('staff_id', s.id, 'officient_id', s.officient_id, 'name', s.name, 'phone', s.phone, 'email', s.email,
                           'birth_date', s.birth_date, 'national_id', s.national_id, 'iban', s.iban,
                           'street', s.street, 'postcode', s.postcode, 'city', s.city, 'pending', s.officient_pending);
end $$;

-- For the Edge Function: these details are in Officient now.
create function app_private.person_officient_done(p_staff uuid, p_keys text[]) returns boolean
language plpgsql set search_path = public as $$
begin
  update public.staff set officient_pending = array(select f from unnest(officient_pending) f where not f = any(coalesce(p_keys, '{}')))
   where id = p_staff;
  return found;
end $$;

-- For the Edge Function: the person Officient just added for someone in the app.
create function app_private.person_officient_link(p_staff uuid, p_oid int) returns boolean
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.staff where officient_id = p_oid and id <> p_staff) then
    raise exception using message = 'Someone else in the app is linked with that person in Officient.', errcode = 'P0001';
  end if;
  update public.staff set officient_id = p_oid, officient_pending = '{}' where id = p_staff and officient_id is null;
  return found;
end $$;

-- Drivers ---------------------------------------------------------------------
-- A driver (chauffeur) refills the vending machines on a daily round. He has no
-- schedule: he clocks in and out at the restaurant, with his phone's location,
-- and only while he is clocked in the app keeps where he drives. The manager
-- marks the places on the round (checkpoints) and sees when he reached each
-- one and how long the drive in between took (Ritten).

create table public.checkpoints (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 1 and 80),
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  radius_m    int not null default 75 check (radius_m between 20 and 1000), -- within this distance he is there
  archived_at timestamptz, -- removed places are archived, not deleted
  created_at  timestamptz not null default now()
);
alter table public.checkpoints enable row level security;
revoke all on public.checkpoints from anon, authenticated;

-- Where a driver was while clocked in: 'in' and 'out' where he clocked, 'track'
-- his phone's position along the way, 'here' when he tapped "Ik ben hier".
create table public.route_points (
  id       bigint generated always as identity primary key,
  entry_id uuid not null references public.time_entries (id) on delete cascade,
  staff_id uuid not null references public.staff (id) on delete cascade,
  at       timestamptz not null,
  lat      double precision not null check (lat between -90 and 90),
  lng      double precision not null check (lng between -180 and 180),
  accuracy real check (accuracy >= 0), -- metres, as the phone reports it
  kind     text not null default 'track' check (kind in ('in', 'out', 'track', 'here'))
);
create index route_points_entry_idx on public.route_points (entry_id, at);
-- the phone may send a position twice (after a lost connection): it is kept once
create unique index route_points_once on public.route_points (staff_id, at, kind);
alter table public.route_points enable row level security;
revoke all on public.route_points from anon, authenticated;

-- Metres between two points on the earth (haversine).
create function app_private.distance_m(p_lat1 double precision, p_lng1 double precision,
                                       p_lat2 double precision, p_lng2 double precision) returns double precision
language sql immutable set search_path = public as $$
  select 2 * 6371000 * asin(least(1, sqrt(power(sin(radians(p_lat2 - p_lat1) / 2), 2)
         + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2))))
$$;

-- Refuses a driver's clock in or out away from the restaurant and returns the
-- distance. How precise the phone says it is counts in his favour, at most the
-- radius again: indoors a phone often knows its place to 50 m or worse.
create function app_private.check_at_site(p_lat double precision, p_lng double precision,
                                          p_accuracy double precision) returns double precision
language plpgsql stable set search_path = public as $$
declare st public.settings; d double precision;
begin
  select * into st from public.settings where id = 1;
  if st.site_lat is null or st.site_lng is null then
    raise exception using message = 'The restaurant''s location isn''t set yet. Ask your manager.', errcode = 'P0001';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception using message = 'Your location is needed to clock in or out. Allow it and try again.', errcode = 'P0001';
  end if;
  d := app_private.distance_m(st.site_lat, st.site_lng, p_lat, p_lng);
  if d > st.site_radius_m + least(greatest(coalesce(p_accuracy, 0), 0), st.site_radius_m) then
    raise exception using errcode = 'P0001',
      message = format('You''re %s m from the restaurant. Clock in and out at the restaurant.', round(d)::bigint);
  end if;
  return d;
end $$;

create function app_private.driver_of(p_token text) returns public.staff
language plpgsql stable set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_staff(p_token);
  if not v.driver then
    raise exception using message = 'Only drivers can do that.', errcode = 'P0001';
  end if;
  return v;
end $$;

create function app_private.checkpoints_json() returns json
language sql stable set search_path = public as $$
  select coalesce(json_agg(json_build_object('id', id, 'name', name, 'lat', lat, 'lng', lng, 'radius_m', radius_m)
                  order by lower(name)), '[]'::json)
    from public.checkpoints where archived_at is null
$$;

create function app_private.site_json() returns json
language sql stable set search_path = public as $$
  select json_build_object('lat', site_lat, 'lng', site_lng, 'radius_m', site_radius_m) from public.settings where id = 1
$$;

-- The positions of some time entries, oldest first.
create function app_private.route_json(p_entries uuid[]) returns json
language sql stable set search_path = public as $$
  select coalesce(json_agg(json_build_object('entry_id', entry_id, 'at', at, 'lat', lat, 'lng', lng,
                                             'acc', accuracy, 'kind', kind) order by at, id), '[]'::json)
    from public.route_points where entry_id = any(p_entries)
$$;

revoke all on all functions in schema app_private from public, anon, authenticated;

create function public.driver_clock_in(p_token text, p_lat double precision, p_lng double precision,
                                       p_accuracy double precision) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; v_id uuid; v_d double precision;
begin
  v := app_private.driver_of(p_token);
  if exists (select 1 from public.time_entries where staff_id = v.id and clock_out is null) then
    raise exception using message = 'You''re already checked in.', errcode = 'P0001';
  end if;
  v_d := app_private.check_at_site(p_lat, p_lng, p_accuracy);
  insert into public.time_entries (staff_id, clock_in) values (v.id, now()) returning id into v_id;
  insert into public.route_points (entry_id, staff_id, at, lat, lng, accuracy, kind)
  values (v_id, v.id, now(), p_lat, p_lng, least(greatest(p_accuracy, 0), 100000), 'in');
  return json_build_object('ok', true, 'id', v_id, 'distance_m', round(v_d));
exception when unique_violation then
  raise exception using message = 'You''re already checked in.', errcode = 'P0001';
end $$;

create function public.driver_clock_out(p_token text, p_lat double precision, p_lng double precision,
                                        p_accuracy double precision, p_note text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; v_id uuid; v_at timestamptz;
begin
  v := app_private.driver_of(p_token);
  select id into v_id from public.time_entries where staff_id = v.id and clock_out is null;
  if v_id is null then
    raise exception using message = 'You''re not checked in.', errcode = 'P0001';
  end if;
  perform app_private.check_at_site(p_lat, p_lng, p_accuracy);
  update public.time_entries
     set clock_out = greatest(now(), clock_in + interval '1 second'),
         note = coalesce(nullif(app_private.clean_text(p_note, 300), ''), note)
   where id = v_id
  returning clock_out into v_at;
  insert into public.route_points (entry_id, staff_id, at, lat, lng, accuracy, kind)
  values (v_id, v.id, v_at, p_lat, p_lng, least(greatest(p_accuracy, 0), 100000), 'out')
  on conflict do nothing;
  return json_build_object('ok', true, 'id', v_id);
end $$;

-- Away from the restaurant and forgot to clock out: he is clocked out now and
-- the time he really stopped goes to the manager to approve, like any fix.
create function public.driver_forgot_out(p_token text, p_out timestamptz, p_reason text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; e public.time_entries; v_reason text := app_private.clean_text(p_reason, 300);
begin
  v := app_private.driver_of(p_token);
  if length(v_reason) < 3 then
    raise exception using message = 'Add a short reason so your manager knows what happened.', errcode = 'P0001';
  end if;
  select * into e from public.time_entries where staff_id = v.id and clock_out is null for update;
  if not found then
    raise exception using message = 'You''re not checked in.', errcode = 'P0001';
  end if;
  perform app_private.check_entry_times(e.clock_in, p_out);
  if p_out > now() + interval '1 minute' then
    raise exception using message = 'Times can''t be in the future.', errcode = 'P0001';
  end if;
  update public.time_entries set clock_out = greatest(now(), clock_in + interval '1 second'), note = v_reason
   where id = e.id;
  insert into public.time_edits (entry_id, staff_id, proposed_in, proposed_out, reason)
  values (e.id, v.id, e.clock_in, p_out, v_reason);
  return json_build_object('ok', true);
end $$;

-- Positions the driver's phone took: [{at, lat, lng, accuracy, kind}], up to
-- 500 at a time. Only those during one of his clocked times are kept.
create function public.driver_track(p_token text, p_points jsonb) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; n int;
begin
  v := app_private.driver_of(p_token);
  if jsonb_typeof(p_points) is distinct from 'array' or jsonb_array_length(p_points) > 500 then
    raise exception using message = 'Send at most 500 positions at a time.', errcode = 'P0001';
  end if;
  insert into public.route_points (entry_id, staff_id, at, lat, lng, accuracy, kind)
  select e.id, v.id, p.at, p.lat, p.lng, p.accuracy, p.kind
    from (select (x ->> 'at')::timestamptz as at, (x ->> 'lat')::double precision as lat,
                 (x ->> 'lng')::double precision as lng,
                 least(greatest((x ->> 'accuracy')::double precision, 0), 100000) as accuracy,
                 case when x ->> 'kind' = 'here' then 'here' else 'track' end as kind
            from jsonb_array_elements(p_points) x) p
    cross join lateral (select t.id from public.time_entries t
                         where t.staff_id = v.id and t.deleted_at is null
                           and p.at >= t.clock_in - interval '1 minute'
                           and p.at <= coalesce(t.clock_out, now()) + interval '1 minute'
                         order by t.clock_in desc limit 1) e
   where p.at <= now() + interval '2 minutes'
     and p.lat between -90 and 90 and p.lng between -180 and 180
  on conflict do nothing;
  get diagnostics n = row_count;
  return json_build_object('ok', true, 'saved', n);
end $$;

-- The driver's own screen: the restaurant, the places on the round, and where
-- he was today.
create function public.driver_today(p_token text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff; v_tz text; v_from timestamptz; v_ids uuid[];
begin
  v := app_private.driver_of(p_token);
  select coalesce(timezone, 'UTC') into v_tz from public.settings where id = 1;
  v_from := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  select coalesce(array_agg(id), '{}') into v_ids from public.time_entries
   where staff_id = v.id and deleted_at is null and coalesce(clock_out, now()) > v_from;
  return json_build_object('site', app_private.site_json(), 'checkpoints', app_private.checkpoints_json(),
                           'points', app_private.route_json(v_ids),
                           'visits', app_private.visits_json(app_private.mato_name(v), v_from, v_from + interval '1 day'));
end $$;

-- One driver's clocked times in a range (at most 8 days) with where he drove,
-- the places on the round, the restaurant, and every driver for the picker.
-- Without p_staff_id: the first active driver.
create function public.mgr_routes(p_token text, p_staff_id uuid, p_from timestamptz, p_to timestamptz) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff; v_ids uuid[]; v_staff uuid;
begin
  v := app_private.current_manager(p_token);
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '8 days' then
    raise exception using message = 'Pick a shorter date range.', errcode = 'P0001';
  end if;
  v_staff := coalesce(p_staff_id, (select id from public.staff where driver order by active desc, lower(name) limit 1));
  select coalesce(array_agg(id), '{}') into v_ids from public.time_entries
   where staff_id = v_staff and deleted_at is null and clock_in < p_to and coalesce(clock_out, now()) > p_from;
  return json_build_object(
    'staff_id', v_staff,
    'drivers', coalesce((select json_agg(json_build_object('id', id, 'name', name, 'avatar', avatar, 'active', active,
                                         'working', exists (select 1 from public.time_entries e
                                                             where e.staff_id = st.id and e.clock_out is null and e.deleted_at is null))
                                         order by active desc, lower(name))
                           from public.staff st where driver), '[]'::json),
    'site', app_private.site_json(),
    'checkpoints', app_private.checkpoints_json(),
    'entries', coalesce((select json_agg(json_build_object('id', e.id, 'clock_in', e.clock_in, 'clock_out', e.clock_out,
                                         'note', e.note, 'edited', e.edited,
                                         'pending', exists (select 1 from public.time_edits d where d.entry_id = e.id and d.status = 'pending'))
                                         order by e.clock_in)
                           from public.time_entries e where e.id = any(v_ids)), '[]'::json),
    'points', app_private.route_json(v_ids),
    'mato_name', (select app_private.mato_name(st) from public.staff st where st.id = v_staff),
    'visits', (select app_private.visits_json(app_private.mato_name(st), p_from, p_to) from public.staff st where st.id = v_staff),
    'mato', (select json_build_object('last_sync_at', m.last_sync_at, 'last_error', m.last_error, 'last_report', m.last_report)
               from app_private.mato m where m.id = 1));
end $$;

-- A place on the round; p_id null adds one.
create function public.mgr_save_checkpoint(p_token text, p_id uuid, p_name text, p_lat double precision,
                                           p_lng double precision, p_radius int) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; v_name text := app_private.clean_text(p_name, 80); v_id uuid;
begin
  v := app_private.current_manager(p_token);
  if v_name = '' then
    raise exception using message = 'Give the place a name.', errcode = 'P0001';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception using message = 'Pick where the place is.', errcode = 'P0001';
  end if;
  if p_radius is null or p_radius not between 20 and 1000 then
    raise exception using message = 'The zone around a place must be between 20 and 1000 metres.', errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.checkpoints (name, lat, lng, radius_m) values (v_name, p_lat, p_lng, p_radius) returning id into v_id;
  else
    update public.checkpoints set name = v_name, lat = p_lat, lng = p_lng, radius_m = p_radius
     where id = p_id and archived_at is null returning id into v_id;
    if v_id is null then
      raise exception using message = 'That place no longer exists.', errcode = 'P0001';
    end if;
  end if;
  return json_build_object('ok', true, 'id', v_id);
end $$;

create function public.mgr_archive_checkpoint(p_token text, p_id uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  update public.checkpoints set archived_at = now() where id = p_id and archived_at is null;
  return json_build_object('ok', true);
end $$;

-- Where the restaurant is, and how close a driver must be to clock in or out.
create function public.mgr_save_site(p_token text, p_lat double precision, p_lng double precision, p_radius int) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception using message = 'Pick where the restaurant is.', errcode = 'P0001';
  end if;
  if p_radius is null or p_radius not between 25 and 2000 then
    raise exception using message = 'The zone around the restaurant must be between 25 and 2000 metres.', errcode = 'P0001';
  end if;
  update public.settings set site_lat = p_lat, site_lng = p_lng, site_radius_m = p_radius where id = 1;
  return json_build_object('ok', true);
end $$;

-- Refills from MATO Info --------------------------------------------------------
-- MATO Info (the vending app, Supabase project bjzufmvwldoltpitkrvx) records
-- every refill: which machine, when, how many items, by whom. The Edge Function
-- mato (supabase/functions/mato) asks it every few minutes, through its one
-- read-only function public.prikklok_refill_visits and a secret, for the visits
-- of the last days, and keeps them here: a log of every machine visit. The
-- driver's round on Ritten comes from it; no app has to stay open.

create table app_private.mato (
  id           int primary key default 1 check (id = 1),
  url          text not null, -- MATO Info's Supabase address
  api_key      text not null, -- its publishable key (public anyway)
  secret       text not null, -- MATO Info keeps only its hash
  cron_secret  text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  last_sync_at timestamptz,
  last_error   text,
  last_report  jsonb
);

-- One visit to one machine: what MATO Info shows under Bijvullingen. A round's
-- stop is one visit; outside a round, changes within 30 minutes are one visit.
create table public.machine_visits (
  id         bigint generated always as identity primary key,
  visit_key  text not null unique, -- machine, filler and round (or start) in MATO Info
  machine_id uuid not null,        -- the machine in MATO Info
  machine    text not null,
  address    text,
  filler     text,                 -- who filled, as MATO Info names them
  first_at   timestamptz not null,
  last_at    timestamptz not null,
  added      int not null default 0, -- items put in
  removed    int not null default 0, -- items taken out (expired, damaged)
  via_adjust boolean not null default false, -- "Voorraad aanpassen" instead of a round
  round_no   int,
  round_done boolean,
  seen_at    timestamptz not null default now(), -- first logged here
  updated_at timestamptz not null default now()
);
create index machine_visits_filler_idx on public.machine_visits (lower(filler), first_at);
alter table public.machine_visits enable row level security;
revoke all on public.machine_visits from anon, authenticated;

-- The name a driver fills under in MATO Info.
create function app_private.mato_name(p public.staff) returns text
language sql immutable set search_path = public as $$
  select coalesce(nullif(btrim(p.mato_name), ''), split_part(p.name, ' ', 1))
$$;

create function app_private.visits_json(p_filler text, p_from timestamptz, p_to timestamptz) returns json
language sql stable set search_path = public as $$
  select coalesce(json_agg(json_build_object('id', id, 'machine', machine, 'address', address, 'first_at', first_at,
                                             'last_at', last_at, 'added', added, 'removed', removed, 'via_adjust', via_adjust,
                                             'round_no', round_no, 'round_done', round_done) order by first_at), '[]'::json)
    from public.machine_visits
   where lower(filler) = lower(p_filler) and first_at >= p_from and first_at < p_to
$$;

-- For the Edge Function: the visits MATO Info gave for [p_from, now). A visit
-- that started in the window's first hour may be cut off by it; the earlier
-- runs have it whole, so it is left as it is.
create function app_private.mato_store(p_visits json, p_from timestamptz) returns json
language plpgsql set search_path = public as $$
declare v json; k text; v_new boolean; n_new int := 0; n_upd int := 0;
        n int := json_array_length(coalesce(p_visits, '[]'::json));
begin
  for v in select * from json_array_elements(coalesce(p_visits, '[]'::json)) loop
    continue when (v ->> 'first_at')::timestamptz < p_from + interval '1 hour';
    k := concat_ws('|', v ->> 'machine_id', coalesce(v ->> 'filler', ''),
                   coalesce(v ->> 'round_id', 'v' || floor(extract(epoch from (v ->> 'first_at')::timestamptz))::bigint));
    insert into public.machine_visits as mv (visit_key, machine_id, machine, address, filler, first_at, last_at,
                                             added, removed, via_adjust, round_no, round_done)
    values (k, (v ->> 'machine_id')::uuid, coalesce(nullif(v ->> 'machine', ''), '?'), v ->> 'address', v ->> 'filler',
            (v ->> 'first_at')::timestamptz, (v ->> 'last_at')::timestamptz,
            coalesce((v ->> 'added')::int, 0), coalesce((v ->> 'removed')::int, 0),
            coalesce((v ->> 'via_adjust')::boolean, false), (v ->> 'round_no')::int, (v ->> 'round_done')::boolean)
    on conflict (visit_key) do update
       set machine = excluded.machine, address = excluded.address, last_at = excluded.last_at,
           added = excluded.added, removed = excluded.removed, via_adjust = excluded.via_adjust,
           round_no = excluded.round_no, round_done = excluded.round_done, updated_at = now()
     where (mv.machine, mv.address, mv.last_at, mv.added, mv.removed, mv.via_adjust, mv.round_no, mv.round_done)
           is distinct from (excluded.machine, excluded.address, excluded.last_at, excluded.added, excluded.removed,
                             excluded.via_adjust, excluded.round_no, excluded.round_done)
    returning (xmax = 0) into v_new;
    if found then
      if v_new then n_new := n_new + 1; else n_upd := n_upd + 1; end if;
    end if;
  end loop;
  update app_private.mato set last_sync_at = now(), last_error = null,
         last_report = jsonb_build_object('fetched', n, 'new', n_new, 'updated', n_upd)
   where id = 1;
  return json_build_object('fetched', n, 'new', n_new, 'updated', n_upd);
end $$;

-- For the Edge Function: MATO Info could not be read.
create function app_private.mato_failed(p_error text) returns boolean
language sql set search_path = public as $$
  update app_private.mato set last_error = left(p_error, 300) where id = 1 returning true
$$;

revoke all on all functions in schema app_private from public, anon, authenticated;

-- Keep the route by GPS too (the app must then stay open during the round).
create function public.mgr_save_track_route(p_token text, p_on boolean) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  update public.settings set track_route = coalesce(p_on, false) where id = 1;
  return json_build_object('ok', true);
end $$;

-- The name a driver fills under in MATO Info; empty = the first name.
create function public.mgr_set_mato_name(p_token text, p_id uuid, p_name text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; s public.staff;
begin
  v := app_private.current_manager(p_token);
  update public.staff set mato_name = nullif(app_private.clean_text(p_name, 60), '')
   where id = p_id and driver returning * into s;
  if not found then
    raise exception using message = 'That person wasn''t found.', errcode = 'P0001';
  end if;
  return json_build_object('ok', true, 'mato_name', app_private.mato_name(s));
end $$;

revoke all on all functions in schema app_private from public, anon, authenticated;

-- ------------------------------------------------------- quiz of the week

-- This week's Monday, in the restaurant's time zone.
create function app_private.quiz_week() returns date
language sql stable set search_path = public as $$
  select date_trunc('week', now() at time zone coalesce((select timezone from public.settings where id = 1), 'UTC'))::date
$$;

-- Who takes the quiz: staff, not managers (they write it), drivers or family.
create function app_private.takes_quiz(p public.staff) returns boolean
language sql immutable set search_path = public as $$
  select p.active and not p.view_only and not p.driver and p.role <> 'manager'
$$;

-- A quiz as one person sees it. The right answer and the explanation come
-- only with their own answer, or for all questions once the week is over.
create function app_private.quiz_for(p_quiz uuid, p_staff uuid, p_reveal boolean) returns json
language sql stable set search_path = public as $$
  select json_build_object('id', z.id, 'week_start', z.week_start, 'title', z.title, 'xp', z.xp_per_question,
    'questions', coalesce((select json_agg(json_build_object(
        'id', q.id, 'question', q.question, 'options', q.options, 'choice', a.choice,
        'correct', case when a.choice is not null or p_reveal then q.correct end,
        'explanation', case when a.choice is not null or p_reveal then q.explanation end) order by q.position)
      from public.quiz_questions q
      left join public.quiz_answers a on a.question_id = q.id and a.staff_id = p_staff
     where q.quiz_id = z.id and q.archived_at is null), '[]'::json))
    from public.quizzes z where z.id = p_quiz
$$;

-- How many questions a quiz has, how many one person answered, and how many right.
create function app_private.quiz_score(p_quiz uuid, p_staff uuid) returns table (total int, answered int, right_n int)
language sql stable set search_path = public as $$
  select count(*)::int, count(a.choice)::int, (count(*) filter (where a.choice = q.correct))::int
    from public.quiz_questions q
    left join public.quiz_answers a on a.question_id = q.id and a.staff_id = p_staff
   where q.quiz_id = p_quiz and q.archived_at is null
$$;

revoke all on all functions in schema app_private from public, anon, authenticated;

-- This week's quiz, and the earlier ones since the person started.
create function public.my_quiz(p_token text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff; v_week date := app_private.quiz_week(); v_id uuid;
begin
  v := app_private.current_staff(p_token);
  if not app_private.takes_quiz(v) then
    return json_build_object('takes', false);
  end if;
  select id into v_id from public.quizzes where week_start = v_week and archived_at is null;
  return json_build_object('takes', true, 'week_start', v_week,
    'current', case when v_id is not null then app_private.quiz_for(v_id, v.id, false) end,
    'past', coalesce((select json_agg(json_build_object('id', z.id, 'week_start', z.week_start, 'title', z.title,
        'total', n.total, 'answered', n.answered, 'right', n.right_n, 'xp', n.right_n * z.xp_per_question) order by z.week_start desc)
      from (select * from public.quizzes
             where archived_at is null and week_start < v_week and week_start + 7 > v.created_at::date
             order by week_start desc limit 26) z
      cross join lateral app_private.quiz_score(z.id, v.id) n), '[]'::json));
end $$;

-- An earlier quiz, with all the right answers.
create function public.my_past_quiz(p_token text, p_id uuid) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_staff(p_token);
  if not exists (select 1 from public.quizzes where id = p_id and archived_at is null and week_start < app_private.quiz_week()) then
    raise exception using message = 'That quiz wasn''t found.', errcode = 'P0001';
  end if;
  return app_private.quiz_for(p_id, v.id, true);
end $$;

-- One answer, once. Says whether it was right, with the right answer.
create function public.answer_quiz(p_token text, p_question uuid, p_choice int) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; q public.quiz_questions; z public.quizzes;
begin
  v := app_private.current_staff(p_token);
  if not app_private.takes_quiz(v) then
    raise exception using message = 'Not allowed.', errcode = 'P0001';
  end if;
  select * into q from public.quiz_questions where id = p_question and archived_at is null;
  if found then
    select * into z from public.quizzes where id = q.quiz_id and archived_at is null;
  end if;
  if z.id is null then
    raise exception using message = 'That question wasn''t found.', errcode = 'P0001';
  end if;
  if z.week_start <> app_private.quiz_week() then
    raise exception using message = 'This quiz is closed.', errcode = 'P0001';
  end if;
  if p_choice is null or p_choice < 0 or p_choice >= cardinality(q.options) then
    raise exception using message = 'Pick an answer.', errcode = 'P0001';
  end if;
  insert into public.quiz_answers (question_id, staff_id, choice) values (q.id, v.id, p_choice)
    on conflict do nothing;
  if not found then
    raise exception using message = 'You already answered this question.', errcode = 'P0001';
  end if;
  return json_build_object('right', p_choice = q.correct, 'correct', q.correct, 'explanation', q.explanation,
                           'xp', case when p_choice = q.correct then z.xp_per_question else 0 end);
end $$;

-- All quizzes, newest week first, with how many took part.
create function public.mgr_quizzes(p_token text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  return json_build_object('week_start', app_private.quiz_week(),
    'takers', (select count(*) from public.staff s where app_private.takes_quiz(s)),
    'quizzes', coalesce((select json_agg(json_build_object('id', z.id, 'week_start', z.week_start, 'title', z.title,
        'xp', z.xp_per_question, 'questions', n.questions, 'people', n.people, 'right_pct', n.right_pct) order by z.week_start desc)
      from public.quizzes z
      cross join lateral (
        select (select count(*) from public.quiz_questions where quiz_id = z.id and archived_at is null)::int as questions,
               count(distinct a.staff_id)::int as people,
               round(100.0 * count(*) filter (where a.choice = q.correct) / nullif(count(*), 0))::int as right_pct
          from public.quiz_questions q join public.quiz_answers a on a.question_id = q.id
         where q.quiz_id = z.id and q.archived_at is null) n
     where z.archived_at is null), '[]'::json));
end $$;

-- One quiz with the right answers, and the results: per question how many
-- picked each answer, per person their score, and who hasn't taken it yet.
create function public.mgr_quiz(p_token text, p_id uuid) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare v public.staff; z public.quizzes;
begin
  v := app_private.current_manager(p_token);
  select * into z from public.quizzes where id = p_id and archived_at is null;
  if not found then
    raise exception using message = 'That quiz wasn''t found.', errcode = 'P0001';
  end if;
  return json_build_object('id', z.id, 'week_start', z.week_start, 'title', z.title, 'xp', z.xp_per_question,
    'current_week', app_private.quiz_week(),
    'questions', coalesce((select json_agg(json_build_object(
        'id', q.id, 'question', q.question, 'options', q.options, 'correct', q.correct, 'explanation', q.explanation,
        'answers', (select count(*) from public.quiz_answers where question_id = q.id),
        'picked', (select array_agg((select count(*) from public.quiz_answers a where a.question_id = q.id and a.choice = i - 1) order by i)
                     from generate_subscripts(q.options, 1) i)) order by q.position)
      from public.quiz_questions q where q.quiz_id = z.id and q.archived_at is null), '[]'::json),
    'people', coalesce((select json_agg(json_build_object('id', s.id, 'name', s.name, 'avatar', s.avatar,
        'answered', n.answered, 'right', n.right_n, 'xp', n.right_n * z.xp_per_question,
        'at', (select max(a.answered_at) from public.quiz_answers a join public.quiz_questions q on q.id = a.question_id
                where q.quiz_id = z.id and a.staff_id = s.id)) order by n.right_n desc, lower(s.name))
      from public.staff s cross join lateral app_private.quiz_score(z.id, s.id) n
     where n.answered > 0), '[]'::json),
    'missing', coalesce((select json_agg(json_build_object('id', s.id, 'name', s.name, 'avatar', s.avatar) order by lower(s.name))
      from public.staff s
     where app_private.takes_quiz(s)
       and not exists (select 1 from public.quiz_answers a join public.quiz_questions q on q.id = a.question_id
                        where q.quiz_id = z.id and a.staff_id = s.id)), '[]'::json));
end $$;

-- Makes or changes a quiz. p_questions: [{id?, question, options[], correct,
-- explanation?}] in order. Once a question has answers its text and right
-- answer can still change (everyone's XP follows), but not its number of
-- answers, and it can't be removed. Questions left out are archived.
create function public.mgr_save_quiz(p_token text, p_id uuid, p_week date, p_title text, p_xp int, p_questions jsonb) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff; z public.quizzes; old public.quiz_questions; qj jsonb; i int := 0; v_ids uuid[] := '{}';
  v_text text; v_opts text[]; v_correct int; v_expl text; v_qid uuid;
begin
  v := app_private.current_manager(p_token);
  if p_week is null or extract(isodow from p_week) <> 1 then
    raise exception using message = 'Pick a week.', errcode = 'P0001';
  end if;
  if p_xp is null or p_xp not between 1 and 100 then
    raise exception using message = 'The XP per right answer must be between 1 and 100.', errcode = 'P0001';
  end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception using message = 'Add at least one question.', errcode = 'P0001';
  end if;
  if jsonb_array_length(p_questions) > 30 then
    raise exception using message = 'A quiz has at most 30 questions.', errcode = 'P0001';
  end if;
  if p_id is not null then
    select * into z from public.quizzes where id = p_id and archived_at is null for update;
    if not found then
      raise exception using message = 'That quiz wasn''t found.', errcode = 'P0001';
    end if;
  end if;
  if z.id is null or z.week_start <> p_week then
    if z.id is not null and exists (select 1 from public.quiz_answers a join public.quiz_questions q on q.id = a.question_id where q.quiz_id = z.id) then
      raise exception using message = 'People already answered this quiz, so it stays in its week.', errcode = 'P0001';
    end if;
    if p_week < app_private.quiz_week() then
      raise exception using message = 'That week is over.', errcode = 'P0001';
    end if;
    if exists (select 1 from public.quizzes where week_start = p_week and archived_at is null and id is distinct from z.id) then
      raise exception using message = 'There is already a quiz for that week.', errcode = 'P0001';
    end if;
  end if;
  if z.id is null then
    insert into public.quizzes (week_start, title, xp_per_question, created_by)
    values (p_week, nullif(app_private.clean_text(p_title, 80), ''), p_xp, v.id) returning * into z;
  else
    update public.quizzes set week_start = p_week, title = nullif(app_private.clean_text(p_title, 80), ''), xp_per_question = p_xp
     where id = z.id returning * into z;
  end if;
  for qj in select value from jsonb_array_elements(p_questions) loop
    i := i + 1;
    v_text := app_private.clean_text(qj ->> 'question', 300);
    if v_text = '' then
      raise exception using message = format('Question %s: write the question.', i), errcode = 'P0001';
    end if;
    v_opts := case when jsonb_typeof(qj -> 'options') = 'array'
      then array(select app_private.clean_text(o, 120) from jsonb_array_elements_text(qj -> 'options') with ordinality t(o, n) order by n) end;
    if v_opts is null or cardinality(v_opts) not between 2 and 6 or '' = any(v_opts) then
      raise exception using message = format('Question %s: give 2 to 6 answers, none empty.', i), errcode = 'P0001';
    end if;
    if (select count(distinct lower(o)) from unnest(v_opts) o) < cardinality(v_opts) then
      raise exception using message = format('Question %s: two answers are the same.', i), errcode = 'P0001';
    end if;
    v_correct := case when jsonb_typeof(qj -> 'correct') = 'number' then (qj ->> 'correct')::numeric::int end;
    if v_correct is null or v_correct < 0 or v_correct >= cardinality(v_opts) then
      raise exception using message = format('Question %s: mark the right answer.', i), errcode = 'P0001';
    end if;
    v_expl := nullif(app_private.clean_text(qj ->> 'explanation', 300), '');
    v_qid := null;
    if coalesce(qj ->> 'id', '') <> '' then
      select * into old from public.quiz_questions
       where id::text = qj ->> 'id' and quiz_id = z.id and archived_at is null for update;
      if not found then
        raise exception using message = format('Question %s wasn''t found. Reload the page.', i), errcode = 'P0001';
      end if;
      if cardinality(old.options) <> cardinality(v_opts) and exists (select 1 from public.quiz_answers where question_id = old.id) then
        raise exception using errcode = 'P0001',
          message = format('Question %s was already answered: you can still change the text and the right answer, but not the number of answers.', i);
      end if;
      update public.quiz_questions set position = i, question = v_text, options = v_opts, correct = v_correct, explanation = v_expl
       where id = old.id returning id into v_qid;
    else
      insert into public.quiz_questions (quiz_id, position, question, options, correct, explanation)
      values (z.id, i, v_text, v_opts, v_correct, v_expl) returning id into v_qid;
    end if;
    v_ids := v_ids || v_qid;
  end loop;
  if exists (select 1 from public.quiz_questions q
              where q.quiz_id = z.id and q.archived_at is null and not (q.id = any (v_ids))
                and exists (select 1 from public.quiz_answers a where a.question_id = q.id)) then
    raise exception using message = 'A question that was already answered can''t be removed.', errcode = 'P0001';
  end if;
  update public.quiz_questions set archived_at = now()
   where quiz_id = z.id and archived_at is null and not (id = any (v_ids));
  return json_build_object('ok', true, 'id', z.id);
end $$;

-- Archives a quiz nobody answered yet.
create function public.mgr_remove_quiz(p_token text, p_id uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff;
begin
  v := app_private.current_manager(p_token);
  if exists (select 1 from public.quiz_answers a join public.quiz_questions q on q.id = a.question_id where q.quiz_id = p_id) then
    raise exception using message = 'People already answered this quiz, so it can''t be removed.', errcode = 'P0001';
  end if;
  update public.quizzes set archived_at = now() where id = p_id and archived_at is null;
  if not found then
    raise exception using message = 'That quiz wasn''t found.', errcode = 'P0001';
  end if;
  return json_build_object('ok', true);
end $$;

revoke all on all functions in schema app_private from public, anon, authenticated;
