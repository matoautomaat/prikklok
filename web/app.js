'use strict';

/* Prikklok — staff pick shifts, clock in and out, and fix their times;
   managers schedule, approve fixes, upload payslips and read the monthly hours.
   All data goes through the Supabase RPC functions in supabase/schema.sql.
   The interface is in Dutch (Belgium); server messages are translated in tr(). */

const CFG = window.STAFF_CONFIG;
const TOKEN_KEY = 'shiftclock.token';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } },
};

const S = {
  token: store.get(TOKEN_KEY),
  me: null,
  settings: { business_name: '', drop_cutoff_hours: 24, grace_minutes: 5, currency: '€' },
  openEntry: null,
  nextShifts: [],
  pending: 0,
  offset: 0,           // server clock minus device clock, ms
  view: null,
  month: null,         // first day of the month being viewed
  staff: null,         // manager's team list
  poll: null,
  renderSeq: 0,
};

/* ------------------------------------------------- server messages in Dutch */

const SERVER_NL = {
  'A shift can be at most 24 hours long.': 'Een shift mag maximaal 24 uur duren.',
  'A shift must end after it starts.': 'Een shift moet eindigen na het begin.',
  'Add a short reason so your manager knows what happened.': 'Geef een korte reden, zodat je verantwoordelijke weet wat er gebeurd is.',
  'Add between 1 and 60 dates at a time.': 'Voeg 1 tot 60 data tegelijk toe.',
  'Check the hourly rate.': 'Controleer het uurloon.',
  'Check-out must be after check-in.': 'Uitklokken moet na het inklokken komen.',
  'Drop cutoff must be between 0 and 336 hours.': 'De termijn moet tussen 0 en 336 uur liggen.',
  'Enter a check-in time.': 'Vul een inkloktijd in.',
  'Enter a check-out time.': 'Vul een uitkloktijd in.',
  'Enter a name (up to 60 characters).': 'Vul een naam in (maximaal 60 tekens).',
  'Enter start and end times like 17:30.': 'Vul een begin- en einduur in, bijvoorbeeld 17:30.',
  'Grace period must be between 0 and 120 minutes.': 'De speling moet tussen 0 en 120 minuten liggen.',
  'Number of people must be between 1 and 20.': 'Het aantal personen moet tussen 1 en 20 liggen.',
  "One entry can't be longer than 24 hours.": 'Eén registratie mag niet langer dan 24 uur zijn.',
  'Only managers can do that.': 'Alleen een verantwoordelijke kan dat doen.',
  'PIN must be 4 to 8 digits.': 'De pincode moet 4 tot 8 cijfers hebben.',
  'People needed must be between 1 and 20.': 'Het aantal personen moet tussen 1 en 20 liggen.',
  'Pick a date range up to a year long.': 'Kies een periode van maximaal een jaar.',
  'Pick a month.': 'Kies een maand.',
  'Pick a role.': 'Kies een rol.',
  'Pick a shorter date range.': 'Kies een kortere periode.',
  'Pick a team member.': 'Kies een medewerker.',
  'Pick an active team member.': 'Kies een actieve medewerker.',
  'Pick at least one day.': 'Kies minstens één dag.',
  'Someone else already picked up this shift.': 'Iemand anders heeft deze shift al opgenomen.',
  'Someone on the team already has that name. Try adding a last initial.': 'Iemand in het team heeft die naam al. Voeg bijvoorbeeld de eerste letter van de achternaam toe.',
  "Start and end can't be the same time.": 'Begin en einde kunnen niet hetzelfde uur zijn.',
  "That file couldn't be read. Try again.": 'Dat bestand kon niet gelezen worden. Probeer opnieuw.',
  'That file is empty.': 'Dat bestand is leeg.',
  'That file is over 4 MB. Save it as a smaller PDF and try again.': 'Dat bestand is groter dan 4 MB. Bewaar het als een kleinere pdf en probeer opnieuw.',
  "That isn't one of your shifts.": 'Dat is geen shift van jou.',
  "That name and PIN don't match.": 'Naam en pincode komen niet overeen.',
  "That payslip isn't available.": 'Die loonfiche is niet beschikbaar.',
  "That person wasn't found.": 'Die persoon werd niet gevonden.',
  'That shift no longer exists.': 'Die shift bestaat niet meer.',
  'That standard shift no longer exists.': 'Die vaste shift bestaat niet meer.',
  'That time entry no longer exists.': 'Die registratie bestaat niet meer.',
  'That time entry was removed.': 'Die registratie werd verwijderd.',
  "That time entry wasn't found.": 'Die registratie werd niet gevonden.',
  "That time zone isn't recognised.": 'Die tijdzone is onbekend.',
  'The team needs at least one active manager.': 'Het team heeft minstens één actieve verantwoordelijke nodig.',
  "These times don't fit the entry any more. Edit it directly in Monthly.": 'Deze uren passen niet meer bij de registratie. Pas ze rechtstreeks aan in Overzicht.',
  'This app is already set up. Sign in instead.': 'De app is al ingesteld. Meld je aan.',
  'This overlaps a shift you already have.': 'Dit overlapt met een shift die je al hebt.',
  'This person is already checked in. Close that entry first.': 'Deze persoon is al ingeklokt. Sluit eerst die registratie af.',
  'This person is checked in right now. Check them out first.': 'Deze persoon is nu ingeklokt. Klok die persoon eerst uit.',
  'This request was already handled.': 'Deze aanvraag is al behandeld.',
  'This shift is already over.': 'Deze shift is al voorbij.',
  "Times can't be in the future.": 'Uren kunnen niet in de toekomst liggen.',
  'Upload a PDF, PNG or JPG file.': 'Upload een pdf-, png- of jpg-bestand.',
  "You're already checked in.": 'Je bent al ingeklokt.',
  "You're not checked in.": 'Je bent niet ingeklokt.',
  'Your sign-in has expired. Please sign in again.': 'Je bent afgemeld. Meld je opnieuw aan.',
  'Pick a valid contract type.': 'Kies een geldig statuut.',
  'The employee number can be at most 30 characters.': 'Het werknemersnummer mag maximaal 30 tekens hebben.',
  'Wage codes must be short texts.': 'Looncodes moeten korte teksten zijn (maximaal 20 tekens).',
};
const SERVER_NL_PATTERNS = [
  [/^(.+) already has a shift that overlaps one of these\.$/, '$1 heeft al een shift die met een van deze overlapt.'],
  [/^(.+) already has a shift that overlaps\.$/, '$1 heeft op dat moment al een shift.'],
  [/^Shifts can't be dropped less than (\d+) hours before they start\. Ask your manager\.$/, 'Je kan een shift niet meer teruggeven minder dan $1 uur voor het begin. Vraag het aan je verantwoordelijke.'],
  [/^Too many wrong PINs\. Try again in (\d+) min, or ask your manager to reset your PIN\.$/, 'Te vaak een verkeerde pincode. Probeer opnieuw over $1 min, of vraag je verantwoordelijke om een nieuwe pincode.'],
];
function tr(msg) {
  if (!msg) return msg;
  if (SERVER_NL[msg]) return SERVER_NL[msg];
  for (const [re, nl] of SERVER_NL_PATTERNS) if (re.test(msg)) return msg.replace(re, nl);
  return msg;
}

/* ----------------------------------------------------------------- api */

class AppError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

async function rpc(fn, args = {}, { auth = true } = {}) {
  const body = auth ? { p_token: S.token, ...args } : args;
  const headers = { 'Content-Type': 'application/json', apikey: CFG.key };
  if (CFG.key.startsWith('ey')) headers.Authorization = 'Bearer ' + CFG.key;
  let res;
  try {
    res = await fetch(`${CFG.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch {
    throw new AppError('Kan de server niet bereiken. Controleer je verbinding en probeer opnieuw.', 'network');
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) {
    if (data && data.code === '28000') {
      signOut({ silent: true });
      throw new AppError(tr(data.message), 'auth');
    }
    throw new AppError(tr(data && data.message) || `Er ging iets mis (fout ${res.status}).`);
  }
  return data;
}

async function refreshMe() {
  const r = await rpc('get_me');
  S.me = r.me;
  S.settings = r.settings;
  S.openEntry = r.open_entry;
  S.nextShifts = r.next_shifts || [];
  S.pending = r.pending_requests || 0;
  S.offset = new Date(r.server_time).getTime() - Date.now();
  updateBadges();
  return r;
}

/* --------------------------------------------------------------- dates */

const LOCALE = 'nl-BE';
const HM = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
const now = () => new Date(Date.now() + S.offset);
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = d => { const x = startOfDay(d); return addDays(x, -x.getDay()); };
const startOfMonth = d => { const x = startOfDay(d); x.setDate(1); return x; };
const addMonths = (d, n) => { const x = startOfMonth(d); x.setMonth(x.getMonth() + n); return x; };
const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
const minutesBetween = (a, b) => (new Date(b) - new Date(a)) / 60000;
const pad = n => String(n).padStart(2, '0');
const toDateInput = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeInput = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
function atTime(day, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const x = new Date(day); x.setHours(h, m, 0, 0); return x;
}

// Date and time fields are plain selects and text boxes, so they read the same
// (Dutch, 24-hour) on every phone whatever language it is set to.
const dayLabel = d => d.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
function dateField(id, selected, from, to) {
  const sel = toDateInput(selected), opts = [];
  for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) opts.push(d);
  if (!opts.some(d => toDateInput(d) === sel)) opts.push(startOfDay(selected));
  opts.sort((a, b) => a - b);
  return `<select id="${id}">${opts.map(d => `<option value="${toDateInput(d)}" ${toDateInput(d) === sel ? 'selected' : ''}>${dayLabel(d)}</option>`).join('')}</select>`;
}
function timeField(id, value, { required = true } = {}) {
  return `<input id="${id}" class="time-field" inputmode="numeric" maxlength="5" autocomplete="off" spellcheck="false" placeholder="uu:mm" value="${value || ''}" ${required ? 'required' : ''}>`;
}
// "17:30", "1730", "17.30", "17u30", "9:05" -> "17:30"; anything else -> null
function parseHM(v) {
  const m = String(v || '').trim().match(/^(\d{1,2})[:.hu ]?(\d{2})$/i);
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return `${pad(+m[1])}:${m[2]}`;
}
// A day plus start and end times; an end at or before the start means the next day.
function spanFor(dateStr, start, end) {
  const day = new Date(dateStr + 'T00:00');
  const a = atTime(day, start);
  let b = end ? atTime(day, end) : null;
  if (b && b <= a) b = atTime(addDays(day, 1), end);
  return { a, b };
}
document.addEventListener('focusout', e => {
  if (e.target.matches && e.target.matches('.time-field')) { const v = parseHM(e.target.value); if (v) e.target.value = v; }
});

const num = (n, digits) => Number(n).toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmt = {
  time: d => new Date(d).toLocaleTimeString(LOCALE, HM),
  clock: d => new Date(d).toLocaleTimeString(LOCALE, HM),
  day: d => new Date(d).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' }),
  dayLong: d => new Date(d).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }),
  month: d => new Date(d).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' }),
  monthName: d => new Date(d).toLocaleDateString(LOCALE, { month: 'long' }),
  short: d => new Date(d).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }),
  range: (a, b) => `${fmt.time(a)} – ${fmt.time(b)}`,
  when(d) {
    const x = new Date(d), today = now();
    if (sameDay(x, today)) return `vandaag ${fmt.time(x)}`;
    if (sameDay(x, addDays(today, 1))) return `morgen ${fmt.time(x)}`;
    if (sameDay(x, addDays(today, -1))) return `gisteren ${fmt.time(x)}`;
    return `${fmt.day(x)} ${fmt.time(x)}`;
  },
  dur(mins) {
    const t = Math.max(0, Math.round(mins));
    const h = Math.floor(t / 60), m = t % 60;
    return h ? `${h}u ${pad(m)}m` : `${m}m`;
  },
  hours: mins => num(Math.round(mins / 6) / 10, 1),
  hours2: mins => num(Math.round(mins / 0.6) / 100, 2),
  money: n => `${S.settings.currency || '€'} ${num(n, 2)}`,
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* -------------------------------------------------------------- helpers */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
const isManager = () => S.me && S.me.role === 'manager';

let toastTimer;
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = kind;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, kind === 'error' ? 6000 : 3200);
}

async function busy(btn, fn) {
  if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = 'Bezig…'; }
  try { return await fn(); }
  catch (e) { if (e.code !== 'auth') toast(e.message, 'error'); throw e; }
  finally { if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = btn.dataset.label; } }
}
const quiet = p => p.catch(() => {});

const ICONS = {
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  shifts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  hours: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><circle cx="18" cy="8" r="2"/><path d="M17 14c2 0 4 1.5 4 4"/></svg>',
  monthly: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  requests: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4h16v12H8l-4 4z"/><path d="M9 9l2 2 4-4"/></svg>',
  team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
};

function tabsFor() {
  return isManager()
    ? [['today', 'Vandaag'], ['schedule', 'Planning'], ['monthly', 'Overzicht'], ['requests', 'Aanvragen'], ['team', 'Team']]
    : [['clock', 'Klok'], ['shifts', 'Shiften'], ['hours', 'Mijn uren']];
}
const ICON_FOR = { clock: 'clock', shifts: 'shifts', hours: 'hours', today: 'today', schedule: 'shifts', monthly: 'monthly', requests: 'requests', team: 'team' };

/* --------------------------------------------------------------- modal */

const modal = {
  open(html, onMount) {
    const d = $('#modal');
    d.innerHTML = `<div class="modal-body">${html}</div>`;
    $$('[data-close]', d).forEach(b => b.addEventListener('click', () => modal.close()));
    if (!d.open) d.showModal();
    onMount && onMount(d);
    const first = $('input:not([type=hidden]), select, textarea', d);
    if (first) first.focus();
    return d;
  },
  close() { const d = $('#modal'); if (d.open) d.close(); d.innerHTML = ''; },
  confirm({ title, body = '', ok = 'Bevestigen', danger = false }) {
    return new Promise(resolve => {
      let done = false;
      const finish = v => { if (!done) { done = true; resolve(v); } };
      const d = modal.open(`
        <h2 id="modal-title">${esc(title)}</h2>
        ${body ? `<p>${body}</p>` : ''}
        <div class="form-actions">
          <button type="button" data-close>Annuleren</button>
          <button type="button" class="${danger ? 'danger solid' : 'primary'}" id="confirm-ok">${esc(ok)}</button>
        </div>`);
      $('#confirm-ok', d).addEventListener('click', () => { finish(true); modal.close(); });
      d.addEventListener('close', () => finish(false), { once: true });
    });
  },
};

/* ------------------------------------------------------------ app shell */

function renderAuthShell(html) {
  stopPolling();
  $('#app').innerHTML = `<main class="auth"><div class="auth-card">${html}</div></main>`;
}

function loadError(e) {
  renderAuthShell(`<div class="card"><h1>Kan niet laden</h1><p>${esc(e.message)}</p><button class="primary" id="reload">Opnieuw proberen</button></div>`);
  $('#reload').addEventListener('click', () => location.reload());
}

async function boot() {
  if (!CFG || !CFG.url) {
    $('#app').innerHTML = '<main class="auth"><div class="auth-card"><div class="card"><h1>Nog niet ingesteld</h1><p>In config.js ontbreekt het Supabase-adres.</p></div></div></main>';
    return;
  }
  if (S.token) {
    try {
      await refreshMe();
      renderShell();
      return;
    } catch (e) {
      if (e.code === 'auth') return; // rpc() already showed the sign-in screen
      loadError(e);
      return;
    }
  }
  await showSignIn();
}

async function showSignIn(message) {
  let status = { setup_needed: false, business_name: '' };
  try { status = await rpc('app_status', {}, { auth: false }); }
  catch (e) { loadError(e); return; }
  document.title = status.business_name ? `${status.business_name} · Prikklok` : 'Prikklok';
  if (status.setup_needed) return showSetup();

  renderAuthShell(`
    <div class="brand"><span class="mark" aria-hidden="true"></span><span class="section-label">Prikklok</span></div>
    <div>
      <h1>${esc(status.business_name)}</h1>
      <p class="lede">Meld je aan om in te klokken, shiften op te nemen en je uren te bekijken.</p>
    </div>
    <form class="card" id="login-form" novalidate>
      ${message ? `<p class="hint info">${esc(message)}</p>` : ''}
      <div class="field">
        <label for="login-name">Je naam</label>
        <input id="login-name" name="name" autocomplete="username" autocapitalize="words" required>
      </div>
      <div class="field">
        <label for="login-pin">Pincode</label>
        <input id="login-pin" name="pin" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="current-password" required>
      </div>
      <button type="submit" class="primary">Aanmelden</button>
      <p class="form-error" id="login-error"></p>
    </form>
    <p class="muted small">Pincode vergeten? Vraag je verantwoordelijke om een nieuwe.</p>`);

  const form = $('#login-form');
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('#login-error');
    err.textContent = '';
    const name = form.name.value.trim(), pin = form.pin.value.trim();
    if (!name || !pin) { err.textContent = 'Vul je naam en pincode in.'; return; }
    const btn = $('button[type=submit]', form);
    btn.disabled = true; btn.textContent = 'Bezig met aanmelden…';
    try {
      const r = await rpc('login', { p_name: name, p_pin: pin }, { auth: false });
      if (!r.ok) { err.textContent = tr(r.error); form.pin.value = ''; form.pin.focus(); return; }
      setToken(r.token);
      await refreshMe();
      location.hash = '';
      renderShell();
    } catch (e) {
      err.textContent = e.message;
    } finally {
      if (btn.isConnected) { btn.disabled = false; btn.textContent = 'Aanmelden'; }
    }
  });
}

function showSetup() {
  renderAuthShell(`
    <div class="brand"><span class="mark" aria-hidden="true"></span><span class="section-label">Prikklok</span></div>
    <div>
      <h1>Stel je prikklok in</h1>
      <p class="lede">Jij wordt de verantwoordelijke. Daarna kan je je personeel toevoegen, shiften plannen en de link delen.</p>
    </div>
    <form class="card" id="setup-form" novalidate>
      <div class="field">
        <label for="setup-biz">Naam van de zaak</label>
        <input id="setup-biz" name="biz" maxlength="80" placeholder="bv. Café De Haven" required>
      </div>
      <div class="field">
        <label for="setup-name">Je naam</label>
        <input id="setup-name" name="name" maxlength="60" autocomplete="name" required>
        <span class="help">Hiermee meld je je aan.</span>
      </div>
      <div class="form-grid">
        <div class="field">
          <label for="setup-pin">Kies een pincode</label>
          <input id="setup-pin" name="pin" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password" required>
        </div>
        <div class="field">
          <label for="setup-pin2">Herhaal je pincode</label>
          <input id="setup-pin2" name="pin2" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password" required>
        </div>
      </div>
      <p class="help muted small">4 tot 8 cijfers. Verantwoordelijken gebruiken best 6 of meer.</p>
      <button type="submit" class="primary">Maak mijn account aan</button>
      <p class="form-error" id="setup-error"></p>
    </form>`);
  const form = $('#setup-form');
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('#setup-error');
    err.textContent = '';
    const biz = form.biz.value.trim(), name = form.name.value.trim(), pin = form.pin.value.trim();
    if (!biz || !name) { err.textContent = 'Vul de naam van de zaak en je naam in.'; return; }
    if (!/^\d{4,8}$/.test(pin)) { err.textContent = 'De pincode moet 4 tot 8 cijfers hebben.'; return; }
    if (pin !== form.pin2.value.trim()) { err.textContent = 'De twee pincodes zijn niet gelijk.'; return; }
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    try {
      const r = await rpc('setup_first_manager', { p_business_name: biz, p_name: name, p_pin: pin }, { auth: false });
      setToken(r.token);
      await refreshMe();
      location.hash = 'team';
      renderShell();
      toast('Klaar! Voeg hieronder je team toe.');
    } catch (e) {
      err.textContent = e.message;
      btn.disabled = false;
    }
  });
}

function setToken(t) { S.token = t; store.set(TOKEN_KEY, t); }

async function signOut({ silent = false } = {}) {
  const t = S.token;
  setToken(null);
  S.me = null; S.staff = null;
  $('#toast').hidden = true;
  stopPolling();
  if (!silent && t) quiet(rpc('logout', { p_token: t }, { auth: false }));
  await showSignIn(silent ? 'Je bent afgemeld. Meld je opnieuw aan.' : '');
}

function renderShell() {
  const tabs = tabsFor();
  document.title = `${S.settings.business_name} · Prikklok`;
  $('#app').innerHTML = `
    <header class="topbar">
      <div class="topbar-inner">
        <div class="brand">
          <span class="mark" aria-hidden="true"></span>
          <div class="brand-text">
            <div class="biz">${esc(S.settings.business_name)}</div>
            <div class="who">${esc(S.me.name)}${isManager() ? ' · Verantwoordelijke' : ''}</div>
          </div>
        </div>
        <button class="ghost sm" id="signout">Afmelden</button>
      </div>
      <nav class="tabs" aria-label="Onderdelen"><div class="tabs-inner">
        ${tabs.map(([k, l]) => `<button class="tab" data-tab="${k}">${l}${k === 'requests' ? '<span class="count" data-badge hidden></span>' : ''}</button>`).join('')}
      </div></nav>
    </header>
    <main class="view" id="view"></main>
    <nav class="bnav" aria-label="Onderdelen">
      ${tabs.map(([k, l]) => `<button data-tab="${k}">${ICONS[ICON_FOR[k]]}<span>${l}</span>${k === 'requests' ? '<span class="count" data-badge hidden></span>' : ''}</button>`).join('')}
    </nav>`;
  $('#signout').addEventListener('click', async () => {
    if (await modal.confirm({ title: 'Afmelden?', body: 'Je hebt je naam en pincode nodig om je opnieuw aan te melden.', ok: 'Afmelden' })) signOut();
  });
  $$('[data-tab]').forEach(b => b.addEventListener('click', () => { location.hash = b.dataset.tab; }));
  updateBadges();
  route();
  if (isManager() && !S.settings.timezone) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) quiet(rpc('mgr_set_timezone', { p_tz: tz }).then(() => { S.settings.timezone = tz; renderView(); }));
  }
}

function updateBadges() {
  $$('[data-badge]').forEach(b => { b.hidden = !S.pending; b.textContent = S.pending; });
}

const VIEWS = {
  clock: viewClock, shifts: viewShifts, hours: viewHours,
  today: viewToday, schedule: viewSchedule, monthly: viewMonthly, requests: viewRequests, team: viewTeam,
};

function route() {
  if (!S.me) return;
  const tabs = tabsFor().map(t => t[0]);
  let v = location.hash.replace('#', '');
  if (!tabs.includes(v)) v = tabs[0];
  if (S.view !== v) S.month = null;
  S.view = v;
  $$('[data-tab]').forEach(b => b.setAttribute('aria-current', b.dataset.tab === v ? 'page' : 'false'));
  stopPolling();
  renderView();
}
window.addEventListener('hashchange', route);

async function renderView() {
  const el = $('#view');
  if (!el) return;
  const seq = ++S.renderSeq;
  if (!el.dataset.view || el.dataset.view !== S.view) {
    el.innerHTML = '<div class="empty">Laden…</div>';
    el.dataset.view = S.view;
  }
  try {
    await VIEWS[S.view](el, () => seq === S.renderSeq);
  } catch (e) {
    if (e.code === 'auth') return;
    if (seq === S.renderSeq) el.innerHTML = `<div class="card"><h2>Deze pagina kon niet geladen worden</h2><p class="muted">${esc(e.message)}</p><div class="form-actions"><button class="primary" id="retry">Opnieuw proberen</button></div></div>`;
    const r = $('#retry'); if (r) r.addEventListener('click', renderView);
  }
}

function startPolling(ms) {
  stopPolling();
  S.poll = setInterval(() => { if (document.visibilityState === 'visible' && !$('#modal').open) renderView(); }, ms);
}
function stopPolling() { if (S.poll) clearInterval(S.poll); S.poll = null; }

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.me && !$('#modal').open) renderView();
});

/* live counters: clocks and "on the clock for" durations */
setInterval(() => {
  const t = now();
  $$('[data-live=clock]').forEach(e => { e.textContent = fmt.clock(t); });
  $$('[data-live=since]').forEach(e => { e.textContent = fmt.dur(minutesBetween(e.dataset.since, t)); });
}, 1000);

/* --------------------------------------------------------- punch card */

function punchCard({ compact = false } = {}) {
  const e = S.openEntry, t = now(), grace = S.settings.grace_minutes;
  const next = S.nextShifts.find(s => new Date(s.ends_at) > t);
  let body;
  if (e) {
    const sh = e.shift;
    const since = new Date(e.clock_in);
    const longOpen = minutesBetween(since, t) > 14 * 60;
    const early = sh && t < new Date(new Date(sh.ends_at).getTime() - grace * 60000);
    body = `
      <div class="punch-status"><span class="dot"></span>Ingeklokt sinds ${sameDay(since, t) ? fmt.time(since) : fmt.when(since)}</div>
      <div class="punch-elapsed" data-live="since" data-since="${e.clock_in}">${fmt.dur(minutesBetween(since, t))}</div>
      ${sh ? `<div class="punch-meta">Shift ${fmt.range(sh.starts_at, sh.ends_at)}${sh.label ? ' · ' + esc(sh.label) : ''}</div>` : ''}
      ${longOpen ? `<p class="hint bad">Je bent ingeklokt sinds ${fmt.when(since)}. Vergeten uit te klokken? <button class="link" data-act="forgot-out">Vul in wanneer je vertrok</button></p>`
        : early ? `<p class="hint warn">Je shift eindigt om ${fmt.time(sh.ends_at)}. Als je nu uitklokt, telt dat als vroeger vertrokken.</p>` : ''}
      <div class="field">
        <label for="out-note">Opmerking voor je verantwoordelijke (optioneel)</label>
        <input id="out-note" maxlength="300" placeholder="${early ? 'bv. vroeger weg, afspraak bij de dokter' : 'bv. de bar overgenomen na 17u'}">
      </div>
      <button class="big stop" data-act="clock-out">Uitklokken</button>`;
  } else {
    body = `
      <div class="punch-status"><span class="dot"></span>Je bent niet ingeklokt</div>
      ${next ? `<div class="punch-meta">${new Date(next.starts_at) <= t ? 'Je shift is nu bezig' : 'Volgende shift'}: ${fmt.when(next.starts_at)} – ${fmt.time(next.ends_at)}${next.label ? ' · ' + esc(next.label) : ''}</div>`
        : '<div class="punch-meta muted">Geen shiften gepland. Neem er een op bij Shiften.</div>'}
      <button class="big go" data-act="clock-in">Inklokken</button>`;
  }
  return `
    <section class="punch ${e ? 'is-on' : ''} ${compact ? 'compact' : ''}" aria-label="In- en uitklokken">
      <div class="punch-top">
        <span class="punch-clock" data-live="clock">${fmt.clock(t)}</span>
        <span class="punch-date">${fmt.dayLong(t)}</span>
      </div>
      ${body}
    </section>`;
}

function bindPunch(root, after) {
  const inBtn = $('[data-act=clock-in]', root);
  if (inBtn) inBtn.addEventListener('click', () => busy(inBtn, async () => {
    await rpc('clock_in');
    await refreshMe();
    toast(`Ingeklokt om ${fmt.time(now())}`);
    after();
  }).catch(() => {}));
  const outBtn = $('[data-act=clock-out]', root);
  if (outBtn) outBtn.addEventListener('click', () => busy(outBtn, async () => {
    await rpc('clock_out', { p_note: ($('#out-note', root) || {}).value || '' });
    await refreshMe();
    toast(`Uitgeklokt om ${fmt.time(now())}`);
    after();
  }).catch(() => {}));
  const forgot = $('[data-act=forgot-out]', root);
  if (forgot) forgot.addEventListener('click', () => forgotCheckout(after));
}

function forgotCheckout(after) {
  const e = S.openEntry;
  if (!e) return;
  const since = new Date(e.clock_in);
  let guess = e.shift ? new Date(e.shift.ends_at) : new Date(since.getTime() + 8 * 3600000);
  if (guess > now()) guess = now();
  modal.open(`
    <h2 id="modal-title">Wanneer ben je vertrokken?</h2>
    <p>Je klokte in ${fmt.when(since)}. We klokken je nu uit en sturen het juiste uur naar je verantwoordelijke om goed te keuren.</p>
    <form id="forgot-form" novalidate>
      <div class="form-grid">
        <div class="field"><label for="f-day">Dag</label>${dateField('f-day', guess, since, now())}</div>
        <div class="field"><label for="f-out">Ik vertrok om</label>${timeField('f-out', toTimeInput(guess))}</div>
        <div class="field wide"><label for="f-reason">Reden</label><input id="f-reason" maxlength="300" value="Vergeten uit te klokken"></div>
      </div>
      <p class="form-error" id="f-err"></p>
      <div class="form-actions"><button type="button" data-close>Annuleren</button><button type="submit" class="primary">Uitklokken en versturen</button></div>
    </form>`, d => {
    $('#forgot-form', d).addEventListener('submit', async ev => {
      ev.preventDefault();
      const hm = parseHM($('#f-out', d).value);
      const reason = $('#f-reason', d).value.trim();
      const err = $('#f-err', d);
      if (!hm) { err.textContent = 'Vul in hoe laat je vertrok, bv. 22:30.'; return; }
      const out = atTime(new Date($('#f-day', d).value + 'T00:00'), hm);
      if (out <= since || out > now()) { err.textContent = 'Kies een uur tussen je inklokken en nu.'; return; }
      if (reason.length < 3) { err.textContent = 'Geef een korte reden.'; return; }
      const btn = $('button[type=submit]', d);
      btn.disabled = true;
      try {
        await rpc('clock_out', { p_note: 'Vergeten uit te klokken' });
        await rpc('request_time_edit', { p_entry_id: e.id, p_in: since.toISOString(), p_out: out.toISOString(), p_reason: reason });
        modal.close();
        await refreshMe();
        toast('Uitgeklokt. Je verantwoordelijke keurt het ingevulde uur goed.');
        after();
      } catch (x) { err.textContent = x.message; btn.disabled = false; }
    });
  });
}

/* ------------------------------------------------------------ staff: clock */

async function viewClock(el, current) {
  await refreshMe();
  const monthStart = startOfMonth(now()), wk = startOfWeek(now());
  const from = monthStart < wk ? monthStart : wk;
  const [month, week] = await Promise.all([
    rpc('my_hours', { p_from: from.toISOString(), p_to: addDays(now(), 1).toISOString() }),
    rpc('list_shifts', { p_from: wk.toISOString(), p_to: addDays(wk, 14).toISOString() }),
  ]);
  if (!current()) return;
  const done = month.entries.filter(x => x.clock_out);
  const mins = done.filter(x => new Date(x.clock_in) >= monthStart).reduce((a, x) => a + minutesBetween(x.clock_in, x.clock_out), 0);
  const weekMins = done.filter(x => new Date(x.clock_in) >= wk).reduce((a, x) => a + minutesBetween(x.clock_in, x.clock_out), 0);
  const open = week.filter(s => !s.staff_id && new Date(s.ends_at) > now());
  const mine = S.nextShifts;
  const rate = month.hourly_rate != null ? Number(month.hourly_rate) : null;
  const monthName = fmt.monthName(now());
  const hour = now().getHours();
  const hello = hour < 12 ? 'Goedemorgen' : hour < 18 ? 'Goedemiddag' : 'Goedenavond';
  el.innerHTML = `
    <div class="view-head"><div><h1>${hello}, ${esc(S.me.name.split(' ')[0])}</h1></div></div>
    <div class="grid-2">
      ${punchCard()}
      <div style="display:flex;flex-direction:column;gap:18px;min-width:0">
        <div class="stats stats-3">
          <div class="stat"><span class="v">${fmt.dur(weekMins)}</span><span class="k">Gewerkt deze week</span></div>
          <div class="stat good"><span class="v">${fmt.dur(mins)}</span><span class="k">Gewerkt in ${monthName}</span></div>
          <div class="stat"><span class="v">${rate != null ? fmt.money(mins / 60 * rate) : '—'}</span><span class="k">${rate != null ? `Verdiend in ${monthName}` : 'Je verdiensten verschijnen zodra je uurloon is ingesteld'}</span></div>
        </div>
        <section class="card">
          <div class="card-head"><h2>Je volgende shiften</h2><button class="sm" data-go="shifts">Alle shiften</button></div>
          ${mine.length ? `<div class="rows">${mine.map(s => `
            <div class="row"><div class="row-main"><span class="row-title">${fmt.dayLong(s.starts_at)}</span>
            <span class="row-sub"><span class="time">${fmt.range(s.starts_at, s.ends_at)}</span>${s.label ? ' · ' + esc(s.label) : ''}</span></div>
            <span class="pill">${fmt.dur(minutesBetween(s.starts_at, s.ends_at))}</span></div>`).join('')}</div>`
            : '<p class="empty">Nog niets gepland.</p>'}
          ${open.length ? `<p class="hint info" style="margin-top:12px">${plural(open.length, 'open shift', 'open shiften')} de komende twee weken. <button class="link" data-go="shifts">Neem er een op</button></p>` : ''}
        </section>
      </div>
    </div>`;
  bindPunch(el, renderView);
  $$('[data-go]', el).forEach(b => b.addEventListener('click', () => { location.hash = b.dataset.go; }));
}

/* ------------------------------------------------------- shifts & schedule */

const DAY_NAMES = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const DAY_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

function periodBar(label, hint, prevId, nextId) {
  return `<div class="periodbar">
    <button class="icon" id="${prevId}" aria-label="Vorige">‹</button>
    <div class="label"><strong>${label}</strong><span>${hint}</span></div>
    <button class="icon" id="${nextId}" aria-label="Volgende">›</button>
  </div>`;
}

// Quick buttons for this month and the next two.
function monthChips() {
  const first = startOfMonth(now());
  return `<div class="chips" role="group" aria-label="Kies een maand">${[0, 1, 2].map(i => {
    const m = addMonths(first, i), on = S.month && sameDay(m, S.month);
    return `<button type="button" class="chip${on ? ' is-on' : ''}" data-chip-month="${toDateInput(m)}" aria-pressed="${!!on}">${fmt.monthName(m)}</button>`;
  }).join('')}</div>`;
}

function bindMonthNav(el) {
  $$('[data-chip-month]', el).forEach(b => b.addEventListener('click', () => { S.month = new Date(b.dataset.chipMonth + 'T00:00'); renderView(); }));
  $('#mo-prev', el).addEventListener('click', () => { S.month = addMonths(S.month, -1); renderView(); });
  $('#mo-next', el).addEventListener('click', () => { S.month = addMonths(S.month, 1); renderView(); });
}

// Standard shifts are only created up to 3 months ahead.
function horizonNote(m) {
  return m > addDays(now(), 92) ? '<p class="hint info">Vaste shiften verschijnen 3 maanden op voorhand in de kalender, dus deze maand kan nog leeg lijken.</p>' : '';
}

// One day's shifts, with identical open slots folded into one entry.
function dayEntries(list) {
  const out = [];
  for (const s of list) {
    if (!s.staff_id) {
      const same = out.find(o => o.open && o.starts_at === s.starts_at && o.ends_at === s.ends_at && o.label === s.label);
      if (same) { same.count++; continue; }
      out.push({ ...s, open: true, count: 1 });
    } else {
      out.push({ ...s, open: false, count: 1 });
    }
  }
  return out;
}

function calEntry(x, manager, t) {
  const past = new Date(x.ends_at) <= t;
  const time = `${fmt.time(x.starts_at)} – ${fmt.time(x.ends_at)}`;
  const who = x.open ? `Open${x.count > 1 ? ` ×${x.count}` : ''}` : esc(x.staff_name) + (x.mine && !manager ? ' (jij)' : '');
  const cls = `cal-shift${x.open ? ' is-open' : ''}${x.mine && !manager ? ' is-mine' : ''}${past ? ' is-past' : ''}`;
  const clickable = manager || (!past && (x.open || x.mine));
  const title = esc(`${x.label ? x.label + ', ' : ''}${time}${x.open ? (manager ? ' (open)' : ' – tik om op te nemen') : ''}`);
  const inner = `<b>${who}:</b> <span class="t">${time}</span>`;
  return clickable
    ? `<button type="button" class="${cls}" data-shift="${x.id}" title="${title}">${inner}</button>`
    : `<span class="${cls}" title="${title}">${inner}</span>`;
}

function calendarHTML(shifts, month, { manager = false } = {}) {
  const t = now(), first = startOfMonth(month);
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const byDay = Array.from({ length: days }, (_, i) => dayEntries(shifts.filter(s => sameDay(s.starts_at, addDays(first, i)))));
  const addBtn = d => manager ? `<button type="button" class="cal-add" data-add-day="${toDateInput(d)}" aria-label="Shift toevoegen op ${fmt.dayLong(d)}">+</button>` : '';
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push('<div class="cal-cell is-blank"></div>');
  byDay.forEach((list, i) => {
    const d = addDays(first, i);
    cells.push(`<div class="cal-cell${sameDay(d, t) ? ' is-today' : ''}${d < startOfDay(t) ? ' is-before' : ''}">
      <div class="cal-day"><span class="cal-num">${i + 1}</span>${addBtn(d)}</div>
      ${list.map(x => calEntry(x, manager, t)).join('')}
    </div>`);
  });
  while (cells.length % 7) cells.push('<div class="cal-cell is-blank"></div>');
  const agenda = byDay.map((list, i) => ({ d: addDays(first, i), list })).filter(x => x.list.length || sameDay(x.d, t));
  return `
    <div class="cal-wrap">
      <h2 class="cal-title">${esc(fmt.month(first))}</h2>
      <div class="cal-grid">
        ${DAY_NAMES.map(n => `<div class="cal-head">${n}</div>`).join('')}
        ${cells.join('')}
      </div>
      <div class="cal-agenda">
        ${agenda.length ? agenda.map(({ d, list }) => `
          <div class="ag-day${sameDay(d, t) ? ' is-today' : ''}">
            <div class="ag-head"><span>${esc(fmt.day(d))}${sameDay(d, t) ? ' · vandaag' : ''}</span>${addBtn(d)}</div>
            ${list.length ? list.map(x => calEntry(x, manager, t)).join('') : '<p class="muted small">Geen shiften</p>'}
          </div>`).join('') : '<p class="empty">Geen shiften deze maand.</p>'}
      </div>
    </div>`;
}

function bindCalendar(el, shifts, manager) {
  $('.cal-wrap', el).addEventListener('click', ev => {
    const add = ev.target.closest('[data-add-day]');
    if (add) { addShiftModal(add.dataset.addDay); return; }
    const b = ev.target.closest('[data-shift]');
    const s = b && shifts.find(x => x.id === b.dataset.shift);
    if (!s) return;
    if (manager) editShift(s);
    else if (!s.staff_id) claimShift(s);
    else if (s.mine) ownShift(s);
  });
}

const shiftWhen = s => `${esc(fmt.dayLong(s.starts_at))}, <strong>${fmt.range(s.starts_at, s.ends_at)}</strong>${s.label ? ` (${esc(s.label)})` : ''}`;

async function claimShift(s) {
  const ok = await modal.confirm({ title: 'Deze shift opnemen?', body: `${shiftWhen(s)}${s.notes ? `<br>${esc(s.notes)}` : ''}`, ok: 'Shift opnemen' });
  if (!ok) return;
  busy(null, async () => {
    await rpc('claim_shift', { p_shift_id: s.id });
    await refreshMe();
    toast('Shift opgenomen. Hij staat nu op jouw naam.');
    renderView();
  }).catch(() => {});
}

function ownShift(s) {
  const cut = S.settings.drop_cutoff_hours;
  const canDrop = new Date(s.starts_at) - now() > cut * 3600000;
  modal.open(`
    <h2 id="modal-title">Jouw shift</h2>
    <p>${shiftWhen(s)}</p>
    ${canDrop ? '<p class="muted small">Kan je niet? Geef hem terug, dan staat hij weer open voor iemand anders.</p>'
      : `<p class="hint info">Hij begint binnen ${cut} uur, dus je kan hem hier niet meer teruggeven. Vraag het aan je verantwoordelijke.</p>`}
    <div class="form-actions">
      <button type="button" data-close>Sluiten</button>
      ${canDrop ? '<button type="button" class="danger solid" id="drop-it">Shift teruggeven</button>' : ''}
    </div>`, d => {
    const b = $('#drop-it', d);
    if (b) b.addEventListener('click', () => busy(b, async () => {
      await rpc('release_shift', { p_shift_id: s.id });
      modal.close();
      await refreshMe();
      toast('Shift teruggegeven. Hij staat weer open voor anderen.');
      renderView();
    }).catch(() => {}));
  });
}

async function viewShifts(el, current) {
  S.month = S.month || startOfMonth(now());
  const m = S.month;
  const shifts = await rpc('list_shifts', { p_from: m.toISOString(), p_to: addMonths(m, 1).toISOString() });
  if (!current()) return;
  const t = now();
  const open = shifts.filter(s => !s.staff_id && new Date(s.ends_at) > t);
  const mine = shifts.filter(s => s.mine);
  const mineMins = mine.reduce((a, s) => a + minutesBetween(s.starts_at, s.ends_at), 0);
  el.innerHTML = `
    <div class="view-head">
      <div><h1>Shiften</h1><p>Tik op een <span class="key-open">open</span> shift om hem op te nemen. Tik op een van jouw shiften om hem terug te geven.</p></div>
      ${periodBar(fmt.month(m), sameDay(m, startOfMonth(t)) ? 'Deze maand' : '', 'mo-prev', 'mo-next')}
    </div>
    ${monthChips()}
    <div class="stats stats-3">
      <div class="stat ${open.length ? 'accent' : ''}"><span class="v">${open.length}</span><span class="k">Open om op te nemen</span></div>
      <div class="stat"><span class="v">${mine.length}</span><span class="k">Jouw shiften</span></div>
      <div class="stat"><span class="v">${fmt.dur(mineMins)}</span><span class="k">Gepland voor jou</span></div>
    </div>
    <section class="card cal-card">${calendarHTML(shifts, m)}</section>
    ${horizonNote(m)}`;
  bindMonthNav(el);
  bindCalendar(el, shifts, false);
}

async function loadStaff(force = false) {
  if (!S.staff || force) S.staff = await rpc('mgr_staff_list');
  return S.staff;
}
const activeStaff = () => (S.staff || []).filter(p => p.active);
function staffOptions(selected, { openLabel = 'Open' } = {}) {
  return `<option value="">${esc(openLabel)}</option>` +
    activeStaff().map(p => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
}
const daysText = days => [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => DAY_SHORT[d]).join(', ');

async function viewSchedule(el, current) {
  S.month = S.month || startOfMonth(now());
  const m = S.month;
  const [shifts, templates] = await Promise.all([
    rpc('list_shifts', { p_from: m.toISOString(), p_to: addMonths(m, 1).toISOString() }),
    rpc('mgr_templates'),
    loadStaff(),
  ]);
  if (!current()) return;
  const t = now();
  const filled = shifts.filter(s => s.staff_id).length;
  const openAhead = shifts.filter(s => !s.staff_id && new Date(s.ends_at) > t).length;
  el.innerHTML = `
    <div class="view-head">
      <div><h1>Planning</h1><p>${plural(shifts.length, 'shift', 'shiften')} · ${filled} ingevuld · ${openAhead} nog open. Klik op een shift om iemand toe te wijzen of hem aan te passen.</p></div>
      ${periodBar(fmt.month(m), sameDay(m, startOfMonth(t)) ? 'Deze maand' : '', 'mo-prev', 'mo-next')}
    </div>
    ${monthChips()}
    <section class="card cal-card">
      <div class="cal-toolbar"><span class="muted small">Gebruik + op een dag voor een extra shift.</span><button class="primary sm" id="add-shift">+ Shift toevoegen</button></div>
      ${calendarHTML(shifts, m, { manager: true })}
    </section>
    ${horizonNote(m)}
    <section class="card">
      <div class="card-head"><h2>Vaste shiften</h2><button class="sm" id="add-template">+ Vaste shift toevoegen</button></div>
      <p class="muted small" style="margin-top:6px">Deze komen elke week terug. Ze verschijnen vanzelf in de kalender, tot 3 maanden op voorhand, als open shiften die het personeel kan opnemen.</p>
      ${templates.length ? `<div class="rows">${templates.map(tp => `
        <div class="row">
          <div class="row-main"><span class="row-title">${esc(tp.label || 'Shift')}</span>
            <span class="row-sub">${daysText(tp.weekdays)} · <span class="time">${tp.start_time} – ${tp.end_time}</span> · ${plural(tp.people, 'persoon', 'personen')}</span></div>
          <div class="row-actions"><button class="sm" data-template="${tp.id}">Wijzigen</button></div>
        </div>`).join('')}</div>` : '<p class="empty">Nog geen vaste shiften.</p>'}
    </section>`;
  bindMonthNav(el);
  bindCalendar(el, shifts, true);
  $('#add-shift', el).addEventListener('click', () => addShiftModal(toDateInput(sameDay(m, startOfMonth(t)) ? t : m)));
  $('#add-template', el).addEventListener('click', () => templateModal(null));
  $$('[data-template]', el).forEach(b => b.addEventListener('click', () => templateModal(templates.find(x => x.id === b.dataset.template))));
}

function addShiftModal(dateStr) {
  const day = new Date(dateStr + 'T00:00');
  modal.open(`
    <h2 id="modal-title">Shift toevoegen</h2>
    <p>Een eenmalige shift. Voor shiften die elke week terugkomen, voeg je beter een vaste shift toe.</p>
    <form id="ad-form" novalidate>
      <div class="form-grid">
        <div class="field wide"><label for="ad-date">Datum</label>${dateField('ad-date', day, startOfMonth(day), addDays(addMonths(startOfMonth(day), 3), -1))}</div>
        <div class="field"><label for="ad-start">Begint</label>${timeField('ad-start', '17:30')}</div>
        <div class="field"><label for="ad-end">Eindigt</label>${timeField('ad-end', '22:30')}</div>
        <div class="field"><label for="ad-label">Functie</label><input id="ad-label" maxlength="60" placeholder="bv. Avond"></div>
        <div class="field"><label for="ad-count">Aantal personen</label><input id="ad-count" type="number" min="1" max="20" value="1"></div>
        <div class="field wide"><label for="ad-staff">Toewijzen aan</label><select id="ad-staff">${staffOptions('', { openLabel: 'Open laten, zodat het personeel hem kan opnemen' })}</select></div>
        <div class="field wide"><label for="ad-notes">Opmerking (optioneel)</label><input id="ad-notes" maxlength="300" placeholder="Wat het personeel moet weten"></div>
      </div>
      <p class="form-error" id="ad-err"></p>
      <div class="form-actions"><button type="button" data-close>Annuleren</button><button type="submit" class="primary">Shift toevoegen</button></div>
    </form>`, d => {
    $('#ad-form', d).addEventListener('submit', async ev => {
      ev.preventDefault();
      const err = $('#ad-err', d);
      const date = $('#ad-date', d).value, start = parseHM($('#ad-start', d).value), end = parseHM($('#ad-end', d).value);
      if (!start || !end) { err.textContent = 'Vul een begin- en einduur in, bv. 17:30 en 22:30.'; return; }
      if (start === end) { err.textContent = 'Begin en einde kunnen niet hetzelfde uur zijn.'; return; }
      const { a, b } = spanFor(date, start, end);
      const btn = $('button[type=submit]', d);
      btn.disabled = true;
      try {
        const r = await rpc('mgr_create_shifts', {
          p_slots: [{ starts_at: a.toISOString(), ends_at: b.toISOString() }], p_label: $('#ad-label', d).value,
          p_notes: $('#ad-notes', d).value, p_count: Number($('#ad-count', d).value) || 1, p_staff_id: $('#ad-staff', d).value || null,
        });
        modal.close();
        toast(`${plural(r.created, 'shift', 'shiften')} toegevoegd.`);
        renderView();
      } catch (e) { err.textContent = e.message; btn.disabled = false; }
    });
  });
}

function templateModal(tp) {
  const days = tp ? tp.weekdays : [];
  modal.open(`
    <h2 id="modal-title">${tp ? `“${esc(tp.label || 'Shift')}” wijzigen` : 'Vaste shift toevoegen'}</h2>
    <p>Komt elke week terug.${tp ? ' Wijzigingen gelden voor de komende open shiften. Shiften die al opgenomen zijn, blijven zoals ze zijn.' : ''}</p>
    <form id="tp-form" novalidate>
      <div class="form-grid">
        <div class="field wide"><label for="tp-label">Naam</label><input id="tp-label" maxlength="60" value="${esc(tp ? tp.label : '')}" placeholder="bv. Avond"></div>
        <div class="field wide"><label>Dagen</label><div class="days">${[0, 1, 2, 3, 4, 5, 6].map(i => `
          <label><input type="checkbox" name="tpday" value="${i}" ${days.includes(i) ? 'checked' : ''}><span>${DAY_SHORT[i]}</span></label>`).join('')}</div></div>
        <div class="field"><label for="tp-start">Begint</label>${timeField('tp-start', tp ? tp.start_time : '17:30')}</div>
        <div class="field"><label for="tp-end">Eindigt</label>${timeField('tp-end', tp ? tp.end_time : '22:30')}</div>
        <div class="field"><label for="tp-people">Aantal personen</label><input id="tp-people" type="number" min="1" max="20" value="${tp ? tp.people : 1}"></div>
      </div>
      <p class="form-error" id="tp-err"></p>
      <div class="form-actions" style="justify-content:${tp ? 'space-between' : 'flex-end'}">
        ${tp ? '<button type="button" class="danger" id="tp-remove">Deze shift stopzetten</button>' : ''}
        <span class="toolbar"><button type="button" data-close>Annuleren</button><button type="submit" class="primary">Opslaan</button></span>
      </div>
    </form>`, d => {
    $('#tp-form', d).addEventListener('submit', async ev => {
      ev.preventDefault();
      const err = $('#tp-err', d);
      const picked = $$('input[name=tpday]:checked', d).map(i => Number(i.value));
      const start = parseHM($('#tp-start', d).value), end = parseHM($('#tp-end', d).value);
      if (!picked.length) { err.textContent = 'Kies minstens één dag.'; return; }
      if (!start || !end || start === end) { err.textContent = 'Vul een begin- en einduur in, bv. 17:30 en 22:30.'; return; }
      const btn = $('button[type=submit]', d);
      btn.disabled = true;
      try {
        await rpc('mgr_save_template', {
          p_id: tp ? tp.id : null, p_label: $('#tp-label', d).value, p_weekdays: picked,
          p_start: start, p_end: end, p_people: Number($('#tp-people', d).value) || 1,
        });
        modal.close();
        toast('Vaste shift opgeslagen.');
        renderView();
      } catch (e) { err.textContent = e.message; btn.disabled = false; }
    });
    const rm = $('#tp-remove', d);
    if (rm) rm.addEventListener('click', async () => {
      const ok = await modal.confirm({
        title: `“${tp.label || 'Shift'}” stopzetten?`, danger: true, ok: 'Stopzetten',
        body: 'De komende open shiften ervan verdwijnen uit de kalender. Shiften die al opgenomen zijn, blijven.',
      });
      if (!ok) return;
      busy(null, async () => { await rpc('mgr_archive_template', { p_id: tp.id }); toast('Vaste shift stopgezet.'); renderView(); }).catch(() => {});
    });
  });
}

function editShift(s) {
  const a = new Date(s.starts_at), b = new Date(s.ends_at);
  modal.open(`
    <h2 id="modal-title">${esc(fmt.dayLong(a))}</h2>
    <p>${s.label ? `${esc(s.label)} · ` : ''}${s.staff_id ? `${esc(s.staff_name)} werkt deze shift.` : 'Nog niemand heeft deze shift opgenomen.'}</p>
    <form id="es-form" novalidate>
      <div class="form-grid">
        <div class="field wide"><label for="es-staff">Wie werkt</label><select id="es-staff">${staffOptions(s.staff_id, { openLabel: 'Open – het personeel kan hem opnemen' })}
          ${s.staff_id && !activeStaff().some(p => p.id === s.staff_id) ? `<option value="${s.staff_id}" selected>${esc(s.staff_name)}</option>` : ''}</select></div>
        <div class="field wide"><label for="es-date">Datum</label>${dateField('es-date', a, addMonths(startOfMonth(a), -1), addDays(addMonths(startOfMonth(a), 2), -1))}</div>
        <div class="field"><label for="es-start">Begint</label>${timeField('es-start', toTimeInput(a))}</div>
        <div class="field"><label for="es-end">Eindigt</label>${timeField('es-end', toTimeInput(b))}</div>
        <div class="field"><label for="es-label">Functie</label><input id="es-label" maxlength="60" value="${esc(s.label)}"></div>
        <div class="field wide"><label for="es-notes">Opmerking</label><input id="es-notes" maxlength="300" value="${esc(s.notes)}"></div>
      </div>
      <p class="form-error" id="es-err"></p>
      <div class="form-actions" style="justify-content:space-between">
        <button type="button" class="danger" id="es-remove">Shift verwijderen</button>
        <span class="toolbar"><button type="button" data-close>Annuleren</button><button type="submit" class="primary">Opslaan</button></span>
      </div>
    </form>`, d => {
    $('#es-form', d).addEventListener('submit', async ev => {
      ev.preventDefault();
      const sHM = parseHM($('#es-start', d).value), eHM = parseHM($('#es-end', d).value);
      if (!sHM || !eHM || sHM === eHM) { $('#es-err', d).textContent = 'Vul een begin- en einduur in, bv. 17:30 en 22:30.'; return; }
      const { a: st, b: en } = spanFor($('#es-date', d).value, sHM, eHM);
      const btn = $('button[type=submit]', d);
      btn.disabled = true;
      try {
        await rpc('mgr_update_shift', {
          p_id: s.id, p_starts: st.toISOString(), p_ends: en.toISOString(),
          p_label: $('#es-label', d).value, p_notes: $('#es-notes', d).value, p_staff_id: $('#es-staff', d).value || null,
        });
        modal.close(); toast('Shift opgeslagen.'); renderView();
      } catch (e) { $('#es-err', d).textContent = e.message; btn.disabled = false; }
    });
    $('#es-remove', d).addEventListener('click', async () => {
      const ok = await modal.confirm({ title: 'Deze shift verwijderen?', body: `${shiftWhen(s)}${s.staff_name ? `, ${esc(s.staff_name)}` : ''}. Gewerkte uren blijven bewaard.`, ok: 'Shift verwijderen', danger: true });
      if (!ok) return;
      busy(null, async () => { await rpc('mgr_remove_shift', { p_id: s.id }); toast('Shift verwijderd.'); renderView(); }).catch(() => {});
    });
  });
}

/* ----------------------------------------------- contract types & Securex */

const CONTRACTS = { student: 'Student', flexi: 'Flexi-job', extra: 'Extra (gelegenheidswerknemer)', vast: 'Vast / andere' };
const CONTRACT_SHORT = { student: 'Student', flexi: 'Flexi', extra: 'Extra', vast: 'Vast' };
const HOUR_KINDS = [['normal', 'Gewone uren'], ['sunday', 'Zondag'], ['holiday', 'Feestdag']];
const contractOptions = sel => `<option value="">Nog niet gekozen</option>` +
  Object.entries(CONTRACTS).map(([k, l]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${l}</option>`).join('');

function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
const holidayCache = {};
// The ten Belgian legal public holidays.
function holidaysBE(y) {
  if (!holidayCache[y]) {
    const e = easterSunday(y), f = (mo, d) => `${y}-${pad(mo)}-${pad(d)}`;
    holidayCache[y] = new Map([
      [f(1, 1), 'Nieuwjaar'], [toDateInput(addDays(e, 1)), 'Paasmaandag'], [f(5, 1), 'Dag van de Arbeid'],
      [toDateInput(addDays(e, 39)), 'O.-H.-Hemelvaart'], [toDateInput(addDays(e, 50)), 'Pinkstermaandag'],
      [f(7, 21), 'Nationale feestdag'], [f(8, 15), 'O.-L.-V.-Hemelvaart'], [f(11, 1), 'Allerheiligen'],
      [f(11, 11), 'Wapenstilstand'], [f(12, 25), 'Kerstmis'],
    ]);
  }
  return holidayCache[y];
}
function hourKind(d) {
  const holiday = holidaysBE(d.getFullYear()).get(toDateInput(d));
  if (holiday) return ['holiday', holiday];
  return [d.getDay() === 0 ? 'sunday' : 'normal', ''];
}

// One row per worked shift, split at midnight so Sunday and holiday hours land on their own day.
function payrollRows(rep) {
  const codes = S.settings.wage_codes || {};
  const people = Object.fromEntries(rep.staff.map(p => [p.id, p]));
  const rows = [];
  for (const x of rep.entries) {
    if (!x.clock_out) continue;
    const p = people[x.staff_id] || { name: x.name };
    const type = p.contract_type || 'vast';
    const end = new Date(x.clock_out);
    for (let a = new Date(x.clock_in); a < end;) {
      const midnight = startOfDay(addDays(a, 1)), b = midnight < end ? midnight : end;
      const [kind, holiday] = hourKind(a);
      rows.push({ staff_id: x.staff_id, name: p.name, payroll_id: p.payroll_id || '', type, contract_type: p.contract_type,
        start: a, end: b, minutes: minutesBetween(a, b), kind, holiday, code: (codes[type] || {})[kind] || '' });
      a = b;
    }
  }
  return rows.sort((u, v) => u.name.localeCompare(v.name, 'nl') || u.start - v.start);
}
const kindLabel = row => row.kind === 'holiday' ? `Feestdag (${row.holiday})` : HOUR_KINDS.find(k => k[0] === row.kind)[1];
const dmy = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const endTime = (a, b) => (b.getHours() === 0 && b.getMinutes() === 0 && b > a ? '24:00' : toTimeInput(b));

function securexCard(rep, m, monthInfo) {
  const rows = payrollRows(rep);
  const byPerson = new Map();
  for (const x of rows) {
    if (!byPerson.has(x.staff_id)) byPerson.set(x.staff_id, { row: x, normal: 0, sunday: 0, holiday: 0 });
    byPerson.get(x.staff_id)[x.kind] += x.minutes;
  }
  const list = [...byPerson.values()];
  const open = rep.entries.filter(x => !x.clock_out).length;
  const pending = rep.entries.filter(x => x.pending).length;
  const noId = list.filter(x => !x.row.payroll_id).map(x => esc(x.row.name));
  const noType = list.filter(x => !x.row.contract_type).map(x => esc(x.row.name));
  const noCode = [...new Set(rows.filter(x => !x.code).map(x => `${CONTRACT_SHORT[x.type]} – ${HOUR_KINDS.find(k => k[0] === x.kind)[1].toLowerCase()}`))];
  const warnings = [];
  if (addMonths(m, 1) > now()) warnings.push('De maand is nog niet voorbij. Download het bestand best na de laatste dag.');
  if (pending) warnings.push(`${plural(pending, 'registratie heeft', 'registraties hebben')} een aanpassing die nog wacht. Keur ze eerst goed of af bij Aanvragen.`);
  if (open) warnings.push(`${plural(open, 'registratie is', 'registraties zijn')} nog open (nog ingeklokt). Die tellen pas mee na het uitklokken.`);
  if (noId.length) warnings.push(`Geen werknemersnummer bij: ${noId.join(', ')}. Vul het in bij Team.`);
  if (noType.length) warnings.push(`Geen statuut bij: ${noType.join(', ')}. Vul het in bij Team.`);
  if (noCode.length) warnings.push(`Geen looncode voor: ${noCode.join(', ')}. Klik op Looncodes instellen.`);
  const done = monthInfo && monthInfo.exported_at;
  const hm = mins => mins ? fmt.hours2(mins) : '<span class="muted">–</span>';
  return {
    rows,
    list,
    html: `
    <section class="card" id="securex-card">
      <div class="card-head"><h2>Naar Securex</h2>
        <span class="pill ${done ? 'on' : ''}">${done ? `Gedownload op ${fmt.short(done)} om ${fmt.time(done)}${monthInfo.exported_by ? ` door ${esc(monthInfo.exported_by)}` : ''}` : 'Nog niet gedownload'}</span></div>
      <p class="muted small" style="margin-top:6px">Eén regel per gewerkte shift, met werknemersnummer en looncode, zodat Securex niets moet overtypen. Zon- en feestdagen staan apart. Download het bestand na het einde van de maand en upload het in MySecurex (Isypass Web) of mail het naar je dossierbeheerder.</p>
      ${rows.length ? (warnings.length
        ? `<div class="hint warn" style="margin-top:12px"><strong>Controleer dit eerst</strong><ul class="warn-list">${warnings.map(w => `<li>${w}</li>`).join('')}</ul></div>`
        : '<p class="hint info" style="margin-top:12px">Alles is ingevuld. Het bestand is klaar.</p>') : ''}
      ${list.length ? `<div class="table-wrap" style="margin-top:8px"><table>
        <thead><tr><th>Naam</th><th>Werknemersnr.</th><th>Statuut</th><th class="num">Gewone uren</th><th class="num">Zondag</th><th class="num">Feestdag</th><th class="num">Totaal</th></tr></thead>
        <tbody>${list.map(x => `<tr>
          <td><strong>${esc(x.row.name)}</strong></td>
          <td>${x.row.payroll_id ? esc(x.row.payroll_id) : '<span class="pill warn">Ontbreekt</span>'}</td>
          <td>${x.row.contract_type ? CONTRACT_SHORT[x.row.contract_type] : '<span class="pill warn">Ontbreekt</span>'}</td>
          <td class="num">${hm(x.normal)}</td><td class="num">${hm(x.sunday)}</td><td class="num">${hm(x.holiday)}</td>
          <td class="num"><strong>${fmt.hours2(x.normal + x.sunday + x.holiday)}</strong></td></tr>`).join('')}</tbody>
      </table></div><p class="muted small" style="margin-top:8px">Uren in decimalen (7,50 = 7 uur 30 minuten).</p>`
        : '<p class="empty">Geen afgewerkte registraties in deze maand.</p>'}
      <div class="form-actions">
        <button class="sm" id="wage-codes">Looncodes instellen</button>
        <button class="sm" id="sx-totals" ${rows.length ? '' : 'disabled'}>Totalen (CSV)</button>
        <button class="primary sm" id="sx-file" ${rows.length ? '' : 'disabled'}>Bestand voor Securex downloaden</button>
      </div>
    </section>`,
  };
}

function bindSecurex(el, m, sx) {
  const ym = `${m.getFullYear()}-${pad(m.getMonth() + 1)}`;
  $('#wage-codes', el).addEventListener('click', wageCodesModal);
  const totals = $('#sx-totals', el);
  totals.addEventListener('click', () => downloadCsv(`securex-totalen-${ym}.csv`, [
    ['Werknemersnummer', 'Naam', 'Statuut', 'Looncode', 'Soort uren', 'Uren'],
    ...sx.list.flatMap(x => HOUR_KINDS.filter(([k]) => x[k] > 0).map(([k, l]) =>
      [x.row.payroll_id, x.row.name, CONTRACT_SHORT[x.row.type], ((S.settings.wage_codes || {})[x.row.type] || {})[k] || '', l, fmt.hours2(x[k])])),
  ]));
  const file = $('#sx-file', el);
  file.addEventListener('click', () => busy(file, async () => {
    downloadCsv(`securex-prestaties-${ym}.csv`, [
      ['Werknemersnummer', 'Naam', 'Statuut', 'Datum', 'Looncode', 'Soort uren', 'Uren', 'Begin', 'Einde'],
      ...sx.rows.map(x => [x.payroll_id, x.name, CONTRACT_SHORT[x.type], dmy(x.start), x.code, kindLabel(x),
        fmt.hours2(x.minutes), toTimeInput(x.start), endTime(x.start, x.end)]),
    ]);
    await rpc('mgr_record_export', { p_month: toDateInput(m), p_rows: sx.rows.length, p_minutes: Math.round(sx.rows.reduce((a, x) => a + x.minutes, 0) * 10) / 10 });
    toast('Bestand gedownload. Upload het in MySecurex of mail het naar je dossierbeheerder.');
    renderView();
  }).catch(() => {}));
}

function wageCodesModal() {
  const codes = S.settings.wage_codes || {};
  modal.open(`
    <h2 id="modal-title">Looncodes voor Securex</h2>
    <p>Vraag de codes één keer aan je dossierbeheerder bij Securex. Ze komen in elke regel van het bestand. Een leeg vakje blijft leeg in het bestand.</p>
    <form id="wc-form" novalidate>
      <div class="table-wrap"><table class="wc-table">
        <thead><tr><th>Statuut</th>${HOUR_KINDS.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead>
        <tbody>${Object.entries(CONTRACTS).map(([t, tl]) => `<tr><td>${CONTRACT_SHORT[t]}</td>${HOUR_KINDS.map(([k, kl]) => `
          <td><input id="wc-${t}-${k}" class="wc-input" maxlength="20" autocomplete="off" value="${esc((codes[t] || {})[k] || '')}" aria-label="${esc(tl)}, ${kl}"></td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>
      <p class="form-error" id="wc-err"></p>
      <div class="form-actions"><button type="button" data-close>Annuleren</button><button type="submit" class="primary">Opslaan</button></div>
    </form>`, d => {
    $('#wc-form', d).addEventListener('submit', async ev => {
      ev.preventDefault();
      const out = {};
      for (const t of Object.keys(CONTRACTS)) { out[t] = {}; for (const [k] of HOUR_KINDS) out[t][k] = $(`#wc-${t}-${k}`, d).value.trim(); }
      const btn = $('button[type=submit]', d);
      btn.disabled = true;
      try {
        await rpc('mgr_save_wage_codes', { p_codes: out });
        await refreshMe();
        modal.close();
        toast('Looncodes opgeslagen.');
        renderView();
      } catch (e) { $('#wc-err', d).textContent = e.message; btn.disabled = false; }
    });
  });
}

/* ------------------------------------------------------------ payslips */

const fmtSize = n => n >= 1048576 ? `${num(n / 1048576, 1)} MB` : `${Math.max(1, Math.round(n / 1024))} kB`;

async function downloadPayslip(id, btn) {
  await busy(btn, async () => {
    const f = await rpc('get_payslip', { p_id: id });
    const bin = atob(f.data.replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    saveBlob(f.file_name, new Blob([bytes], { type: f.content_type }));
  }).catch(() => {});
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(new AppError('Dat bestand kon niet gelezen worden. Probeer opnieuw.'));
    fr.readAsDataURL(file);
  });
}

/* ------------------------------------------------------------ staff: hours */

function entryFlags(x, grace) {
  const f = [];
  const g = grace * 60000;
  if (!x.clock_out) f.push('<span class="pill warn">Nog ingeklokt</span>');
  const sStart = x.shift ? x.shift.starts_at : x.shift_start;
  const sEnd = x.shift ? x.shift.ends_at : x.shift_end;
  if (sStart && new Date(x.clock_in) - new Date(sStart) > g) f.push('<span class="pill bad">Te laat</span>');
  if (sEnd && x.clock_out && new Date(sEnd) - new Date(x.clock_out) > g) f.push('<span class="pill warn">Vroeger vertrokken</span>');
  if (x.pending) f.push('<span class="pill accent">Aanpassing wacht op goedkeuring</span>');
  else if (x.edited) f.push('<span class="pill">Aangepast</span>');
  return f.join('');
}

function stamps(x) {
  return `<span class="stamp in"><b>IN</b>${fmt.time(x.clock_in)}</span>${x.clock_out
    ? `<span class="stamp out"><b>UIT</b>${fmt.time(x.clock_out)}${sameDay(x.clock_in, x.clock_out) ? '' : ' +1'}</span>`
    : '<span class="stamp open"><b>UIT</b>—</span>'}`;
}

async function viewHours(el, current) {
  S.month = S.month || startOfMonth(now());
  const m = S.month;
  const [data, slips] = await Promise.all([
    rpc('my_hours', { p_from: m.toISOString(), p_to: addMonths(m, 1).toISOString() }),
    rpc('my_payslips'),
  ]);
  if (!current()) return;
  const grace = S.settings.grace_minutes;
  const rate = data.hourly_rate != null ? Number(data.hourly_rate) : null;
  const done = data.entries.filter(x => x.clock_out);
  const mins = done.reduce((a, x) => a + minutesBetween(x.clock_in, x.clock_out), 0);
  const pendingReqs = data.requests.filter(r => r.status === 'pending');
  const decided = data.requests.filter(r => r.status !== 'pending');
  el.innerHTML = `
    <div class="view-head">
      <div><h1>Mijn uren</h1><p>Je urenkaart. Klopt er iets niet? Tik op <strong>Uren aanpassen</strong> en je verantwoordelijke keurt het goed.</p></div>
      ${periodBar(fmt.month(m), sameDay(m, startOfMonth(now())) ? 'Deze maand' : '', 'mo-prev', 'mo-next')}
    </div>
    <div class="stats">
      <div class="stat good"><span class="v">${fmt.dur(mins)}</span><span class="k">Gewerkt · ${fmt.hours(mins)} uur</span></div>
      <div class="stat"><span class="v">${rate != null ? fmt.money(mins / 60 * rate) : '—'}</span><span class="k">${rate != null ? `Verdiend (bruto) · ${fmt.money(rate)}/u` : 'Je verdiensten verschijnen zodra je verantwoordelijke je uurloon instelt'}</span></div>
      <div class="stat"><span class="v">${done.length}</span><span class="k">Gewerkte shiften</span></div>
      <div class="stat ${pendingReqs.length ? 'alert' : ''}"><span class="v">${pendingReqs.length}</span><span class="k">Aanpassingen in behandeling</span></div>
    </div>
    <section class="card">
      <div class="card-head"><h2>Urenkaart</h2><button class="sm" id="add-missing">+ Vergeten uren toevoegen</button></div>
      ${data.entries.length ? `<div class="rows">${data.entries.map(x => `
        <div class="entry">
          <div class="row-main">
            <span class="entry-when">${fmt.day(x.clock_in)}</span>
            <div class="entry-io">${stamps(x)}</div>
            <div class="pills">${entryFlags(x, grace)}</div>
          </div>
          <div class="row-actions" style="flex-direction:column;align-items:flex-end">
            <span class="entry-dur">${x.clock_out ? fmt.dur(minutesBetween(x.clock_in, x.clock_out)) : '—'}</span>
            <button class="sm" data-fix="${x.id}">Uren aanpassen</button>
          </div>
          ${x.note ? `<p class="entry-note">${esc(x.note)}</p>` : ''}
          ${x.pending ? `<p class="entry-note">Gevraagd om aan te passen naar ${fmt.time(x.pending.proposed_in)} – ${x.pending.proposed_out ? fmt.time(x.pending.proposed_out) : 'nog bezig'}: “${esc(x.pending.reason)}”</p>` : ''}
        </div>`).join('')}</div>`
        : `<div class="empty"><strong>Geen uren in ${fmt.month(m)}.</strong>Als je inklokt bij Klok, verschijnt het hier.</div>`}
    </section>
    <section class="card">
      <h2>Loonfiches</h2>
      ${slips.length ? `<div class="rows">${slips.map(p => `
        <div class="row">
          <div class="row-main"><span class="row-title">${fmt.month(new Date(p.month + 'T00:00'))}</span>
            <span class="row-sub">${esc(p.file_name)} · ${fmtSize(p.size_bytes)}</span></div>
          <div class="row-actions"><button class="sm primary" data-payslip="${p.id}">Downloaden</button></div>
        </div>`).join('')}</div>`
        : '<p class="empty">Je loonfiches verschijnen hier zodra je verantwoordelijke ze uploadt.</p>'}
      <p class="muted small" style="margin-top:10px">Het verdiende bedrag hierboven is een schatting, bruto. Je loonfiche toont wat je echt betaald krijgt.</p>
    </section>
    ${pendingReqs.length || decided.length ? `<section class="card">
      <h2>Je aanvragen</h2>
      <div class="rows">${[...pendingReqs, ...decided].map(r => `
        <div class="row">
          <div class="row-main">
            <span class="row-title">${r.entry_id ? 'Aanpassen' : 'Toevoegen'} ${fmt.day(r.proposed_in)}: <span class="time">${fmt.time(r.proposed_in)} – ${r.proposed_out ? fmt.time(r.proposed_out) : 'nog bezig'}</span></span>
            <span class="row-sub">“${esc(r.reason)}”</span>
          </div>
          <div class="row-actions">
            ${r.status === 'pending' ? `<span class="pill accent">In behandeling</span><button class="sm" data-cancel="${r.id}">Annuleren</button>`
              : r.status === 'approved' ? '<span class="pill on">Goedgekeurd</span>' : '<span class="pill bad">Niet goedgekeurd</span>'}
          </div>
        </div>`).join('')}</div>
    </section>` : ''}`;
  $('#mo-prev', el).addEventListener('click', () => { S.month = addMonths(S.month, -1); renderView(); });
  $('#mo-next', el).addEventListener('click', () => { S.month = addMonths(S.month, 1); renderView(); });
  $('#add-missing', el).addEventListener('click', () => timeFixModal(null));
  $$('[data-payslip]', el).forEach(b => b.addEventListener('click', () => downloadPayslip(b.dataset.payslip, b)));
  $$('[data-fix]', el).forEach(b => b.addEventListener('click', () => timeFixModal(data.entries.find(x => x.id === b.dataset.fix))));
  $$('[data-cancel]', el).forEach(b => b.addEventListener('click', () => busy(b, async () => {
    await rpc('cancel_time_edit', { p_edit_id: b.dataset.cancel });
    toast('Aanvraag geannuleerd.');
    renderView();
  }).catch(() => {})));
}

function timeFixModal(entry) {
  const t = now();
  const inV = entry ? new Date(entry.clock_in) : atTime(addDays(t, -1), '17:30');
  const outV = entry ? (entry.clock_out ? new Date(entry.clock_out) : null) : atTime(addDays(t, -1), '22:30');
  const stillIn = entry && !entry.clock_out;
  modal.open(`
    <h2 id="modal-title">${entry ? 'Uren aanpassen' : 'Vergeten uren toevoegen'}</h2>
    <p>${entry ? `Nu: ${fmt.day(entry.clock_in)}, ${fmt.time(entry.clock_in)} – ${entry.clock_out ? fmt.time(entry.clock_out) : 'nog ingeklokt'}. ` : 'Voor een shift die je gewerkt hebt maar waarvoor je niet inklokte. '}Je verantwoordelijke keurt de wijziging goed voor ze meetelt.</p>
    <form id="fix-form" novalidate>
      <div class="form-grid">
        <div class="field wide"><label for="fx-day">Dag</label>${dateField('fx-day', inV, addDays(t, -45), t)}</div>
        <div class="field"><label for="fx-in">Ingeklokt</label>${timeField('fx-in', toTimeInput(inV))}</div>
        <div class="field"><label for="fx-out">Uitgeklokt</label>${timeField('fx-out', outV ? toTimeInput(outV) : '', { required: !stillIn })}
          ${stillIn ? '<span class="help">Laat leeg als je nog aan het werken bent.</span>' : '<span class="help">Vroeger dan het inklokken betekent de volgende dag.</span>'}</div>
        <div class="field wide"><label for="fx-reason">Wat is er gebeurd?</label><input id="fx-reason" maxlength="300" placeholder="bv. vergeten uit te klokken, vertrokken om 15:30" required></div>
      </div>
      <p class="form-error" id="fx-err"></p>
      <div class="form-actions"><button type="button" data-close>Annuleren</button><button type="submit" class="primary">Naar verantwoordelijke sturen</button></div>
    </form>`, d => {
    $('#fx-reason', d).focus();
    $('#fix-form', d).addEventListener('submit', async ev => {
      ev.preventDefault();
      const err = $('#fx-err', d);
      const inHM = parseHM($('#fx-in', d).value), outRaw = $('#fx-out', d).value.trim(), outHM = parseHM(outRaw);
      const reason = $('#fx-reason', d).value.trim();
      if (!inHM) { err.textContent = 'Vul in wanneer je inklokte, bv. 17:30.'; return; }
      if (outRaw && !outHM) { err.textContent = 'Vul in wanneer je uitklokte, bv. 22:30.'; return; }
      if (!outHM && !stillIn) { err.textContent = 'Vul in wanneer je uitklokte.'; return; }
      const { a, b } = spanFor($('#fx-day', d).value, inHM, outHM);
      if (a > now() || (b && b > now())) { err.textContent = 'Uren kunnen niet in de toekomst liggen.'; return; }
      if (reason.length < 3) { err.textContent = 'Zeg kort wat er gebeurd is.'; return; }
      const btn = $('button[type=submit]', d);
      btn.disabled = true;
      try {
        await rpc('request_time_edit', { p_entry_id: entry ? entry.id : null, p_in: a.toISOString(), p_out: b ? b.toISOString() : null, p_reason: reason });
        modal.close();
        toast('Verstuurd. Je verantwoordelijke bekijkt het.');
        renderView();
      } catch (e) { err.textContent = e.message; btn.disabled = false; }
    });
  });
}

/* ---------------------------------------------------------- manager: today */

// [pill style, label, code]
function shiftStatus(s, working, t, grace) {
  const a = new Date(s.starts_at), b = new Date(s.ends_at), g = grace * 60000;
  if (!s.staff_id) return b > t ? ['accent', 'Open – niet ingevuld', 'open'] : ['', 'Was niet ingevuld', 'unfilled'];
  const e = s.entry;
  const w = working.find(x => x.staff_id === s.staff_id);
  if (e && e.clock_out) {
    const late = new Date(e.clock_in) - a > g, early = b - new Date(e.clock_out) > g;
    return [late || early ? 'warn' : '', `Klaar ${fmt.time(e.clock_in)} – ${fmt.time(e.clock_out)}${late ? ' · te laat' : ''}${early ? ' · vroeger weg' : ''}`, 'done'];
  }
  if (e || (w && w.shift && w.shift.id === s.id)) {
    const cin = new Date((e || w).clock_in);
    return ['on', `Binnen sinds ${fmt.time(cin)}${cin - a > g ? ' · te laat' : ''}`, 'in'];
  }
  if (t < a) return ['', `Begint om ${fmt.time(a)}`, 'later'];
  if (t >= b) return ['bad', 'Niet gekomen', 'missed'];
  if (t - a > g) return ['bad', 'Niet ingeklokt', 'notin'];
  return ['warn', 'Begint nu', 'due'];
}

async function viewToday(el, current) {
  const t = now(), day = startOfDay(t);
  const [ov] = await Promise.all([
    rpc('mgr_overview', { p_day_start: day.toISOString(), p_day_end: addDays(day, 1).toISOString() }),
    refreshMe(),
  ]);
  if (!current()) return;
  S.pending = ov.pending_requests; updateBadges();
  const grace = S.settings.grace_minutes;
  const notIn = ov.today.filter(s => shiftStatus(s, ov.working, t, grace)[2] === 'notin');
  el.innerHTML = `
    <div class="view-head"><div><h1>Vandaag</h1><p>${fmt.dayLong(t)}</p></div></div>
    <div class="stats">
      <div class="stat good"><span class="v">${ov.working.length}</span><span class="k">Nu aan het werk</span></div>
      <div class="stat ${notIn.length ? 'alert' : ''}"><span class="v">${notIn.length}</span><span class="k">Te laat, niet ingeklokt</span></div>
      <button class="stat ${ov.pending_requests ? 'alert' : ''}" data-go="requests"><span class="v">${ov.pending_requests}</span><span class="k">Aanpassingen goed te keuren</span></button>
      <button class="stat" data-go="schedule"><span class="v">${ov.open_shifts_week}</span><span class="k">Open shiften, komende 7 dagen</span></button>
    </div>
    <div class="grid-2">
      <div style="display:flex;flex-direction:column;gap:18px;min-width:0">
        <section class="card">
          <div class="card-head"><h2>Nu aan het werk</h2><span class="muted small">Wordt elke minuut bijgewerkt</span></div>
          ${ov.working.length ? `<div class="rows">${ov.working.map(w => {
            const long = minutesBetween(w.clock_in, t) > 14 * 60;
            return `<div class="row">
              <div class="person"><span class="avatar on">${esc(initials(w.name))}</span>
                <div class="row-main"><span class="row-title">${esc(w.name)}</span>
                <span class="row-sub">Binnen ${sameDay(w.clock_in, t) ? fmt.time(w.clock_in) : fmt.when(w.clock_in)} · <span data-live="since" data-since="${w.clock_in}">${fmt.dur(minutesBetween(w.clock_in, t))}</span>${w.shift ? ` · shift eindigt om ${fmt.time(w.shift.ends_at)}` : ' · geen shift'}</span>
                ${long ? '<span class="pill bad">Meer dan 14u, waarschijnlijk vergeten uit te klokken</span>' : ''}</div></div>
              <div class="row-actions"><button class="sm" data-checkout="${w.entry_id}" data-name="${esc(w.name)}">Uitklokken</button></div>
            </div>`;
          }).join('')}</div>` : '<p class="empty">Niemand is nu ingeklokt.</p>'}
        </section>
        <section class="card">
          <div class="card-head"><h2>Planning van vandaag</h2><button class="sm" data-go="schedule">Planning wijzigen</button></div>
          ${ov.today.length ? `<div class="rows">${ov.today.map(s => {
            const [k, label] = shiftStatus(s, ov.working, t, grace);
            return `<div class="row">
              <div class="row-main"><span class="row-title">${s.staff_id ? esc(s.staff_name) : '<span class="muted">Open shift</span>'}</span>
              <span class="row-sub"><span class="time">${fmt.range(s.starts_at, s.ends_at)}</span>${s.label ? ' · ' + esc(s.label) : ''}</span></div>
              <span class="pill ${k}">${esc(label)}</span>
            </div>`;
          }).join('')}</div>` : '<p class="empty">Vandaag geen shiften gepland. <button class="link" data-go="schedule">Voeg er toe</button></p>'}
        </section>
      </div>
      ${punchCard({ compact: true })}
    </div>`;
  bindPunch(el, renderView);
  $$('[data-go]', el).forEach(b => b.addEventListener('click', () => { location.hash = b.dataset.go; }));
  $$('[data-checkout]', el).forEach(b => b.addEventListener('click', async () => {
    const ok = await modal.confirm({ title: `${b.dataset.name} uitklokken?`, body: 'Het uitkloktijdstip wordt nu. Vertrok die persoon eerder, pas het uur dan aan in Overzicht.', ok: 'Uitklokken' });
    if (!ok) return;
    busy(null, async () => { await rpc('mgr_check_out', { p_entry_id: b.dataset.checkout }); toast(`${b.dataset.name} is uitgeklokt.`); renderView(); }).catch(() => {});
  }));
  startPolling(60000);
}

/* -------------------------------------------------------- manager: monthly */

// Belgian Excel opens semicolon-separated files with decimal commas.
function csvCell(v) {
  const s = String(v ?? '');
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function saveBlob(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function downloadCsv(name, rows) {
  saveBlob(name, new Blob(['﻿' + rows.map(r => r.map(csvCell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
}

async function viewMonthly(el, current) {
  S.month = S.month || startOfMonth(now());
  const m = S.month;
  const [rep, slips, months] = await Promise.all([
    rpc('mgr_report', { p_from: m.toISOString(), p_to: addMonths(m, 1).toISOString() }),
    rpc('mgr_payslips', { p_month: toDateInput(m) }),
    rpc('mgr_month_totals'),
    loadStaff(),
  ]);
  if (!current()) return;
  const openId = el.dataset.openPerson || '';
  const people = rep.staff.filter(p => p.entries || p.shifts || p.active);
  const tot = people.reduce((a, p) => ({
    worked: a.worked + Number(p.worked_minutes), sched: a.sched + Number(p.scheduled_minutes),
    shifts: a.shifts + p.shifts, entries: a.entries + p.entries, late: a.late + p.late, early: a.early + p.left_early,
    missed: a.missed + p.missed, open: a.open + p.open_entries,
    pay: a.pay + (p.hourly_rate != null ? Number(p.worked_minutes) / 60 * Number(p.hourly_rate) : 0),
  }), { worked: 0, sched: 0, shifts: 0, entries: 0, late: 0, early: 0, missed: 0, open: 0, pay: 0 });
  const anyRate = people.some(p => p.hourly_rate != null);
  const cell = (n, cls = '') => `<td class="num ${n ? cls : 'zero'}">${n}</td>`;
  const label = fmt.month(m);
  const sx = securexCard(rep, m, months.find(x => x.month === toDateInput(m)));
  el.innerHTML = `
    <div class="view-head">
      <div><h1>Maandoverzicht</h1><p>Uren tellen vanaf goedgekeurde registraties. Aanpassingen in behandeling tellen pas mee als je ze goedkeurt.</p></div>
      ${periodBar(label, sameDay(m, startOfMonth(now())) ? 'Deze maand, tot nu' : '', 'mo-prev', 'mo-next')}
    </div>
    <div class="stats">
      <div class="stat good"><span class="v">${fmt.hours(tot.worked)}</span><span class="k">Gewerkte uren</span></div>
      <div class="stat"><span class="v">${fmt.hours(tot.sched)}</span><span class="k">Geplande uren</span></div>
      <div class="stat"><span class="v">${anyRate ? fmt.money(tot.pay) : '—'}</span><span class="k">${anyRate ? 'Geschat loon (bruto)' : 'Vul uurlonen in bij Team om het loon te zien'}</span></div>
      <div class="stat ${tot.late + tot.early + tot.missed + tot.open ? 'alert' : ''}"><span class="v">${tot.late + tot.early + tot.missed}</span><span class="k">Te laat, vroeger weg of niet gekomen</span></div>
    </div>
    <section class="card">
      <div class="card-head"><h2>Per persoon</h2>
        <div class="toolbar">
          <button class="sm" id="add-entry">+ Uren toevoegen</button>
          <button class="sm" id="csv-sum">Overzicht (CSV)</button>
          <button class="sm" id="csv-all">Alle registraties (CSV)</button>
        </div>
      </div>
      ${people.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Naam</th><th class="num">Gewerkt</th><th class="num">Gepland</th><th class="num">Shiften</th><th class="num">Te laat</th><th class="num">Vroeger weg</th><th class="num">Niet gekomen</th>${anyRate ? '<th class="num">Uurloon</th><th class="num">Geschat loon</th>' : ''}</tr></thead>
        <tbody>${people.map(p => `
          <tr class="clickable ${openId === p.id ? 'open' : ''}" data-person="${p.id}" tabindex="0" aria-expanded="${openId === p.id}">
            <td><span class="person"><span class="avatar">${esc(initials(p.name))}</span><span><strong>${esc(p.name)}</strong>${p.active ? '' : ' <span class="pill">Inactief</span>'}${p.open_entries ? ' <span class="pill warn">Ingeklokt</span>' : ''}${p.pending_requests ? ` <span class="pill accent">${plural(p.pending_requests, 'aanpassing', 'aanpassingen')}</span>` : ''}</span></span></td>
            <td class="num"><strong>${fmt.dur(p.worked_minutes)}</strong></td>
            <td class="num">${fmt.dur(p.scheduled_minutes)}</td>
            ${cell(p.entries)}${cell(p.late, 'flag')}${cell(p.left_early, 'flag')}${cell(p.missed, 'flag')}
            ${anyRate ? `<td class="num">${p.hourly_rate != null ? fmt.money(p.hourly_rate) : '—'}</td><td class="num">${p.hourly_rate != null ? fmt.money(p.worked_minutes / 60 * p.hourly_rate) : '—'}</td>` : ''}
          </tr>
          ${openId === p.id ? `<tr class="detail"><td colspan="${anyRate ? 9 : 7}"><div class="detail-inner">${personDetail(p, rep)}</div></td></tr>` : ''}`).join('')}
        </tbody>
        <tfoot><tr><td>Totaal</td><td class="num">${fmt.dur(tot.worked)}</td><td class="num">${fmt.dur(tot.sched)}</td><td class="num">${tot.entries}</td><td class="num">${tot.late}</td><td class="num">${tot.early}</td><td class="num">${tot.missed}</td>${anyRate ? `<td></td><td class="num">${fmt.money(tot.pay)}</td>` : ''}</tr></tfoot>
      </table></div><p class="muted small" style="margin-top:10px">Tik op een naam om elke registratie te zien en uren aan te passen. Te laat en vroeger weg rekenen met een speling van ${rep.grace_minutes} minuten.</p>`
        : '<div class="empty"><strong>Nog niemand in het team.</strong>Voeg mensen toe bij Team.</div>'}
    </section>
    ${sx.html}
    <section class="card">
      <div class="card-head"><h2>Loonfiches voor ${label}</h2><span class="pill ${slips.length ? 'on' : ''}">${slips.length} van ${people.length} geüpload</span></div>
      <p class="muted small" style="margin-top:6px">Upload de loonfiche van elke persoon als pdf of foto, tot 4 MB. Ze downloaden die zelf bij Mijn uren.</p>
      <div class="rows">${people.map(p => {
        const slip = slips.find(x => x.staff_id === p.id);
        return `<div class="row">
          <div class="person"><span class="avatar">${esc(initials(p.name))}</span>
            <div class="row-main"><span class="row-title">${esc(p.name)}</span>
            <span class="row-sub">${slip ? `${esc(slip.file_name)} · ${fmtSize(slip.size_bytes)} · geüpload op ${fmt.short(slip.created_at)}` : 'Nog geen loonfiche'}</span></div></div>
          <div class="row-actions">${slip
            ? `<button class="sm" data-slip-get="${slip.id}">Downloaden</button><button class="sm" data-slip-up="${p.id}">Vervangen</button><button class="sm danger" data-slip-rm="${slip.id}" data-name="${esc(p.name)}">Verwijderen</button>`
            : `<button class="sm primary" data-slip-up="${p.id}">Loonfiche uploaden</button>`}</div>
        </div>`;
      }).join('')}</div>
      <input type="file" id="slip-file" accept="application/pdf,image/png,image/jpeg" hidden>
    </section>
    <section class="card">
      <h2>Alle maanden</h2>
      <p class="muted small" style="margin-top:6px">Elke maand met registraties. Klik op een maand om ze te openen.</p>
      ${months.length ? `<div class="table-wrap" style="margin-top:8px"><table>
        <thead><tr><th>Maand</th><th class="num">Gewerkte uren</th><th class="num">Personen</th><th class="num">Geschat loon</th><th class="num">Loonfiches</th><th>Naar Securex</th></tr></thead>
        <tbody>${months.map(x => `
          <tr class="clickable ${x.month === toDateInput(m) ? 'open' : ''}" data-goto-month="${x.month}" tabindex="0">
            <td><strong>${fmt.month(new Date(x.month + 'T00:00'))}</strong></td>
            <td class="num">${fmt.dur(x.worked_minutes)}</td><td class="num">${x.people}</td>
            <td class="num">${Number(x.pay) ? fmt.money(x.pay) : '—'}</td><td class="num">${x.payslips}</td>
            <td>${x.exported_at ? `<span class="pill on">${fmt.short(x.exported_at)}</span>` : '<span class="muted">–</span>'}</td>
          </tr>`).join('')}</tbody>
      </table></div>` : '<p class="empty">Maanden verschijnen hier zodra er ingeklokt wordt.</p>'}
    </section>`;
  $('#mo-prev', el).addEventListener('click', () => { S.month = addMonths(S.month, -1); el.dataset.openPerson = ''; renderView(); });
  $('#mo-next', el).addEventListener('click', () => { S.month = addMonths(S.month, 1); el.dataset.openPerson = ''; renderView(); });
  $$('tr[data-person]', el).forEach(tr => {
    const toggle = () => { el.dataset.openPerson = el.dataset.openPerson === tr.dataset.person ? '' : tr.dataset.person; renderView(); };
    tr.addEventListener('click', toggle);
    tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });
  $$('[data-edit-entry]', el).forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation();
    entryModal(rep.entries.find(x => x.id === b.dataset.editEntry));
  }));
  $('#add-entry', el).addEventListener('click', () => entryModal(null, el.dataset.openPerson));
  bindSecurex(el, m, sx);
  $$('[data-goto-month]', el).forEach(tr => {
    const go = () => { S.month = new Date(tr.dataset.gotoMonth + 'T00:00'); el.dataset.openPerson = ''; renderView(); window.scrollTo(0, 0); };
    tr.addEventListener('click', go);
    tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  $$('[data-slip-get]', el).forEach(b => b.addEventListener('click', () => downloadPayslip(b.dataset.slipGet, b)));
  const fileInput = $('#slip-file', el);
  let uploadFor = null;
  $$('[data-slip-up]', el).forEach(b => b.addEventListener('click', () => { uploadFor = b; fileInput.value = ''; fileInput.click(); }));
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0], btn = uploadFor;
    if (!file || !btn) return;
    const type = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : '');
    if (!['application/pdf', 'image/png', 'image/jpeg'].includes(type)) { toast('Upload een pdf-, png- of jpg-bestand.', 'error'); return; }
    if (file.size > 4 * 1024 * 1024) { toast('Dat bestand is groter dan 4 MB. Bewaar het als een kleinere pdf en probeer opnieuw.', 'error'); return; }
    busy(btn, async () => {
      const data = await readAsBase64(file);
      await rpc('mgr_upload_payslip', { p_staff_id: btn.dataset.slipUp, p_month: toDateInput(m), p_file_name: file.name, p_content_type: type, p_data: data });
      toast(`Loonfiche geüpload voor ${(people.find(p => p.id === btn.dataset.slipUp) || {}).name || 'deze persoon'}.`);
      renderView();
    }).catch(() => {});
  });
  $$('[data-slip-rm]', el).forEach(b => b.addEventListener('click', async () => {
    const ok = await modal.confirm({ title: `Loonfiche van ${b.dataset.name} verwijderen?`, body: `Die persoon kan de loonfiche van ${esc(label)} dan niet meer downloaden.`, ok: 'Loonfiche verwijderen', danger: true });
    if (!ok) return;
    busy(null, async () => { await rpc('mgr_remove_payslip', { p_id: b.dataset.slipRm }); toast('Loonfiche verwijderd.'); renderView(); }).catch(() => {});
  }));
  const ym = `${m.getFullYear()}-${pad(m.getMonth() + 1)}`;
  $('#csv-sum', el).addEventListener('click', () => downloadCsv(`uren-overzicht-${ym}.csv`, [
    ['Naam', 'Gewerkte uren', 'Geplande uren', 'Gewerkte shiften', 'Geplande shiften', 'Te laat', 'Vroeger weg', 'Niet gekomen', 'Uurloon', 'Geschat loon'],
    ...people.map(p => [p.name, fmt.hours2(p.worked_minutes), fmt.hours2(p.scheduled_minutes), p.entries, p.shifts, p.late, p.left_early, p.missed,
      p.hourly_rate != null ? num(p.hourly_rate, 2) : '', p.hourly_rate != null ? num(p.worked_minutes / 60 * p.hourly_rate, 2) : '']),
  ]));
  $('#csv-all', el).addEventListener('click', () => downloadCsv(`uren-registraties-${ym}.csv`, [
    ['Naam', 'Datum', 'Ingeklokt', 'Uitgeklokt', 'Uren', 'Begin shift', 'Einde shift', 'Functie', 'Aangepast', 'Opmerking'],
    ...rep.entries.map(x => [x.name, toDateInput(new Date(x.clock_in)), toTimeInput(new Date(x.clock_in)), x.clock_out ? toTimeInput(new Date(x.clock_out)) : '',
      x.clock_out ? fmt.hours2(minutesBetween(x.clock_in, x.clock_out)) : '', x.shift_start ? toTimeInput(new Date(x.shift_start)) : '',
      x.shift_end ? toTimeInput(new Date(x.shift_end)) : '', x.label || '', x.edited ? 'ja' : '', x.note]),
  ]));
}

function personDetail(p, rep) {
  const entries = rep.entries.filter(x => x.staff_id === p.id).slice().reverse();
  const missed = rep.missed.filter(x => x.staff_id === p.id);
  return `
    ${missed.length ? `<p class="hint bad" style="margin:8px 0">Niet gekomen: ${missed.map(s => `${fmt.day(s.starts_at)} ${fmt.range(s.starts_at, s.ends_at)}`).join(' · ')}</p>` : ''}
    ${entries.length ? entries.map(x => `
      <div class="entry">
        <div class="row-main">
          <span class="entry-when">${fmt.day(x.clock_in)}${x.label ? ` <span class="muted small">· ${esc(x.label)}</span>` : ''}</span>
          <div class="entry-io">${stamps(x)}${x.shift_start ? `<span class="muted small">shift ${fmt.range(x.shift_start, x.shift_end)}</span>` : '<span class="muted small">geen shift</span>'}</div>
          <div class="pills">${entryFlags(x, rep.grace_minutes)}</div>
        </div>
        <div class="row-actions" style="flex-direction:column;align-items:flex-end">
          <span class="entry-dur">${x.clock_out ? fmt.dur(minutesBetween(x.clock_in, x.clock_out)) : '—'}</span>
          <button class="sm" data-edit-entry="${x.id}">Wijzigen</button>
        </div>
        ${x.note ? `<p class="entry-note">${esc(x.note)}</p>` : ''}
      </div>`).join('') : '<p class="empty">Geen registraties deze maand.</p>'}`;
}

function entryModal(x, staffId) {
  const t = now();
  const viewed = S.month || startOfMonth(t);
  const base = x ? new Date(x.clock_in) : (sameDay(viewed, startOfMonth(t)) ? t : addDays(addMonths(viewed, 1), -1));
  const inV = x ? new Date(x.clock_in) : atTime(base, '17:30');
  const outV = x ? (x.clock_out ? new Date(x.clock_out) : null) : atTime(base, '22:30');
  const monthEnd = addDays(addMonths(startOfMonth(base), 1), -1);
  modal.open(`
    <h2 id="modal-title">${x ? `Uren van ${esc(x.name)} wijzigen` : 'Registratie toevoegen'}</h2>
    <p>${x ? (x.pending ? 'Voor deze registratie wacht een aanvraag bij Aanvragen.' : 'Wijzigingen tellen meteen mee.') : 'Voor iemand die gewerkt heeft maar niet inklokte.'}</p>
    <form id="en-form" novalidate>
      <div class="form-grid">
        ${x ? '' : `<div class="field wide"><label for="en-staff">Persoon</label><select id="en-staff">${(S.staff || []).map(p => `<option value="${p.id}" ${p.id === staffId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>`}
        <div class="field wide"><label for="en-day">Dag</label>${dateField('en-day', inV, startOfMonth(base), monthEnd < t ? monthEnd : t)}</div>
        <div class="field"><label for="en-in">Ingeklokt</label>${timeField('en-in', toTimeInput(inV))}</div>
        <div class="field"><label for="en-out">Uitgeklokt</label>${timeField('en-out', outV ? toTimeInput(outV) : '', { required: false })}<span class="help">Leeg betekent nog ingeklokt.</span></div>
        <div class="field wide"><label for="en-note">Opmerking</label><input id="en-note" maxlength="300" value="${x ? esc(x.note) : ''}"></div>
      </div>
      <p class="form-error" id="en-err"></p>
      <div class="form-actions" style="justify-content:${x ? 'space-between' : 'flex-end'}">
        ${x ? '<button type="button" class="danger" id="en-remove">Registratie verwijderen</button>' : ''}
        <span class="toolbar"><button type="button" data-close>Annuleren</button><button type="submit" class="primary">Opslaan</button></span>
      </div>
    </form>`, d => {
    $('#en-form', d).addEventListener('submit', async ev => {
      ev.preventDefault();
      const err = $('#en-err', d);
      const inHM = parseHM($('#en-in', d).value), outRaw = $('#en-out', d).value.trim(), outHM = parseHM(outRaw);
      if (!inHM) { err.textContent = 'Vul het inkloktijdstip in, bv. 17:30.'; return; }
      if (outRaw && !outHM) { err.textContent = 'Vul het uitkloktijdstip in, bv. 22:30.'; return; }
      const { a, b } = spanFor($('#en-day', d).value, inHM, outHM);
      const btn = $('button[type=submit]', d);
      btn.disabled = true;
      try {
        await rpc('mgr_save_entry', {
          p_id: x ? x.id : null, p_staff_id: x ? x.staff_id : $('#en-staff', d).value,
          p_in: a.toISOString(), p_out: b ? b.toISOString() : null, p_note: $('#en-note', d).value,
        });
        modal.close(); toast('Uren opgeslagen.'); renderView();
      } catch (e) { err.textContent = e.message; btn.disabled = false; }
    });
    const rm = $('#en-remove', d);
    if (rm) rm.addEventListener('click', async () => {
      const ok = await modal.confirm({ title: 'Deze registratie verwijderen?', body: `${esc(x.name)}, ${fmt.day(x.clock_in)} ${fmt.time(x.clock_in)}. Ze telt dan niet meer mee voor de uren.`, ok: 'Registratie verwijderen', danger: true });
      if (!ok) return;
      busy(null, async () => { await rpc('mgr_remove_entry', { p_id: x.id }); toast('Registratie verwijderd.'); renderView(); }).catch(() => {});
    });
  });
}

/* ------------------------------------------------------- manager: requests */

async function viewRequests(el, current) {
  const r = await rpc('mgr_requests');
  if (!current()) return;
  S.pending = r.pending.length; updateBadges();
  el.innerHTML = `
    <div class="view-head"><div><h1>Aanvragen</h1><p>Aanpassingen van uren door je personeel. Uren veranderen pas als je goedkeurt.</p></div></div>
    <section class="card">
      <div class="card-head"><h2>Wacht op jou</h2><span class="pill ${r.pending.length ? 'accent' : ''}">${r.pending.length}</span></div>
      ${r.pending.length ? `<div class="rows">${r.pending.map(q => {
        const newMins = q.proposed_out ? minutesBetween(q.proposed_in, q.proposed_out) : null;
        const oldMins = q.current_in && q.current_out ? minutesBetween(q.current_in, q.current_out) : null;
        return `<div class="row" style="grid-template-columns:minmax(0,1fr)">
          <div class="row-main">
            <div class="person"><span class="avatar">${esc(initials(q.name))}</span><span class="row-title">${esc(q.name)} · ${q.entry_id ? 'aanpassing' : 'vergeten uren'} voor ${fmt.dayLong(q.proposed_in)}</span></div>
            <dl class="compare">
              ${q.entry_id ? `<dt>Geregistreerd</dt><dd><span class="entry-io">${stamps({ clock_in: q.current_in, clock_out: q.current_out })}</span> ${oldMins != null ? `<span class="muted small">${fmt.dur(oldMins)}</span>` : ''}</dd>` : ''}
              <dt>Gevraagd</dt><dd><span class="entry-io">${stamps({ clock_in: q.proposed_in, clock_out: q.proposed_out })}</span> ${newMins != null ? `<strong class="mono small">${fmt.dur(newMins)}</strong>` : ''}</dd>
              ${q.shift ? `<dt>Shift</dt><dd class="muted small">${fmt.range(q.shift.starts_at, q.shift.ends_at)}${q.shift.label ? ' · ' + esc(q.shift.label) : ''}</dd>` : ''}
              <dt>Reden</dt><dd>“${esc(q.reason)}”</dd>
            </dl>
          </div>
          <div class="row-actions" style="justify-content:flex-start">
            <button class="primary sm" data-approve="${q.id}">Goedkeuren</button>
            <button class="sm danger" data-reject="${q.id}">Niet goedkeuren</button>
          </div>
        </div>`;
      }).join('')}</div>` : '<p class="empty">Alles bijgewerkt. Niets goed te keuren.</p>'}
    </section>
    ${r.recent.length ? `<section class="card"><h2>Onlangs beslist</h2><div class="rows">${r.recent.map(q => `
      <div class="row"><div class="row-main"><span class="row-title">${esc(q.name)} · ${fmt.day(q.proposed_in)} <span class="time">${fmt.time(q.proposed_in)} – ${q.proposed_out ? fmt.time(q.proposed_out) : 'nog bezig'}</span></span>
      <span class="row-sub">“${esc(q.reason)}”${q.decided_by ? ` · door ${esc(q.decided_by)}` : ''}</span></div>
      <span class="pill ${q.status === 'approved' ? 'on' : 'bad'}">${q.status === 'approved' ? 'Goedgekeurd' : 'Niet goedgekeurd'}</span></div>`).join('')}</div></section>` : ''}`;
  const decide = (b, approve) => busy(b, async () => {
    await rpc('mgr_decide_request', { p_id: approve ? b.dataset.approve : b.dataset.reject, p_approve: approve });
    toast(approve ? 'Goedgekeurd. Uren bijgewerkt.' : 'Niet goedgekeurd.');
    renderView();
  }).catch(() => {});
  $$('[data-approve]', el).forEach(b => b.addEventListener('click', () => decide(b, true)));
  $$('[data-reject]', el).forEach(b => b.addEventListener('click', () => decide(b, false)));
}

/* ----------------------------------------------------------- manager: team */

async function viewTeam(el, current) {
  const staff = await loadStaff(true);
  if (!current()) return;
  const link = location.origin + location.pathname;
  const st = S.settings;
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const cutLabel = h => h === 0 ? 'De shift begint' : h === 168 ? '1 week ervoor' : `${h} uur ervoor`;
  el.innerHTML = `
    <div class="view-head"><div><h1>Team</h1><p>Voeg mensen toe, reset pincodes en stel de app in.</p></div></div>
    <section class="card">
      <h2>Delen met je personeel</h2>
      <p class="muted" style="margin-top:6px">Stuur deze link. Iedereen meldt zich aan met de eigen naam en de pincode die je hieronder instelt.</p>
      <div class="copybox" style="margin-top:12px"><code id="share-link">${esc(link)}</code><button class="sm" id="copy-link">Link kopiëren</button></div>
    </section>
    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h2>Mensen</h2><span class="pill">${staff.filter(p => p.active).length} actief</span></div>
        <div class="rows">${staff.map(p => `
          <div class="row">
            <div class="person"><span class="avatar">${esc(initials(p.name))}</span>
              <div class="row-main"><span class="row-title">${esc(p.name)}${p.id === S.me.id ? ' (jij)' : ''}</span>
              <span class="row-sub">${p.role === 'manager' ? 'Verantwoordelijke' : 'Medewerker'}${p.contract_type ? ` · ${CONTRACT_SHORT[p.contract_type]}` : ''}${p.hourly_rate != null ? ` · ${fmt.money(p.hourly_rate)}/u` : ''}${p.payroll_id ? ` · nr. ${esc(p.payroll_id)}` : ''}</span></div></div>
            <div class="row-actions">
              ${p.locked ? '<span class="pill bad">Geblokkeerd</span>' : ''}${p.active ? '' : '<span class="pill">Inactief</span>'}
              <button class="sm" data-person="${p.id}">Wijzigen</button>
            </div>
          </div>`).join('')}</div>
      </section>
      <section class="card">
        <h2>Persoon toevoegen</h2>
        <form id="add-person" novalidate>
          <div class="form-grid" style="margin-top:12px">
            <div class="field wide"><label for="ap-name">Naam</label><input id="ap-name" maxlength="60" placeholder="Voornaam en eerste letter van de achternaam" required><span class="help">Hiermee meldt die persoon zich aan.</span></div>
            <div class="field"><label for="ap-pin">Pincode</label><input id="ap-pin" class="pin-input" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="4–8 cijfers" required></div>
            <div class="field"><label for="ap-rate">Uurloon (€)</label><input id="ap-rate" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Optioneel"></div>
            <div class="field"><label for="ap-type">Statuut</label><select id="ap-type">${contractOptions('')}</select></div>
            <div class="field"><label for="ap-pid">Werknemersnummer (Securex)</label><input id="ap-pid" maxlength="30" autocomplete="off" placeholder="Optioneel"></div>
            <div class="field wide"><label for="ap-role">Rol</label><select id="ap-role"><option value="staff">Medewerker</option><option value="manager">Verantwoordelijke (ziet alles)</option></select></div>
          </div>
          <p class="form-error" id="ap-err"></p>
          <div class="form-actions"><button type="submit" class="primary">Persoon toevoegen</button></div>
        </form>
      </section>
    </div>
    <section class="card">
      <h2>Instellingen</h2>
      <form id="settings-form" novalidate>
        <div class="form-grid" style="margin-top:12px">
          <div class="field wide"><label for="st-biz">Naam van de zaak</label><input id="st-biz" maxlength="80" value="${esc(st.business_name)}"></div>
          <div class="field"><label for="st-cut">Personeel kan een shift teruggeven tot</label><select id="st-cut">${[0, 12, 24, 48, 72, 168].map(h => `<option value="${h}" ${h === st.drop_cutoff_hours ? 'selected' : ''}>${cutLabel(h)}</option>`).join('')}${[0, 12, 24, 48, 72, 168].includes(st.drop_cutoff_hours) ? '' : `<option value="${st.drop_cutoff_hours}" selected>${cutLabel(st.drop_cutoff_hours)}</option>`}</select></div>
          <div class="field"><label for="st-grace">Speling</label><select id="st-grace">${[0, 5, 10, 15].map(g => `<option value="${g}" ${g === st.grace_minutes ? 'selected' : ''}>${g} minuten</option>`).join('')}${[0, 5, 10, 15].includes(st.grace_minutes) ? '' : `<option value="${st.grace_minutes}" selected>${st.grace_minutes} minuten</option>`}</select><span class="help">Hoeveel minuten iemand te laat of te vroeg mag zijn voor het telt.</span></div>
          <div class="field"><label for="st-cur">Valutateken</label><input id="st-cur" maxlength="4" value="${esc(st.currency)}"></div>
          <div class="field wide"><label>Tijdzone</label>
            <div class="copybox"><code>${esc(st.timezone || 'Niet ingesteld')}</code>${deviceTz && deviceTz !== st.timezone ? `<button type="button" class="sm" id="st-tz">${esc(deviceTz)} gebruiken</button>` : ''}</div>
            <span class="help">Vaste shiften worden in deze tijdzone aangemaakt.</span></div>
        </div>
        <p class="form-error" id="st-err"></p>
        <div class="form-actions"><button type="submit" class="primary">Instellingen opslaan</button></div>
      </form>
    </section>`;

  $('#copy-link', el).addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(link); toast('Link gekopieerd.'); }
    catch {
      const r = document.createRange(); r.selectNodeContents($('#share-link', el));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      toast('Druk op Ctrl+C of ⌘C om te kopiëren.');
    }
  });
  const ap = $('#add-person', el);
  ap.addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('#ap-err', el);
    err.textContent = '';
    const name = $('#ap-name', ap).value.trim(), pin = $('#ap-pin', ap).value.trim(), rate = $('#ap-rate', ap).value;
    if (!name) { err.textContent = 'Vul een naam in.'; return; }
    if (!/^\d{4,8}$/.test(pin)) { err.textContent = 'De pincode moet 4 tot 8 cijfers hebben.'; return; }
    await busy($('button[type=submit]', ap), async () => {
      const added = await rpc('mgr_save_staff', { p_id: null, p_name: name, p_pin: pin, p_role: $('#ap-role', ap).value, p_hourly_rate: rate === '' ? null : Number(rate), p_active: true });
      const type = $('#ap-type', ap).value, pid = $('#ap-pid', ap).value.trim();
      if (type || pid) await rpc('mgr_save_staff_payroll', { p_id: added.id, p_contract_type: type || null, p_payroll_id: pid });
      toast(`${name} toegevoegd. Geef de pincode door: ${pin}`);
      renderView();
    }).catch(e => { err.textContent = e.message; });
  });
  $$('[data-person]', el).forEach(b => b.addEventListener('click', () => personModal(staff.find(p => p.id === b.dataset.person))));
  const tzBtn = $('#st-tz', el);
  if (tzBtn) tzBtn.addEventListener('click', () => busy(tzBtn, async () => {
    await rpc('mgr_set_timezone', { p_tz: deviceTz });
    await refreshMe();
    toast('Tijdzone bijgewerkt.');
    renderView();
  }).catch(() => {}));
  const sf = $('#settings-form', el);
  sf.addEventListener('submit', async ev => {
    ev.preventDefault();
    await busy($('button[type=submit]', sf), async () => {
      await rpc('mgr_save_settings', {
        p_business_name: $('#st-biz', sf).value, p_drop_cutoff_hours: Number($('#st-cut', sf).value),
        p_grace_minutes: Number($('#st-grace', sf).value), p_currency: $('#st-cur', sf).value,
      });
      await refreshMe();
      toast('Instellingen opgeslagen.');
      renderShell();
    }).catch(e => { $('#st-err', sf).textContent = e.message; });
  });
}

function personModal(p) {
  const self = p.id === S.me.id;
  modal.open(`
    <h2 id="modal-title">${esc(p.name)} wijzigen</h2>
    ${p.locked ? '<p class="hint bad">Geblokkeerd na te veel verkeerde pincodes. Stel een nieuwe pincode in om te deblokkeren.</p>' : ''}
    <form id="pm-form" novalidate>
      <div class="form-grid">
        <div class="field wide"><label for="pm-name">Naam</label><input id="pm-name" maxlength="60" value="${esc(p.name)}" required></div>
        <div class="field"><label for="pm-pin">Nieuwe pincode</label><input id="pm-pin" class="pin-input" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="Leeg laten om te behouden"></div>
        <div class="field"><label for="pm-rate">Uurloon (€)</label><input id="pm-rate" type="number" min="0" step="0.01" inputmode="decimal" value="${p.hourly_rate ?? ''}"></div>
        <div class="field"><label for="pm-type">Statuut</label><select id="pm-type">${contractOptions(p.contract_type)}</select></div>
        <div class="field"><label for="pm-pid">Werknemersnummer (Securex)</label><input id="pm-pid" maxlength="30" autocomplete="off" value="${esc(p.payroll_id || '')}"><span class="help">Staat op de loonfiche. Nodig voor het bestand voor Securex.</span></div>
        <div class="field wide"><label for="pm-role">Rol</label><select id="pm-role"><option value="staff">Medewerker</option><option value="manager" ${p.role === 'manager' ? 'selected' : ''}>Verantwoordelijke</option></select></div>
        <div class="field wide"><label class="check"><input type="checkbox" id="pm-active" ${p.active ? 'checked' : ''} ${self ? 'disabled' : ''}> Actief</label>
          <span class="help">${self ? 'Je kan jezelf niet op inactief zetten.' : 'Inactieve mensen kunnen zich niet aanmelden en hun toekomstige shiften komen weer open te staan. Hun uren blijven bewaard.'}</span></div>
      </div>
      <p class="form-error" id="pm-err"></p>
      <div class="form-actions"><button type="button" data-close>Annuleren</button><button type="submit" class="primary">Opslaan</button></div>
    </form>`, d => {
    $('#pm-form', d).addEventListener('submit', async ev => {
      ev.preventDefault();
      const err = $('#pm-err', d);
      const pin = $('#pm-pin', d).value.trim(), rate = $('#pm-rate', d).value;
      if (pin && !/^\d{4,8}$/.test(pin)) { err.textContent = 'De pincode moet 4 tot 8 cijfers hebben.'; return; }
      const btn = $('button[type=submit]', d);
      btn.disabled = true;
      try {
        await rpc('mgr_save_staff', {
          p_id: p.id, p_name: $('#pm-name', d).value, p_pin: pin || null, p_role: $('#pm-role', d).value,
          p_hourly_rate: rate === '' ? null : Number(rate), p_active: self ? true : $('#pm-active', d).checked,
        });
        await rpc('mgr_save_staff_payroll', { p_id: p.id, p_contract_type: $('#pm-type', d).value || null, p_payroll_id: $('#pm-pid', d).value.trim() });
        modal.close();
        toast(pin ? `Opgeslagen. Nieuwe pincode: ${pin}` : 'Opgeslagen.');
        if (self) { await refreshMe(); renderShell(); } else renderView();
      } catch (e) { err.textContent = e.message; btn.disabled = false; }
    });
  });
}

boot();
