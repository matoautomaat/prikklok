'use strict';

/* Prikklok — staff pick shifts, clock in and out, fix their times, keep their
   profile and avatar up to date and level up by working; managers schedule,
   approve fixes, upload payslips and contracts and read the monthly hours.
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
  memberId: null,      // team member open in the member view
  levelUp: null,       // { from, to } when the signed-in person just went up a level
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
  'Fill in the client ID and client secret from Officient first.': 'Vul eerst de client ID en de client secret van Officient in.',
  'Fill in the client ID and client secret from Officient.': 'Vul de client ID en de client secret van Officient in.',
  'Grace period must be between 0 and 120 minutes.': 'De speling moet tussen 0 en 120 minuten liggen.',
  'Number of people must be between 1 and 20.': 'Het aantal personen moet tussen 1 en 20 liggen.',
  'Officient gave no lasting access. Connect again.': 'Officient gaf geen blijvende toegang. Koppel opnieuw.',
  'Officient is already being read. Try again in a few minutes.': 'De app haalt al gegevens op bij Officient. Probeer het over enkele minuten opnieuw.',
  'Officient is busy. Try again later.': 'Officient is druk bezet. Probeer het later opnieuw.',
  "Officient isn't connected yet.": 'Officient is nog niet gekoppeld.',
  'Officient refused the connection. Connect again under Team.': 'Officient weigerde de koppeling. Koppel opnieuw bij Team.',
  'Officient sent no code back. Connect again.': 'Officient stuurde geen code terug. Koppel opnieuw.',
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
  'Pick cash or registered.': 'Kies cash of ingeschreven.',
  'Say briefly why you give this shift back.': 'Zeg kort waarom je deze shift teruggeeft.',
  'Someone else already picked up this shift.': 'Iemand anders heeft deze shift al opgenomen.',
  'Someone on the team already has that name. Try adding a last initial.': 'Iemand in het team heeft die naam al. Voeg bijvoorbeeld de eerste letter van de achternaam toe.',
  "Start and end can't be the same time.": 'Begin en einde kunnen niet hetzelfde uur zijn.',
  "That file couldn't be read. Try again.": 'Dat bestand kon niet gelezen worden. Probeer opnieuw.',
  'That file is empty.': 'Dat bestand is leeg.',
  'That file is over 4 MB. Save it as a smaller PDF and try again.': 'Dat bestand is groter dan 4 MB. Bewaar het als een kleinere pdf en probeer opnieuw.',
  "That isn't one of your shifts.": 'Dat is geen shift van jou.',
  'The Officient sign-in took too long or came from elsewhere. Connect again.': 'Het aanmelden bij Officient duurde te lang of kwam van elders. Koppel opnieuw.',
  'This account can only look at the overview.': 'Dit account kan alleen het overzicht bekijken.',
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
  "You're not on the schedule right now. Pick up a shift first, or ask your manager.": 'Je staat nu niet op de planning. Neem eerst een shift op, of vraag het aan je verantwoordelijke.',
  "These details couldn't be saved.": 'Deze gegevens konden niet opgeslagen worden.',
  'Check the email address.': 'Controleer het e-mailadres.',
  'Check the national register number (11 digits).': 'Controleer het rijksregisternummer (11 cijfers).',
  'Check the IBAN account number.': 'Controleer het rekeningnummer (IBAN).',
  'Check the dates.': 'Controleer de datums.',
  'Check the date of birth.': 'Controleer de geboortedatum.',
  "That avatar couldn't be saved.": 'Die avatar kon niet opgeslagen worden.',
  "Your current PIN isn't right.": 'Je huidige pincode klopt niet.',
  "That contract isn't available.": 'Dat contract is niet beschikbaar.',
  'The end date must be after the start date.': 'De einddatum moet na de begindatum liggen.',
  'Check the amounts.': 'Controleer de bedragen.',
  'Early check-in must be between 0 and 120 minutes.': 'Vroeger inklokken moet tussen 0 en 120 minuten liggen.',
  'Bonus XP must be between 0 and 100000.': 'Bonus-XP moet tussen 0 en 100.000 liggen.',
};
const SERVER_NL_PATTERNS = [
  [/^(.+) already has a shift that overlaps one of these\.$/, '$1 heeft al een shift die met een van deze overlapt.'],
  [/^(.+) already has a shift that overlaps\.$/, '$1 heeft op dat moment al een shift.'],
  [/^Shifts can't be dropped less than (\d+) hours before they start\. Ask your manager\.$/, 'Je kan een shift niet meer teruggeven minder dan $1 uur voor het begin. Vraag het aan je verantwoordelijke.'],
  [/^Too many wrong PINs\. Try again in (\d+) min, or ask your manager to reset your PIN\.$/, 'Te vaak een verkeerde pincode. Probeer opnieuw over $1 min, of vraag je verantwoordelijke om een nieuwe pincode.'],
  [/^Your shift starts at (\d\d:\d\d)\. You can check in from (\d\d:\d\d)\.$/, 'Je shift begint om $1. Je kan inklokken vanaf $2.'],
  [/^That item unlocks at level (\d+)\.$/, 'Dat krijg je pas vanaf level $1.'],
  [/^Officient answered (\d+)( for .*)?\.$/, 'Officient gaf een fout ($1). Probeer het later opnieuw.'],
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

async function rpc(fn, args = {}, { auth = true, path = `/rest/v1/rpc/${fn}` } = {}) {
  const body = auth ? { p_token: S.token, ...args } : args;
  const headers = { 'Content-Type': 'application/json', apikey: CFG.key };
  if (CFG.key.startsWith('ey')) headers.Authorization = 'Bearer ' + CFG.key;
  let res;
  try {
    res = await fetch(`${CFG.url}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
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
  checkLevelUp();
  return r;
}

/* --------------------------------------------------------------- dates */

const LOCALE = 'nl-BE';
const HM = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
const now = () => new Date(Date.now() + S.offset);
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
// Weeks start on Monday, as in Belgium.
const weekdayIndex = d => (new Date(d).getDay() + 6) % 7;
const startOfWeek = d => { const x = startOfDay(d); return addDays(x, -weekdayIndex(x)); };
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
const isViewer = () => S.me && S.me.role === 'viewer';

/* ------------------------------------------------ people, avatars, levels */

// A person's picture for lists: their avatar's head, or their initials.
function personPic(p, cls = '') {
  return p && p.avatar
    ? `<span class="avatar pic ${cls}" aria-hidden="true">${Avatar.head(p.avatar)}</span>`
    : `<span class="avatar ${cls}" aria-hidden="true">${esc(initials(p && p.name))}</span>`;
}
const picFor = (id, name, cls = '') => personPic((S.staff || []).find(p => p.id === id) || { name }, cls);

// Level L needs 12.5 * (L - 1) * (L + 2) XP (5225 for level 20), the same formula as the database.
const LEVEL_TITLES = ['Nieuwkomer', 'Starter', 'Teamspeler', 'Vaste waarde', 'Doorzetter', 'Ster', 'Topper', 'Kampioen', 'Held', 'Legende',
  'Meester', 'Grootmeester', 'Kanjer', 'Tijger', 'Kraanvogel', 'Feniks', 'Draak', 'Keizer', 'Jade', 'Gouden draak'];
const xpForLevel = l => 12.5 * (l - 1) * (l + 2);
const levelTitle = l => LEVEL_TITLES[Math.min(l, LEVEL_TITLES.length) - 1];
const levelPill = xp => `<span class="pill lvl">Level ${xp ? xp.level : 1}</span>`;
function xpBar(xp) {
  const l = xp.level, a = xpForLevel(l), b = xpForLevel(l + 1);
  const pct = Math.max(0, Math.min(100, Math.round((xp.xp - a) / (b - a) * 100)));
  return `<div class="xpbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Op weg naar level ${l + 1}"><span style="width:${pct}%"></span></div>
    <p class="xp-text"><span class="mono">${xp.xp} XP</span><span class="muted">nog ${b - xp.xp} XP tot level ${l + 1}</span></p>`;
}

function checkLevelUp() {
  if (!S.me || !S.me.xp) return;
  const key = `prikklok.level.${S.me.id}`, lvl = S.me.xp.level, seen = Number(store.get(key) || 0);
  store.set(key, String(lvl));
  if (seen && lvl > seen) S.levelUp = { from: seen, to: lvl };
}
function showLevelUp() {
  const up = S.levelUp;
  if (!up || $('#modal').open) return;
  S.levelUp = null;
  const rewards = [];
  for (let l = up.from + 1; l <= up.to; l++) rewards.push(...Avatar.rewardsAt(l));
  const d = modal.open(`
    <div class="levelup">
      <div class="levelup-pic">${S.me.avatar ? Avatar.render(S.me.avatar, { view: 'bust' }) : `<span class="levelup-num">${up.to}</span>`}</div>
      <p class="section-label">Level omhoog</p>
      <h2 id="modal-title">Level ${up.to} · ${esc(levelTitle(up.to))}</h2>
      <p>Goed bezig, ${esc(S.me.name.split(' ')[0])}! ${rewards.length > 4 ? `Je hebt <strong>${rewards.length} nieuwe dingen</strong> voor je avatar vrijgespeeld.`
        : rewards.length ? `Nieuw voor je avatar: <strong>${rewards.map(esc).join(', ')}</strong>.` : 'Blijf zo doorgaan voor de volgende beloning.'}</p>
    </div>
    <div class="form-actions"><button type="button" data-close>Sluiten</button>${rewards.length ? '<button type="button" class="primary" id="lu-avatar">Avatar aanpassen</button>' : ''}</div>`);
  const b = $('#lu-avatar', d);
  if (b) b.addEventListener('click', () => { modal.close(); openAvatarEditor(); });
}

/* -------------------------------------------- personal details and dates */

// "30/07/1985", "30-7-1985", "30.07.1985" or "1985-07-30" -> "1985-07-30"; "" -> ""; else null
function parseDMY(v) {
  const t = String(v || '').trim();
  if (!t) return '';
  let m = t.match(/^(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{4})$/), y, mo, d;
  if (m) [, d, mo, y] = m.map(Number); else if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [, y, mo, d] = m.map(Number); else return null;
  const x = new Date(y, mo - 1, d);
  return x.getFullYear() === y && x.getMonth() === mo - 1 && x.getDate() === d ? `${y}-${pad(mo)}-${pad(d)}` : null;
}
const isoToDMY = iso => iso ? dmy(new Date(iso + 'T00:00')) : '';
const fmtNid = v => v && v.length === 11 ? `${v.slice(0, 2)}.${v.slice(2, 4)}.${v.slice(4, 6)}-${v.slice(6, 9)}.${v.slice(9)}` : (v || '');
const fmtIban = v => (v || '').replace(/(.{4})/g, '$1 ').trim();
const cleanNid = v => String(v || '').replace(/\D/g, '');
const cleanIban = v => String(v || '').replace(/\s/g, '').toUpperCase();
// "1.234,56", "1234,56" or "1234.56" -> 1234.56; "" -> null; else NaN
function parseMoney(v) {
  const t = String(v ?? '').trim().replace(/\s|€/g, '');
  if (!t) return null;
  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(t) || /^\d+(,\d{1,2})?$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'));
  if (/^\d+(\.\d{1,2})?$/.test(t)) return Number(t);
  return NaN;
}
const moneyInput = n => n == null ? '' : num(n, 2).replace(/\s/g, '');

// [key, label, options]; the same fields for the person and for a manager.
const PROFILE_FIELDS = [
  ['phone', 'Telefoon', { type: 'tel', max: 30, auto: 'tel' }],
  ['email', 'E-mail', { type: 'email', max: 120, auto: 'email' }],
  ['birth_date', 'Geboortedatum', { date: true, auto: 'bday' }],
  ['national_id', 'Rijksregisternummer', { max: 15, ph: '00.00.00-000.00', mono: true, mode: 'numeric', help: 'Staat op de achterkant van je identiteitskaart.' }],
  ['street', 'Straat en huisnummer', { max: 120, auto: 'address-line1', wide: true }],
  ['postcode', 'Postcode', { max: 10, auto: 'postal-code', mode: 'numeric' }],
  ['city', 'Gemeente', { max: 80, auto: 'address-level2' }],
  ['iban', 'Rekeningnummer (IBAN)', { max: 42, ph: 'BE00 0000 0000 0000', mono: true, wide: true, help: 'Hierop krijg je je loon.' }],
  ['emergency_name', 'Noodcontact: naam', { max: 80 }],
  ['emergency_phone', 'Noodcontact: telefoon', { type: 'tel', max: 30 }],
];
const FIELD_LABEL = Object.fromEntries(PROFILE_FIELDS.map(([k, l]) => [k, l]));
const showValue = (k, v) => k === 'national_id' ? fmtNid(v) : k === 'iban' ? fmtIban(v) : /date/.test(k) ? isoToDMY(v) : (v ?? '');

function profileFields(prefix, pr) {
  return PROFILE_FIELDS.map(([k, label, o]) => `
    <div class="field${o.wide ? ' wide' : ''}"><label for="${prefix}-${k}">${label}</label>
      <input id="${prefix}-${k}" data-k="${k}" ${o.type ? `type="${o.type}"` : ''} maxlength="${o.max || 10}" ${o.auto ? `autocomplete="${o.auto}"` : 'autocomplete="off"'}
        ${o.mode ? `inputmode="${o.mode}"` : ''} ${o.date ? 'inputmode="numeric" placeholder="dd/mm/jjjj"' : o.ph ? `placeholder="${o.ph}"` : ''} class="${o.mono ? 'mono-field' : ''}"
        value="${esc(showValue(k, pr[k]))}">${o.help ? `<span class="help">${o.help}</span>` : ''}</div>`).join('');
}
// Reads the fields back; returns { values } or { error }.
function readProfile(root) {
  const out = {};
  for (const inp of $$('input[data-k]', root)) {
    const k = inp.dataset.k, v = inp.value.trim();
    if (k === 'birth_date' || k === 'start_date') {
      const iso = parseDMY(v);
      if (iso == null) return { error: `Vul de ${k === 'birth_date' ? 'geboortedatum' : 'datum van indiensttreding'} in als dd/mm/jjjj, bv. 30/07/1999.`, field: inp };
      out[k] = iso;
    } else if (k === 'national_id') {
      const d = cleanNid(v);
      if (d && !Loonfiche.validNationalId(d)) return { error: 'Dat rijksregisternummer klopt niet. Het heeft 11 cijfers, bv. 85.07.30-033.28.', field: inp };
      out[k] = d;
    } else if (k === 'iban') {
      const d = cleanIban(v);
      if (d && !Loonfiche.validIban(d)) return { error: 'Dat rekeningnummer klopt niet. Controleer de IBAN, bv. BE68 5390 0754 7034.', field: inp };
      out[k] = d;
    } else out[k] = v;
  }
  return { values: out };
}

async function downloadFile(fn, id, btn) {
  await busy(btn, async () => {
    const f = await rpc(fn, { p_id: id });
    const bin = atob(f.data.replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    saveBlob(f.file_name, new Blob([bytes], { type: f.content_type }));
  }).catch(() => {});
}

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
  profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r=".6" fill="currentColor"/><circle cx="15" cy="10" r=".6" fill="currentColor"/><path d="M8.5 14.5c1.8 2 5.2 2 7 0"/></svg>',
  ranking: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  signout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
};

/* --------------------------------------------------------------- theme */

// Light is the default. theme.js sets it before the page draws; this keeps
// it in step when someone changes it, and follows the phone in "auto".
const THEME_KEY = 'prikklok.theme';
const THEMES = [['light', 'Licht'], ['dark', 'Donker'], ['auto', 'Zoals mijn toestel']];
const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function themePref() {
  try { return localStorage.getItem(THEME_KEY) || 'light'; } catch (e) { return 'light'; }
}
const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
function applyTheme() {
  const pref = themePref();
  const dark = pref === 'dark' || (pref === 'auto' && !!darkQuery && darkQuery.matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#4A0D12' : '#6E141A');
  $$('[data-theme-btn]').forEach(b => {
    b.innerHTML = dark ? ICONS.sun : ICONS.moon;
    b.setAttribute('aria-label', dark ? 'Licht thema' : 'Donker thema');
    b.title = dark ? 'Licht thema' : 'Donker thema';
  });
  $$('[data-theme-pick]').forEach(b => {
    const on = b.dataset.themePick === pref;
    b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on);
  });
}
function setTheme(pref) {
  try { localStorage.setItem(THEME_KEY, pref); } catch (e) { /* private mode: only for now */ }
  applyTheme();
}
if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', () => { if (themePref() === 'auto') applyTheme(); });

function tabsFor() {
  if (isViewer()) return [['family', L('Kalender', '排班')], ['famstaff', L('Personeel', '员工')]];
  return isManager()
    ? [['today', 'Vandaag'], ['schedule', 'Planning'], ['monthly', 'Overzicht'], ['requests', 'Aanvragen'], ['team', 'Team'], ['ranking', 'Ranglijst'], ['profile', 'Profiel']]
    : [['clock', 'Klok'], ['shifts', 'Shiften'], ['hours', 'Mijn uren'], ['ranking', 'Ranglijst'], ['profile', 'Profiel']];
}
const ICON_FOR = { clock: 'clock', shifts: 'shifts', hours: 'hours', profile: 'profile', ranking: 'ranking', today: 'today', schedule: 'shifts', monthly: 'monthly', requests: 'requests', team: 'team' };

/* --------------------------------------------------------------- modal */

const modal = {
  open(html, onMount, { wide = false, sheet = false } = {}) {
    const d = $('#modal');
    d.classList.toggle('wide', wide);
    d.classList.toggle('sheet', sheet);
    d.innerHTML = `<div class="modal-body">${html}</div>`;
    $$('[data-close]', d).forEach(b => b.addEventListener('click', () => modal.close()));
    if (!d.open) d.showModal();
    onMount && onMount(d);
    const first = $('input:not([type=hidden]), select, textarea', d);
    if (first) first.focus();
    return d;
  },
  close() { const d = $('#modal'); if (d.open) d.close(); d.innerHTML = ''; d.classList.remove('wide', 'sheet'); },
  confirm({ title, body = '', ok = 'Bevestigen', cancel = 'Annuleren', danger = false }) {
    return new Promise(resolve => {
      let done = false;
      const finish = v => { if (!done) { done = true; resolve(v); } };
      const d = modal.open(`
        <h2 id="modal-title">${esc(title)}</h2>
        ${body ? `<p>${body}</p>` : ''}
        <div class="form-actions">
          <button type="button" data-close>${esc(cancel)}</button>
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
  $('#app').innerHTML = `<main class="auth${CFG.logo ? ' branded' : ''}"><div class="auth-card">${html}</div></main>`;
}
const authBrand = name => CFG.logo
  ? `<div class="auth-logo"><img src="${esc(CFG.logo)}" alt="${esc(name || 'Logo')}"></div>`
  : '<div class="brand"><span class="mark" aria-hidden="true"></span><span class="section-label">Prikklok</span></div>';

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
    ${authBrand(status.business_name)}
    <div lang="${langAttr()}">
      <h1>${CFG.logo ? 'Prikklok' : esc(status.business_name)}</h1>
      <p class="lede">${L('Meld je aan om in te klokken, shiften op te nemen en je uren te bekijken.', '登录后可以打卡、选班次和查看工时。')}</p>
    </div>
    <form class="card" id="login-form" lang="${langAttr()}" novalidate>
      ${message ? `<p class="hint info">${esc(message)}</p>` : ''}
      <div class="field">
        <label for="login-name">${L('Je naam', '你的名字')}</label>
        <input id="login-name" name="name" autocomplete="username" autocapitalize="words" required>
      </div>
      <div class="field">
        <label for="login-pin">${L('Pincode', '密码')}</label>
        <input id="login-pin" name="pin" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="current-password" required>
      </div>
      <button type="submit" class="primary">${L('Aanmelden', '登录')}</button>
      <p class="form-error" id="login-error"></p>
    </form>
    <p class="muted small" lang="${langAttr()}">${L('Pincode vergeten? Vraag je verantwoordelijke om een nieuwe.', '忘记密码？请负责人给你一个新的。')}</p>
    ${langSwitch()}`);

  bindLang($('#app'), () => showSignIn(message));
  const form = $('#login-form');
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('#login-error');
    err.textContent = '';
    const name = form.name.value.trim(), pin = form.pin.value.trim();
    if (!name || !pin) { err.textContent = L('Vul je naam en pincode in.', '请输入你的名字和密码。'); return; }
    const btn = $('button[type=submit]', form);
    btn.disabled = true; btn.textContent = L('Bezig met aanmelden…', '正在登录…');
    try {
      const r = await rpc('login', { p_name: name, p_pin: pin }, { auth: false });
      if (!r.ok) {
        err.textContent = r.error === "That name and PIN don't match." ? L(tr(r.error), '名字或密码不对。') : tr(r.error);
        form.pin.value = ''; form.pin.focus(); return;
      }
      setToken(r.token);
      await refreshMe();
      location.hash = '';
      renderShell();
    } catch (e) {
      err.textContent = e.message;
    } finally {
      if (btn.isConnected) { btn.disabled = false; btn.textContent = L('Aanmelden', '登录'); }
    }
  });
}

function showSetup() {
  renderAuthShell(`
    ${authBrand('')}
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

// The logo from config.js, or the business name in text.
const logoHTML = cls => CFG.logo
  ? `<img class="${cls}" src="${esc(CFG.logo)}" alt="${esc(S.settings.business_name || 'Logo')}">`
  : `<span class="${cls} logo-text">${esc(S.settings.business_name)}</span>`;

async function askSignOut() {
  const t = isViewer() ? L : nl => nl;
  if (await modal.confirm({
    title: t('Afmelden?', '退出登录？'), body: t('Je hebt je naam en pincode nodig om je opnieuw aan te melden.', '再次登录需要你的名字和密码。'),
    ok: t('Afmelden', '退出'), cancel: t('Annuleren', '取消'),
  })) signOut();
}

// Phones show at most five buttons at the bottom; the rest goes under "Meer".
function bottomTabs() {
  const tabs = tabsFor();
  return tabs.length > 5 ? { main: tabs.slice(0, 4), more: tabs.slice(4) } : { main: tabs, more: [] };
}
function openMore() {
  const { more } = bottomTabs();
  const d = modal.open(`
    <h2 id="modal-title">Meer</h2>
    <div class="sheet-list">
      ${more.map(([k, l]) => `<button type="button" class="sheet-item" data-sheet-tab="${k}">${ICONS[ICON_FOR[k]]}<span>${l}</span></button>`).join('')}
      <button type="button" class="sheet-item" id="sheet-signout">${ICONS.signout}<span>Afmelden</span></button>
    </div>
    <div class="form-actions"><button type="button" data-close>Sluiten</button></div>`, null, { sheet: true });
  $$('[data-sheet-tab]', d).forEach(b => b.addEventListener('click', () => { modal.close(); location.hash = b.dataset.sheetTab; }));
  $('#sheet-signout', d).addEventListener('click', () => { modal.close(); askSignOut(); });
}

function renderShell() {
  if (isViewer()) return renderFamilyShell();
  const tabs = tabsFor(), { main, more } = bottomTabs();
  const badge = k => k === 'requests' ? '<span class="count" data-badge hidden></span>' : '';
  document.title = `${S.settings.business_name} · Prikklok`;
  $('#app').innerHTML = `
    <header class="topbar">
      <div class="topbar-inner">
        <div class="brand">
          <button class="me-btn" id="me-btn" aria-label="Mijn profiel" title="Mijn profiel">${personPic(S.me, 'lg')}${S.me.avatar ? '' : '<span class="me-plus" aria-hidden="true">+</span>'}</button>
          <div class="brand-text">
            <div class="biz">${esc(S.me.name)}</div>
            <div class="who">${isManager() ? 'Verantwoordelijke' : `Level ${S.me.xp ? S.me.xp.level : 1} · ${esc(levelTitle(S.me.xp ? S.me.xp.level : 1))}`}</div>
          </div>
        </div>
        <a class="logo-link" href="#" aria-label="${esc(S.settings.business_name)}, naar het begin">${logoHTML('logo')}</a>
        <div class="topbar-end"><button type="button" class="icon ghost theme-btn" data-theme-btn></button><button class="ghost sm" id="signout">Afmelden</button></div>
      </div>
      <nav class="tabs" aria-label="Onderdelen"><div class="tabs-inner">
        ${tabs.map(([k, l]) => `<button class="tab" data-tab="${k}">${l}${badge(k)}</button>`).join('')}
      </div></nav>
    </header>
    <main class="view" id="view"></main>
    <nav class="bnav" aria-label="Onderdelen">
      ${main.map(([k, l]) => `<button data-tab="${k}">${ICONS[ICON_FOR[k]]}<span>${l}</span>${badge(k)}</button>`).join('')}
      ${more.length ? `<button id="bnav-more" data-more="${more.map(t => t[0]).join(' ')}" aria-haspopup="dialog">${ICONS.more}<span>Meer</span></button>` : ''}
    </nav>`;
  $('#signout').addEventListener('click', askSignOut);
  $('[data-theme-btn]').addEventListener('click', () => setTheme(isDark() ? 'light' : 'dark'));
  applyTheme();
  $$('[data-tab]').forEach(b => b.addEventListener('click', () => { location.hash = b.dataset.tab; }));
  const mb = $('#bnav-more');
  if (mb) mb.addEventListener('click', openMore);
  $('#me-btn').addEventListener('click', () => { location.hash = 'profile'; });
  updateBadges();
  route();
  finishOfficient();
  if (isManager() && !S.settings.timezone) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) quiet(rpc('mgr_set_timezone', { p_tz: tz }).then(() => { S.settings.timezone = tz; renderView(); }));
  }
}

function updateBadges() {
  $$('[data-badge]').forEach(b => { b.hidden = !S.pending; b.textContent = S.pending; });
}

const VIEWS = {
  clock: viewClock, shifts: viewShifts, hours: viewHours, profile: viewProfile, ranking: viewRanking,
  today: viewToday, schedule: viewSchedule, monthly: viewMonthly, requests: viewRequests, team: viewTeam, member: viewMember,
  family: viewFamily, famstaff: viewFamilyStaff,
};

// #profile works for everyone (managers reach it through their picture);
// #team/<id> opens one team member for managers, #family and #famstaff show
// them what the family account sees.
function route() {
  if (!S.me) return;
  const tabs = tabsFor().map(t => t[0]);
  let v = location.hash.replace('#', ''), tab = v;
  const member = v.match(/^team\/([0-9a-f-]{36})$/);
  if (member && isManager()) { S.memberId = member[1]; v = 'member'; tab = 'team'; }
  else if ((v === 'family' || v === 'famstaff') && isManager()) tab = 'team';
  else if (!tabs.includes(v)) { v = tabs[0]; tab = v; }
  if (S.view !== v) S.month = null;
  S.view = v;
  $$('[data-tab]').forEach(b => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  const mb = $('#bnav-more');
  if (mb) mb.setAttribute('aria-current', mb.dataset.more.split(' ').includes(tab) ? 'page' : 'false');
  stopPolling();
  renderView();
}
window.addEventListener('hashchange', route);

async function renderView() {
  const el = $('#view');
  if (!el) return;
  const seq = ++S.renderSeq;
  const key = S.view === 'member' ? `member/${S.memberId}` : S.view;
  if (!el.dataset.view || el.dataset.key !== key) {
    el.innerHTML = '<div class="empty">Laden…</div>';
    el.dataset.view = S.view;
    el.dataset.key = key;
  }
  try {
    await VIEWS[S.view](el, () => seq === S.renderSeq);
    if (seq === S.renderSeq) showLevelUp();
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
  const lock = $('[data-unlock-at]');
  if (lock && t >= new Date(lock.dataset.unlockAt) && !$('#modal').open) { lock.removeAttribute('data-unlock-at'); renderView(); }
}, 1000);

/* --------------------------------------------------------- punch card */

// Staff can check in during one of their shifts, or a few minutes before
// it starts (Team → Instellingen). The database checks this too.
function clockInState() {
  if (isManager() || !S.settings.require_shift) return { ok: true };
  const t = now(), early = (S.settings.clock_in_early_minutes || 0) * 60000;
  if (S.nextShifts.some(s => new Date(s.starts_at) - early <= t && new Date(s.ends_at) > t)) return { ok: true };
  const next = S.nextShifts.find(s => new Date(s.starts_at) > t);
  return { ok: false, next, from: next ? new Date(new Date(next.starts_at) - early) : null };
}

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
    const can = clockInState();
    const soon = can.from && can.from - t < 18 * 3600000;
    body = `
      <div class="punch-status"><span class="dot"></span>Je bent niet ingeklokt</div>
      ${next ? `<div class="punch-meta">${new Date(next.starts_at) <= t ? 'Je shift is nu bezig' : 'Volgende shift'}: ${fmt.when(next.starts_at)} – ${fmt.time(next.ends_at)}${next.label ? ' · ' + esc(next.label) : ''}</div>`
        : '<div class="punch-meta muted">Geen shiften gepland. Neem er een op bij Shiften.</div>'}
      ${can.ok ? '<button class="big go" data-act="clock-in">Inklokken</button>' : `
        <button class="big go" disabled aria-describedby="in-why">Inklokken</button>
        <p class="hint info" id="in-why" ${soon ? `data-unlock-at="${can.from.toISOString()}"` : ''}>${soon
          ? `Je kan inklokken vanaf <strong>${sameDay(can.from, t) ? fmt.time(can.from) : fmt.when(can.from)}</strong>, ${S.settings.clock_in_early_minutes ? `${S.settings.clock_in_early_minutes} minuten voor je shift begint` : 'als je shift begint'}.`
          : 'Je kan alleen inklokken tijdens een shift waarvoor je ingepland bent. Neem er een op bij Shiften.'}
          Gewerkt zonder in te klokken? <button class="link" data-act="forgot-in">Vergeten uren toevoegen</button></p>`}`;
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
  const missed = $('[data-act=forgot-in]', root);
  if (missed) missed.addEventListener('click', () => timeFixModal(null));
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
  const xp = S.me.xp;
  el.innerHTML = `
    <div class="view-head"><div class="hello">
      <button class="hello-pic" data-go="profile" aria-label="Mijn profiel">${personPic(S.me, 'xl')}</button>
      <div><h1>${hello}, ${esc(S.me.name.split(' ')[0])}</h1>
        <p class="lvl-line">${levelPill(xp)} <span>${esc(levelTitle(xp.level))}</span> <span class="muted">· ${xp.xp} XP</span></p></div>
    </div></div>
    <div class="grid-2">
      ${punchCard()}
      <div style="display:flex;flex-direction:column;gap:18px;min-width:0">
        ${S.me.avatar ? '' : `<section class="card avatar-cta">
          <div class="cta-pic" aria-hidden="true">${Avatar.render(Avatar.DEFAULT, { view: 'bust' })}</div>
          <div><h2>Maak je avatar</h2><p class="muted small">Kies je kapsel, je kleren en je schoenen. Met elk level krijg je nieuwe dingen om te dragen.</p>
          <button class="primary sm" id="make-avatar">Maak je avatar</button></div></section>`}
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
  const mk = $('#make-avatar', el);
  if (mk) mk.addEventListener('click', () => openAvatarEditor());
}

/* ------------------------------------------------------- shifts & schedule */

const DAY_NAMES = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const DAY_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

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
// One day's shifts for display: open places at the same time are counted
// together. With group, people working the same shift are listed together
// too (x.people), so a day with five fixed workers stays readable. Your own
// shift always stays on its own.
const personOf = s => ({ id: s.staff_id, name: s.staff_name, avatar: s.staff_avatar });
function dayEntries(list, { group = false } = {}) {
  const out = [];
  for (const s of list) {
    const same = o => o.starts_at === s.starts_at && o.ends_at === s.ends_at && o.label === s.label;
    if (!s.staff_id) {
      const g = out.find(o => o.open && same(o));
      if (g) { g.count++; continue; }
      out.push({ ...s, open: true, count: 1 });
    } else if (group && !s.mine) {
      const g = out.find(o => o.people && same(o));
      if (g) { g.people.push(personOf(s)); continue; }
      out.push({ ...s, open: false, count: 1, people: [personOf(s)] });
    } else {
      out.push({ ...s, open: false, count: 1 });
    }
  }
  return out;
}
const isGroup = x => x.people && x.people.length > 1;
const miniPic = p => p.avatar ? `<span class="cal-pic">${Avatar.head(p.avatar)}</span>` : `<span class="cal-pic cal-initials">${esc(initials(p.name))}</span>`;
// several people on one shift: their pictures in a row and their names
const groupWho = people => `<span class="cal-group"><span class="cal-pics">${people.slice(0, 3).map(miniPic).join('')}${people.length > 3 ? `<span class="cal-more">+${people.length - 3}</span>` : ''}</span><b class="cal-names">${people.map(p => esc(p.name)).join(', ')}</b></span>`;

// The part of the day: the shift's own name, or Middag / Avond from its start time.
const shiftPart = s => s.label || (new Date(s.starts_at).getHours() < 16 ? 'Middag' : 'Avond');
const partClass = part => /middag/i.test(part) ? ' is-day' : /avond/i.test(part) ? ' is-eve' : '';

function calEntry(x, manager, t, day) {
  const past = new Date(x.ends_at) <= t;
  const time = `${fmt.time(x.starts_at)} – ${fmt.time(x.ends_at)}`;
  const part = shiftPart(x);
  if (isGroup(x)) {
    const inner = `<span class="cal-line"><span class="cal-tag${partClass(part)}"><span class="tag-full">${esc(part)}</span><span class="tag-short" aria-hidden="true">${esc(part.charAt(0))}</span></span><span class="t">${time}</span></span>
      ${groupWho(x.people)}`;
    const title = esc(`${part}, ${time}: ${x.people.map(p => p.name).join(', ')}`);
    return manager
      ? `<button type="button" class="cal-shift is-group${past ? ' is-past' : ''}" data-group-day="${toDateInput(day)}" title="${title}">${inner}</button>`
      : `<span class="cal-shift is-group${past ? ' is-past' : ''}" title="${title}">${inner}</span>`;
  }
  const who = x.open ? `Open${x.count > 1 ? ` ×${x.count}` : ''}` : esc(x.staff_name) + (x.mine && !manager ? ' (jij)' : '');
  const pic = x.open ? '' : x.staff_avatar ? `<span class="cal-pic">${Avatar.head(x.staff_avatar)}</span>` : `<span class="cal-pic cal-initials">${esc(initials(x.staff_name))}</span>`;
  const cls = `cal-shift${x.open ? ' is-open' : ''}${x.mine && !manager ? ' is-mine' : ''}${past ? ' is-past' : ''}`;
  const clickable = manager || (!past && (x.open || x.mine));
  const title = esc(`${part}, ${time}${x.open ? (manager ? ' (open)' : ' – tik om op te nemen') : ''}`);
  // phones show only the first letter of the part of the day, and the number of open places
  const inner = `<span class="cal-line"><span class="cal-tag${partClass(part)}"><span class="tag-full">${esc(part)}</span><span class="tag-short" aria-hidden="true">${esc(part.charAt(0))}</span></span><span class="t">${time}</span>${x.open && x.count > 1 ? `<span class="cal-count" aria-hidden="true">×${x.count}</span>` : ''}</span>
    <span class="cal-who">${pic}<b>${who}</b></span>`;
  return clickable
    ? `<button type="button" class="${cls}" data-shift="${x.id}" title="${title}">${inner}</button>`
    : `<span class="${cls}" title="${title}">${inner}</span>`;
}

function calendarHTML(shifts, month, { manager = false } = {}) {
  const t = now(), first = startOfMonth(month);
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const byDay = Array.from({ length: days }, (_, i) => dayEntries(shifts.filter(s => sameDay(s.starts_at, addDays(first, i))), { group: true }));
  const addBtn = d => manager ? `<button type="button" class="cal-add" data-add-day="${toDateInput(d)}" aria-label="Shift toevoegen op ${fmt.dayLong(d)}">+</button>` : '';
  const cells = [];
  for (let i = 0; i < weekdayIndex(first); i++) cells.push('<div class="cal-cell is-blank"></div>');
  byDay.forEach((list, i) => {
    const d = addDays(first, i);
    cells.push(`<div class="cal-cell${sameDay(d, t) ? ' is-today' : ''}${d < startOfDay(t) ? ' is-before' : ''}${list.length ? ' has-shifts' : ''}" data-day="${toDateInput(d)}">
      <div class="cal-day"><span class="cal-num">${i + 1}</span>${addBtn(d)}</div>
      ${list.map(x => calEntry(x, manager, t, d)).join('')}
    </div>`);
  });
  while (cells.length % 7) cells.push('<div class="cal-cell is-blank"></div>');
  return `
    <div class="cal-wrap">
      <h2 class="cal-title">${esc(fmt.month(first))}</h2>
      <div class="cal-grid">
        ${WEEK_ORDER.map(i => DAY_NAMES[i]).map(n => `<div class="cal-head"><span class="only-wide">${n}</span><span class="only-phone" aria-hidden="true">${n.slice(0, 2)}</span></div>`).join('')}
        ${cells.join('')}
      </div>
      <div class="cal-legend only-phone">
        <span><span class="cal-tag is-day">M</span> Middag</span><span><span class="cal-tag is-eve">A</span> Avond</span>
        <span><span class="lg-box is-open"></span> Open</span>${manager ? '' : '<span><span class="lg-box is-mine"></span> Jouw shift</span>'}
        <span class="muted">Tik op een dag.</span>
      </div>
    </div>`;
}

const isPhone = () => window.matchMedia('(max-width: 759px)').matches;

// On a phone the month is too small to tap single shifts: a tap on a day
// opens that day with big buttons.
function daySheet(dateStr, shifts, manager) {
  const day = new Date(dateStr + 'T00:00'), t = now();
  const list = dayEntries(shifts.filter(s => sameDay(s.starts_at, day)));
  if (!list.length && !manager) return;
  const row = x => {
    const part = shiftPart(x), past = new Date(x.ends_at) <= t;
    const who = x.open
      ? `<span class="day-open">Open${x.count > 1 ? ` · ${x.count} plaatsen` : ''}</span>`
      : `${personPic({ name: x.staff_name, avatar: x.staff_avatar })}<span>${esc(x.staff_name)}${x.mine && !manager ? ' (jij)' : ''}</span>`;
    const action = manager ? `<button type="button" class="sm" data-day-edit="${x.id}">Wijzigen</button>`
      : past ? '' : x.open ? `<button type="button" class="primary" data-day-claim="${x.id}">Opnemen</button>`
      : x.mine ? `<button type="button" data-day-own="${x.id}">Teruggeven</button>` : '';
    return `<div class="day-shift${x.open ? ' is-open' : ''}${x.mine && !manager ? ' is-mine' : ''}${past ? ' is-past' : ''}">
      <div class="day-main">
        <div class="day-when"><span class="cal-tag${partClass(part)}">${esc(part)}</span><span class="time">${fmt.range(x.starts_at, x.ends_at)}</span></div>
        <div class="day-who">${who}</div>
        ${x.notes ? `<p class="muted small">${esc(x.notes)}</p>` : ''}
      </div>
      ${action}
    </div>`;
  };
  const d = modal.open(`
    <h2 id="modal-title">${esc(fmt.dayLong(day))}${sameDay(day, t) ? ' · vandaag' : ''}</h2>
    ${list.length ? `<div class="day-list">${list.map(row).join('')}</div>` : '<p class="empty">Nog geen shiften op deze dag.</p>'}
    <div class="form-actions">${manager ? '<button type="button" class="primary" id="day-add">+ Shift toevoegen</button>' : ''}<button type="button" data-close>Sluiten</button></div>`, null, { sheet: true });
  const find = id => shifts.find(s => s.id === id);
  $$('[data-day-claim]', d).forEach(b => b.addEventListener('click', () => claimShift(find(b.dataset.dayClaim))));
  $$('[data-day-own]', d).forEach(b => b.addEventListener('click', () => ownShift(find(b.dataset.dayOwn))));
  $$('[data-day-edit]', d).forEach(b => b.addEventListener('click', () => editShift(find(b.dataset.dayEdit))));
  const add = $('#day-add', d);
  if (add) add.addEventListener('click', () => addShiftModal(dateStr));
}

function bindCalendar(el, shifts, manager) {
  $('.cal-wrap', el).addEventListener('click', ev => {
    if (isPhone()) {
      const cell = ev.target.closest('.cal-cell[data-day]');
      if (cell) daySheet(cell.dataset.day, shifts, manager);
      return;
    }
    const add = ev.target.closest('[data-add-day]');
    if (add) { addShiftModal(add.dataset.addDay); return; }
    const grp = ev.target.closest('[data-group-day]');
    if (grp) { daySheet(grp.dataset.groupDay, shifts, manager); return; }
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

const DROP_REASONS = ['Ziek', 'School of examen', 'Familie', 'Andere afspraak'];

function ownShift(s) {
  const cut = S.settings.drop_cutoff_hours;
  const canDrop = new Date(s.starts_at) - now() > cut * 3600000;
  modal.open(`
    <h2 id="modal-title">Jouw shift</h2>
    <p>${shiftWhen(s)}</p>
    ${canDrop ? `<p class="muted small">Kan je niet? Geef hem terug, dan staat hij weer open voor iemand anders. Je verantwoordelijke ziet waarom.</p>
      <form id="drop-form" novalidate>
        <div class="field"><label for="drop-reason">Waarom geef je hem terug?</label>
          <div class="chips reason-chips" role="group" aria-label="Snel kiezen">${DROP_REASONS.map(r => `<button type="button" class="chip" data-reason="${esc(r)}">${esc(r)}</button>`).join('')}</div>
          <textarea id="drop-reason" rows="2" maxlength="300" placeholder="bv. Ik heb een examen die dag."></textarea></div>
        <p class="form-error" id="drop-err"></p>
        <div class="form-actions">
          <button type="button" data-close>Sluiten</button>
          <button type="submit" class="danger solid" id="drop-it">Shift teruggeven</button>
        </div>
      </form>`
      : `<p class="hint info">Hij begint binnen ${cut} uur, dus je kan hem hier niet meer teruggeven. Vraag het aan je verantwoordelijke.</p>
      <div class="form-actions"><button type="button" data-close>Sluiten</button></div>`}`, d => {
    const f = $('#drop-form', d);
    if (!f) return;
    const box = $('#drop-reason', d), err = $('#drop-err', d), b = $('#drop-it', d);
    $$('[data-reason]', d).forEach(c => c.addEventListener('click', () => {
      $$('[data-reason]', d).forEach(x => { x.classList.toggle('is-on', x === c); x.setAttribute('aria-pressed', x === c); });
      box.value = c.dataset.reason; err.textContent = ''; box.focus();
    }));
    box.addEventListener('input', () => { err.textContent = ''; });
    f.addEventListener('submit', ev => {
      ev.preventDefault();
      const reason = box.value.trim();
      if (reason.length < 3) { err.textContent = 'Zeg kort waarom je deze shift teruggeeft.'; box.focus(); return; }
      busy(b, async () => {
        await rpc('give_back_shift', { p_shift_id: s.id, p_reason: reason });
        modal.close();
        await refreshMe();
        toast('Shift teruggegeven. Hij staat weer open voor anderen.');
        renderView();
      }).catch(() => {});
    });
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
      <div><h1>Shiften</h1><p><span class="only-wide">Tik op een <span class="key-open">open</span> shift om hem op te nemen. Tik op een van jouw shiften om hem terug te geven.</span><span class="only-phone">Tik op een dag om de shiften te zien. Bij een <span class="key-open">open</span> shift tik je op Opnemen.</span></p></div>
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
const workers = () => (S.staff || []).filter(p => p.role !== 'viewer');
const activeStaff = () => workers().filter(p => p.active);
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
  const openTps = templates.filter(tp => !tp.staff_id), fixedTps = templates.filter(tp => tp.staff_id);
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
      <p class="muted small" style="margin-top:6px">Deze komen elke week terug en verschijnen vanzelf in de kalender, tot 3 maanden op voorhand.</p>
      <h3 class="tp-head">Open, voor wie wil</h3>
      ${openTps.length ? `<div class="rows">${openTps.map(templateRow).join('')}</div>` : '<p class="empty">Geen open vaste shiften.</p>'}
      <h3 class="tp-head">Vaste werknemers</h3>
      <p class="muted small">Ze staan niet in de kalender: die is voor studenten en deeltijdsen. Tijdens hun vaste uren kunnen ze inklokken.</p>
      ${fixedTps.length ? `<div class="rows">${byPerson(fixedTps).map(([name, list]) => `
        <div class="row tp-person">
          <div class="person">${personPic({ name, avatar: list[0].staff_avatar })}
            <div class="row-main"><span class="row-title">${esc(name)}</span>
              ${list.map(tp => `<span class="row-sub tp-line"><span>${esc(tp.label || 'Shift')} · ${daysText(tp.weekdays)} · <span class="time">${tp.start_time} – ${tp.end_time}</span></span><button class="link" data-template="${tp.id}">Wijzigen</button></span>`).join('')}</div></div>
        </div>`).join('')}</div>` : '<p class="empty">Nog geen vaste uren. Kies bij "+ Vaste shift toevoegen" een werknemer, of doe het bij Team → (persoon).</p>'}
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

const templateRow = tp => `
  <div class="row">
    <div class="row-main"><span class="row-title">${esc(tp.label || 'Shift')}</span>
      <span class="row-sub">${daysText(tp.weekdays)} · <span class="time">${tp.start_time} – ${tp.end_time}</span> · ${plural(tp.people, 'persoon', 'personen')}</span></div>
    <div class="row-actions"><button class="sm" data-template="${tp.id}">Wijzigen</button></div>
  </div>`;
function byPerson(tps) {
  const map = new Map();
  for (const tp of tps) { if (!map.has(tp.staff_name)) map.set(tp.staff_name, []); map.get(tp.staff_name).push(tp); }
  return [...map.entries()];
}

// A weekly pattern: open for anyone, or a fixed worker's own hours.
function templateModal(tp, { staffId = null } = {}) {
  const days = tp ? tp.weekdays : staffId ? [1, 3, 4, 5, 6, 0] : [];
  const who = tp ? tp.staff_id || '' : staffId || '';
  modal.open(`
    <h2 id="modal-title">${tp ? `“${esc(tp.label || 'Shift')}” wijzigen` : who ? 'Vaste uren toevoegen' : 'Vaste shift toevoegen'}</h2>
    <p>Komt elke week terug.${tp ? ' Wijzigingen gelden voor de komende shiften die nog open zijn of nog op de naam van de vaste werknemer staan.' : ''}</p>
    <form id="tp-form" novalidate>
      <div class="form-grid">
        <div class="field wide"><label for="tp-staff">Voor wie</label><select id="tp-staff">
          <option value="">Open – het personeel kan hem opnemen</option>
          ${activeStaff().map(p => `<option value="${p.id}" ${p.id === who ? 'selected' : ''}>${esc(p.name)} (vaste uren)</option>`).join('')}</select></div>
        <div class="field wide"><label for="tp-label">Naam</label><input id="tp-label" maxlength="60" value="${esc(tp ? tp.label : '')}" placeholder="bv. Avond"></div>
        <div class="field wide"><label>Dagen</label><div class="days">${WEEK_ORDER.map(i => `
          <label><input type="checkbox" name="tpday" value="${i}" ${days.includes(i) ? 'checked' : ''}><span>${DAY_SHORT[i]}</span></label>`).join('')}</div></div>
        <div class="field"><label for="tp-start">Begint</label>${timeField('tp-start', tp ? tp.start_time : '17:30')}</div>
        <div class="field"><label for="tp-end">Eindigt</label>${timeField('tp-end', tp ? tp.end_time : '22:30')}</div>
        <div class="field" ${who ? 'hidden' : ''}><label for="tp-people">Aantal personen</label><input id="tp-people" type="number" min="1" max="20" value="${tp ? tp.people : 1}"></div>
      </div>
      <p class="form-error" id="tp-err"></p>
      <div class="form-actions" style="justify-content:${tp ? 'space-between' : 'flex-end'}">
        ${tp ? '<button type="button" class="danger" id="tp-remove">Deze shift stopzetten</button>' : ''}
        <span class="toolbar"><button type="button" data-close>Annuleren</button><button type="submit" class="primary">Opslaan</button></span>
      </div>
    </form>`, d => {
    const staffSel = $('#tp-staff', d);
    staffSel.addEventListener('change', () => { $('#tp-people', d).closest('.field').hidden = !!staffSel.value; });
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
        await rpc('mgr_save_shift_template', {
          p_id: tp ? tp.id : null, p_label: $('#tp-label', d).value, p_weekdays: picked,
          p_start: start, p_end: end, p_people: Number($('#tp-people', d).value) || 1, p_staff_id: staffSel.value || null,
        });
        modal.close();
        toast(staffSel.value ? 'Vaste uren opgeslagen.' : 'Vaste shift opgeslagen.');
        renderView();
      } catch (e) { err.textContent = e.message; btn.disabled = false; }
    });
    const rm = $('#tp-remove', d);
    if (rm) rm.addEventListener('click', async () => {
      const ok = await modal.confirm({
        title: `“${tp.label || 'Shift'}” stopzetten?`, danger: true, ok: 'Stopzetten',
        body: tp.staff_id ? `De komende shiften ervan verdwijnen uit de kalender, ook die op naam van ${esc(tp.staff_name)}.` : 'De komende open shiften ervan verdwijnen uit de kalender. Shiften die al opgenomen zijn, blijven.',
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
    ${s.released ? `<p class="hint info">${esc(s.released.name)} gaf deze shift terug op ${esc(fmt.when(s.released.at))}: “${esc(s.released.reason)}”</p>` : ''}
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

const downloadPayslip = (id, btn) => downloadFile('get_payslip', id, btn);
const downloadContract = (id, btn) => downloadFile('get_contract', id, btn);

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
    ${(() => { const sl = slips.find(x => x.month === toDateInput(m)); return sl && sl.net_pay != null
      ? `<p class="hint info">Volgens je loonfiche van ${fmt.monthName(m)} kreeg je <strong>${fmt.money(sl.net_pay)}</strong> netto uitbetaald${sl.gross_pay != null ? ` (${fmt.money(sl.gross_pay)} bruto)` : ''}.</p>` : ''; })()}
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
            <span class="row-sub">${p.net_pay != null ? `<strong>Netto ${fmt.money(p.net_pay)}</strong>${p.gross_pay != null ? ` · bruto ${fmt.money(p.gross_pay)}` : ''} · ` : ''}${esc(p.file_name)} · ${fmtSize(p.size_bytes)}</span></div>
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

/* -------------------------------------------------- profile and avatar */

const LOCK_ICON = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const AV_TABS = [
  ['face', 'Gezicht', ['body', 'skin', 'eyes', 'eyeColor', 'brows', 'mouth', 'beard', 'extra']],
  ['hair', 'Haar', ['hair', 'hairColor']],
  ['clothes', 'Kleren', ['top', 'topColor', 'outer', 'outerColor', 'bottom', 'bottomColor']],
  ['shoes', 'Schoenen', ['shoes', 'shoeColor']],
  ['extras', "Extra's", ['hat', 'hatColor', 'glasses', 'neck', 'neckColor', 'earrings', 'piercing', 'aura']],
];
const AV_GROUP = {
  skin: 'Huidskleur', eyes: 'Ogen', eyeColor: 'Kleur van je ogen', brows: 'Wenkbrauwen', mouth: 'Mond', beard: 'Baard en snor',
  extra: 'Sproeten en blos', hair: 'Kapsel', hairColor: 'Haarkleur', top: 'Bovenstuk', topColor: 'Kleur', outer: 'Jas',
  outerColor: 'Kleur van je jas', bottom: 'Broek of rok', bottomColor: 'Kleur', shoes: 'Schoenen', shoeColor: 'Kleur',
  hat: 'Op je hoofd', hatColor: 'Kleur', glasses: 'Bril', earrings: 'Oorbellen', piercing: 'Piercing',
  body: 'Figuur', neck: 'Rond je hals', neckColor: 'Kleur', aura: 'Rond je avatar',
};
// The part of the drawing each tile shows.
const AV_CROP = {
  eyes: '56 62 88 88', brows: '56 56 88 88', mouth: '70 98 60 60', beard: '44 56 112 112', hair: '26 2 148 148', hat: '26 0 148 148',
  glasses: '54 56 92 92', earrings: '36 52 128 128', piercing: '74 92 52 52', top: '18 136 164 164', outer: '18 136 164 164',
  bottom: '14 240 172 172', shoes: '44 346 112 66', hairColor: '26 2 148 148',
  body: '14 20 172 172', neck: '46 120 108 108', aura: '0 0 200 412',
};
const COLOR_NAMES = {
  white: 'wit', black: 'zwart', navy: 'marineblauw', maroon: 'bordeaux', red: 'rood', pink: 'roze', lilac: 'lila', sky: 'lichtblauw',
  green: 'groen', olive: 'olijfgroen', mustard: 'mosterdgeel', beige: 'beige', gray: 'grijs', cream: 'crème', grey: 'grijs',
  blue: 'blauw', light: 'licht', indigo: 'donkerblauw', chestnut: 'kastanjebruin', dark: 'donkerbruin', brown: 'bruin',
  blonde: 'blond', platinum: 'platinablond', auburn: 'roodbruin', ginger: 'rossig', hazel: 'hazelnoot',
  ruby: 'robijnrood',
};
// Long Dutch compounds in the small tiles break at the seam: Paarden-staart.
const SOFT_HYPHENS = ['Paarden|staart', 'Konijnen|sloffen', 'Monster|sloffen', 'Draken|sloffen', 'Midden|scheiding', 'Zij|scheiding',
  'Mannen|knot', 'Vissers|hoedje', 'Hartjes|bril', 'Kop|telefoon', 'Body|warmer', 'Zonne|bril', 'Jogging|broek', 'Fantasie|kleuren', 'Gouden| sneakers'];
const hyph = label => SOFT_HYPHENS.reduce((t, w) => t.replace(w.replace('|', ''), w.replace('|', '\u00AD')), esc(label));
const colorName = (k, v) => k === 'skin' ? `huidskleur ${v.slice(1)}` : COLOR_NAMES[v] || v;
const avShown = (k, c) => !((k === 'topColor' && ['chef', 'garden'].includes(c.top)) || (k === 'outerColor' && c.outer === 'none') ||
  (k === 'neckColor' && !['scarf', 'bowtie'].includes(c.neck)) ||
  (k === 'shoeColor' && !['sneakers', 'boots'].includes(c.shoes)) || (k === 'hatColor' && !['beanie', 'cap', 'bandana'].includes(c.hat)));

function openAvatarEditor() {
  const level = (S.me.xp || {}).level || 1;
  const saved = S.me.avatar ? Avatar.normalize(S.me.avatar) : null;
  let c = saved ? { ...saved } : { ...Avatar.DEFAULT }, tab = 'face';
  const need = (k, v) => Avatar.levelOf(k, v);
  const locked = (k, v) => need(k, v) > level && !(saved && saved[k] === v);
  const lockNote = (k, v) => locked(k, v) ? `<span class="av-lock">${LOCK_ICON}Level ${need(k, v)}</span>` : '';

  function group(k) {
    if (!avShown(k, c)) return '';
    let body;
    if (k === 'extra') {
      body = `<div class="av-tiles">${[['freckles', 'Sproeten'], ['blush', 'Blos']].map(([t, l]) => `
        <button type="button" class="av-tile" data-toggle="${t}" aria-pressed="${!!c[t]}">
          <span class="av-tile-pic">${Avatar.render({ ...c, [t]: true }, { view: '56 70 88 88' })}</span><span class="av-tile-label">${l}</span></button>`).join('')}</div>`;
    } else if (Avatar.COLORS[k]) {
      body = `<div class="swatches">${Object.entries(Avatar.COLORS[k]).map(([v, hexColor]) => `
        <button type="button" class="swatch${locked(k, v) ? ' is-locked' : ''}" data-k="${k}" data-v="${v}" style="--c:${hexColor}" aria-pressed="${c[k] === v}"
          aria-label="${esc(colorName(k, v))}${locked(k, v) ? `, vanaf level ${need(k, v)}` : ''}" title="${esc(colorName(k, v))}${locked(k, v) ? ` · vanaf level ${need(k, v)}` : ''}" ${locked(k, v) ? 'disabled' : ''}>${locked(k, v) ? LOCK_ICON : ''}</button>`).join('')}</div>`;
    } else {
      body = `<div class="av-tiles">${Avatar.STYLES[k].map(([v, label]) => {
        const look = { ...c, [k]: v };
        if (k === 'hair') look.hat = 'none';
        if (k === 'top') look.outer = 'none';
        return `<button type="button" class="av-tile${locked(k, v) ? ' is-locked' : ''}" data-k="${k}" data-v="${v}" aria-pressed="${c[k] === v}" ${locked(k, v) ? 'disabled' : ''}
          title="${esc(label)}${locked(k, v) ? ` · vanaf level ${need(k, v)}` : ''}">
          <span class="av-tile-pic">${Avatar.render(look, { view: AV_CROP[k] || 'tile' })}</span><span class="av-tile-label">${hyph(label)}</span>${lockNote(k, v)}</button>`;
      }).join('')}</div>`;
    }
    return `<div class="av-group"><h3>${AV_GROUP[k]}</h3>${body}</div>`;
  }

  const d = modal.open(`
    <h2 id="modal-title">${saved ? 'Je avatar aanpassen' : 'Maak je avatar'}</h2>
    <p>Je bent level ${level}. Dingen met een slotje krijg je op een hoger level.</p>
    <div class="av-editor">
      <div class="av-preview" id="av-preview"></div>
      <div class="av-side">
        <div class="chips av-tabs" role="tablist" aria-label="Onderdelen">${AV_TABS.map(([k, l]) => `<button type="button" class="chip" role="tab" data-av-tab="${k}">${l}</button>`).join('')}</div>
        <div class="av-groups" id="av-groups"></div>
      </div>
    </div>
    <p class="form-error" id="av-err"></p>
    <div class="form-actions av-actions">
      <button type="button" id="av-random">Willekeurig</button>
      <span class="toolbar"><button type="button" data-close>Annuleren</button><button type="button" class="primary" id="av-save">Opslaan</button></span>
    </div>`, d => {
    const groups = $('#av-groups', d);
    const draw = () => {
      $('#av-preview', d).innerHTML = Avatar.render(c, { title: 'Je avatar' });
      const keep = groups.scrollTop;
      groups.innerHTML = AV_TABS.find(t => t[0] === tab)[2].map(group).join('');
      groups.scrollTop = keep;
      $$('[data-av-tab]', d).forEach(b => { b.classList.toggle('is-on', b.dataset.avTab === tab); b.setAttribute('aria-selected', b.dataset.avTab === tab); });
    };
    $$('[data-av-tab]', d).forEach(b => b.addEventListener('click', () => { tab = b.dataset.avTab; groups.scrollTop = 0; draw(); }));
    groups.addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b || b.disabled) return;
      if (b.dataset.toggle) c[b.dataset.toggle] = !c[b.dataset.toggle];
      else if (b.dataset.k) c[b.dataset.k] = b.dataset.v;
      draw();
    });
    $('#av-random', d).addEventListener('click', () => { c = Avatar.normalize(Avatar.random(level)); draw(); });
    const save = $('#av-save', d);
    save.addEventListener('click', () => busy(save, async () => {
      await rpc('save_my_avatar', { p_avatar: c });
      await refreshMe();
      modal.close();
      toast('Je avatar is opgeslagen.');
      renderShell();
    }).catch(e => { $('#av-err', d).textContent = e.message; }));
    draw();
  }, { wide: true });
  return d;
}

// One tile per reward, showing the person wearing it.
function rewardTiles(avatar, level) {
  const base = Avatar.normalize(avatar || Avatar.DEFAULT), seen = new Set(), out = [];
  for (const [k, items] of Object.entries(Avatar.UNLOCKS)) {
    for (const [v, l] of Object.entries(items)) {
      if (k === 'hairColor') { if (seen.has(k)) continue; seen.add(k); }
      const label = k === 'hairColor' ? 'Fantasiekleuren voor je haar' : Avatar.STYLES[k].find(x => x[0] === v)[1];
      out.push({ k, v, l, label });
    }
  }
  return out.sort((a, b) => a.l - b.l).map(r => {
    const look = { ...base, [r.k]: r.v };
    if (r.k === 'hairColor') look.hat = 'none';
    if (r.k === 'top') look.outer = 'none';
    const on = level >= r.l;
    return `<div class="reward ${on ? 'is-on' : 'is-locked'}">
      <span class="reward-pic">${Avatar.render(look, { view: AV_CROP[r.k] })}</span>
      <span class="reward-lvl">${on ? '✓ ' : LOCK_ICON}Level ${r.l}</span><span class="reward-name">${hyph(r.label)}</span></div>`;
  }).join('');
}

const fmtDate = iso => new Date(iso + 'T00:00').toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
const contractPeriod = c => c.starts_on ? (c.ends_on ? `${isoToDMY(c.starts_on)} – ${isoToDMY(c.ends_on)}` : `vanaf ${isoToDMY(c.starts_on)}`) : 'zonder datum';
function contractRows(list, manager) {
  if (!list.length) return `<p class="empty">${manager ? 'Nog geen contracten.' : 'Je verantwoordelijke heeft nog geen contract toegevoegd.'}</p>`;
  const today = toDateInput(now());
  return `<div class="rows">${list.map(c => {
    const state = c.ends_on && c.ends_on < today ? '<span class="pill">Afgelopen</span>' : (!c.starts_on || c.starts_on <= today) ? '<span class="pill on">Loopt</span>' : '<span class="pill accent">Begint later</span>';
    return `<div class="row">
      <div class="row-main"><span class="row-title">${esc(c.title)} ${state}</span><span class="row-sub">${contractPeriod(c)} · ${esc(c.file_name)} · ${fmtSize(c.size_bytes)}</span></div>
      <div class="row-actions"><button class="sm${manager ? '' : ' primary'}" data-contract="${c.id}">Downloaden</button>${manager ? `<button class="sm danger" data-contract-rm="${c.id}" data-title="${esc(c.title)}">Verwijderen</button>` : ''}</div>
    </div>`;
  }).join('')}</div>`;
}

async function viewProfile(el, current) {
  const r = await rpc('my_profile');
  if (!current()) return;
  const xp = r.xp, lvl = xp.level, w = r.work;
  S.me.avatar = r.avatar; S.me.xp = xp;
  const next = Avatar.rewardsAt(lvl + 1);
  el.innerHTML = `
    <div class="view-head"><div><h1>Mijn profiel</h1><p>Je avatar, je level, je gegevens en je contracten.</p></div></div>
    <section class="card profile-hero">
      <button type="button" class="hero-pic" id="edit-avatar-pic" aria-label="${r.avatar ? 'Avatar aanpassen' : 'Maak je avatar'}">
        ${r.avatar ? Avatar.render(r.avatar, { title: 'Je avatar' }) : `<span class="hero-empty">${Avatar.render(Avatar.DEFAULT)}</span><span class="hero-make">Maak je avatar</span>`}</button>
      <div class="hero-main">
        <p class="section-label">${esc(S.me.name)}</p>
        <h2 class="hero-level">Level ${lvl} <span>· ${esc(levelTitle(lvl))}</span></h2>
        ${xpBar(xp)}
        ${xp.bonus ? `<p class="muted small">Waarvan ${num(xp.bonus, 0)} bonus-XP van je verantwoordelijke.</p>` : ''}
        ${next.length ? `<p class="small">Op level ${lvl + 1} krijg je: <strong>${next.map(esc).join(', ')}</strong></p>` : ''}
        <div class="stats stats-3">
          <div class="stat"><span class="v">${fmt.hours(xp.minutes)}</span><span class="k">Uren gewerkt</span></div>
          <div class="stat"><span class="v">${xp.entries}</span><span class="k">Keer gewerkt</span></div>
          <div class="stat"><span class="v">${xp.entries ? Math.round(xp.on_time / xp.entries * 100) + '%' : '—'}</span><span class="k">Op tijd begonnen</span></div>
        </div>
        <div class="toolbar"><button class="primary" id="edit-avatar">${r.avatar ? 'Avatar aanpassen' : 'Maak je avatar'}</button></div>
        <details class="xp-how"><summary>Hoe verdien je XP?</summary>
          <ul><li><strong>10 XP</strong> per uur dat je werkt</li><li><strong>+5 XP</strong> als je op tijd begint aan je shift</li><li><strong>+5 XP</strong> als je blijft tot je shift gedaan is</li></ul>
          <p class="muted small">XP komt uit je urenkaart. Een aanpassing telt mee zodra je verantwoordelijke ze goedkeurt.</p></details>
      </div>
    </section>
    <section class="card"><div class="card-head"><h2>Beloningen</h2><span class="muted small">Nieuwe dingen voor je avatar, per level</span></div>
      <div class="rewards">${rewardTiles(r.avatar, lvl)}</div></section>
    <div class="grid-2">
      <section class="card"><h2>Mijn gegevens</h2>
        <p class="muted small" style="margin-top:6px">Alleen jij en je verantwoordelijke zien dit. Ze zijn nodig voor je contract en je loonfiche.</p>
        <form id="pf-form" novalidate><div class="form-grid" style="margin-top:12px">${profileFields('pf', r.profile)}</div>
          <p class="form-error" id="pf-err"></p><div class="form-actions"><button type="submit" class="primary">Gegevens opslaan</button></div></form>
      </section>
      <div class="stack">
        <section class="card"><h2>Werk</h2>
          <dl class="kv">
            <dt>Rol</dt><dd>${w.role === 'manager' ? 'Verantwoordelijke' : 'Medewerker'}</dd>
            <dt>Statuut</dt><dd>${w.contract_type ? CONTRACTS[w.contract_type] : '—'}</dd>
            <dt>Uurloon</dt><dd>${w.hourly_rate != null ? fmt.money(w.hourly_rate) : '—'}</dd>
            <dt>In dienst sinds</dt><dd>${w.start_date ? fmtDate(w.start_date) : '—'}</dd>
            <dt>Werknemersnummer</dt><dd>${w.payroll_id ? esc(w.payroll_id) : '—'}</dd>
          </dl>
          <p class="muted small" style="margin-top:10px">Klopt hier iets niet? Vraag het aan je verantwoordelijke.</p></section>
        <section class="card"><h2>Contracten</h2>${contractRows(r.contracts, false)}</section>
        <section class="card"><h2>Pincode wijzigen</h2>
          <form id="pin-form" novalidate><div class="form-grid" style="margin-top:12px">
            <div class="field"><label for="pin-old">Huidige pincode</label><input id="pin-old" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="current-password"></div>
            <div class="field"><label for="pin-new">Nieuwe pincode</label><input id="pin-new" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password"></div>
            <div class="field"><label for="pin-new2">Herhaal de nieuwe</label><input id="pin-new2" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password"></div>
          </div><p class="form-error" id="pin-err"></p><div class="form-actions"><button type="submit" class="primary">Pincode wijzigen</button></div></form>
        </section>
        <section class="card"><h2>Weergave</h2>
          <p class="muted small" style="margin-top:6px">Alleen op dit toestel.</p>
          <div class="chips" role="group" aria-label="Thema" style="margin-top:12px">${THEMES.map(([k, l]) => `<button type="button" class="chip" data-theme-pick="${k}">${l}</button>`).join('')}</div>
        </section>
        <button type="button" class="signout-wide" id="pf-signout">${ICONS.signout}<span>Afmelden</span></button>
      </div>
    </div>`;
  $('#edit-avatar', el).addEventListener('click', () => openAvatarEditor());
  $('#edit-avatar-pic', el).addEventListener('click', () => openAvatarEditor());
  $('#pf-signout', el).addEventListener('click', askSignOut);
  $$('[data-theme-pick]', el).forEach(b => b.addEventListener('click', () => setTheme(b.dataset.themePick)));
  applyTheme();
  $$('[data-contract]', el).forEach(b => b.addEventListener('click', () => downloadContract(b.dataset.contract, b)));
  const pf = $('#pf-form', el);
  pf.addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('#pf-err', el); err.textContent = '';
    const r2 = readProfile(pf);
    if (r2.error) { err.textContent = r2.error; r2.field.focus(); return; }
    await busy($('button[type=submit]', pf), async () => {
      await rpc('save_my_profile', { p_profile: r2.values });
      toast('Je gegevens zijn opgeslagen.');
      renderView();
    }).catch(e => { err.textContent = e.message; });
  });
  const pin = $('#pin-form', el);
  pin.addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('#pin-err', el); err.textContent = '';
    const old = $('#pin-old', pin).value.trim(), nw = $('#pin-new', pin).value.trim();
    if (!old) { err.textContent = 'Vul je huidige pincode in.'; return; }
    if (!/^\d{4,8}$/.test(nw)) { err.textContent = 'De nieuwe pincode moet 4 tot 8 cijfers hebben.'; return; }
    if (nw !== $('#pin-new2', pin).value.trim()) { err.textContent = 'De twee nieuwe pincodes zijn niet gelijk.'; return; }
    await busy($('button[type=submit]', pin), async () => {
      await rpc('change_my_pin', { p_old: old, p_new: nw });
      pin.reset();
      toast('Je pincode is gewijzigd. Andere toestellen zijn afgemeld.');
    }).catch(e => { err.textContent = e.message; });
  });
}

/* ------------------------------------------------------------- ranking */

async function viewRanking(el, current) {
  const list = await rpc('leaderboard');
  if (!current()) return;
  const mode = S.rankMode || 'all', key = mode === 'month' ? 'month_xp' : 'xp';
  const ranked = [...list].sort((a, b) => b[key] - a[key] || b.xp - a.xp || a.name.localeCompare(b.name, 'nl'));
  let rank = 0, prev = null;
  ranked.forEach((p, i) => { if (p[key] !== prev) { rank = i + 1; prev = p[key]; } p.rank = rank; });
  const me = ranked.find(p => p.me), month = fmt.monthName(now());
  const above = me && ranked[ranked.indexOf(me) - 1];
  const anyXp = ranked.some(p => p[key] > 0);
  const figure = p => p.avatar ? Avatar.render(p.avatar, { title: p.name }) : `<span class="hero-empty">${Avatar.render(Avatar.DEFAULT)}</span>`;
  const spot = (p, place) => p ? `
    <div class="podium-spot place-${place}${p.me ? ' is-me' : ''}">
      <div class="podium-pic">${figure(p)}</div>
      <div class="podium-name">${esc(p.name)}${p.me ? ' <span class="pill accent">jij</span>' : ''}</div>
      <div class="podium-meta">${levelPill(p)} <span class="mono">${p[key]} XP</span></div>
      <div class="podium-step"><span>${p.rank}</span></div>
    </div>` : '<div class="podium-spot is-empty"></div>';
  el.innerHTML = `
    <div class="view-head">
      <div><h1>Ranglijst</h1><p>Wie van het team heeft het hoogste level? XP verdien je met werken: 10 per uur, +5 als je op tijd begint en +5 als je blijft tot het einde.</p></div>
      <div class="chips" role="group" aria-label="Periode">
        <button type="button" class="chip${mode === 'all' ? ' is-on' : ''}" data-rank-mode="all" aria-pressed="${mode === 'all'}">Altijd</button>
        <button type="button" class="chip${mode === 'month' ? ' is-on' : ''}" data-rank-mode="month" aria-pressed="${mode === 'month'}">Deze maand</button>
      </div>
    </div>
    ${me ? `<p class="hint info">Jij staat <strong>${me.rank}e</strong> van ${ranked.length}${mode === 'month' ? ` in ${month}` : ''}, met ${me[key]} XP.${above && above[key] > me[key] ? ` Nog ${above[key] - me[key] + 1} XP om ${esc(above.name)} in te halen.` : ''}</p>` : ''}
    ${anyXp ? `<section class="card podium" aria-label="Top drie">${spot(ranked[1], 2)}${spot(ranked[0], 1)}${spot(ranked[2], 3)}</section>`
      : `<p class="empty">${mode === 'month' ? `Nog niemand heeft XP in ${month}. Wie als eerste werkt, staat bovenaan.` : 'Nog niemand heeft XP. Wie als eerste werkt, staat bovenaan.'}</p>`}
    <section class="card">
      <div class="card-head"><h2>${mode === 'month' ? `XP in ${month}` : 'Iedereen'}</h2><span class="muted small">${plural(ranked.length, 'persoon', 'personen')}</span></div>
      <div class="rows rank-rows">${ranked.map(p => `
        <div class="row rank-row${p.me ? ' mine' : ''}">
          <div class="person"><span class="rank-num">${p.rank}</span>${personPic(p, 'lg')}
            <div class="row-main"><span class="row-title">${esc(p.name)}${p.me ? ' <span class="pill accent">jij</span>' : ''}</span>
              <span class="row-sub">${levelPill(p)} ${esc(levelTitle(p.level))}</span></div></div>
          <span class="rank-xp mono">${p[key]} XP</span>
        </div>`).join('')}</div>
    </section>`;
  $$('[data-rank-mode]', el).forEach(b => b.addEventListener('click', () => { S.rankMode = b.dataset.rankMode; renderView(); }));
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
    loadStaff(),
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
              <div class="person">${picFor(w.staff_id, w.name, 'on')}
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
              <div class="person">${s.staff_id ? picFor(s.staff_id, s.staff_name) : '<span class="avatar open" aria-hidden="true">?</span>'}
              <div class="row-main"><span class="row-title">${s.staff_id ? esc(s.staff_name) : '<span class="muted">Open shift</span>'}</span>
              <span class="row-sub"><span class="time">${fmt.range(s.starts_at, s.ends_at)}</span>${s.label ? ' · ' + esc(s.label) : ''}</span></div></div>
              <span class="pill ${k}">${esc(label)}</span>
            </div>`;
          }).join('')}</div>` : '<p class="empty">Vandaag geen shiften gepland. <button class="link" data-go="schedule">Voeg er toe</button></p>'}
        </section>
        ${ov.released && ov.released.length ? `<section class="card">
          <div class="card-head"><h2>Teruggegeven shiften</h2><span class="muted small">Laatste 14 dagen</span></div>
          <div class="rows">${ov.released.map(r => `<div class="row">
            <div class="person">${picFor(r.staff_id, r.name)}
              <div class="row-main"><span class="row-title">${esc(r.name)}</span>
              <span class="row-sub">${esc(fmt.dayLong(r.starts_at))} · <span class="time">${fmt.range(r.starts_at, r.ends_at)}</span></span>
              <span class="row-sub">“${esc(r.reason)}” · teruggegeven ${esc(fmt.when(r.at))}</span></div></div>
            <span class="pill ${r.taken_by ? 'on' : 'warn'}">${r.taken_by ? `Nu: ${esc(r.taken_by)}` : 'Nog open'}</span>
          </div>`).join('')}</div>
        </section>` : ''}
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
            <td><span class="person">${picFor(p.id, p.name)}<span><strong>${esc(p.name)}</strong>${p.pay_method ? ` ${payPill(p.pay_method)}` : ''}${p.active ? '' : ' <span class="pill">Inactief</span>'}${p.open_entries ? ' <span class="pill warn">Ingeklokt</span>' : ''}${p.pending_requests ? ` <span class="pill accent">${plural(p.pending_requests, 'aanpassing', 'aanpassingen')}</span>` : ''}</span></span></td>
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
      <div class="card-head"><h2>Loonfiches voor ${label}</h2>
        <div class="toolbar"><span class="pill ${slips.length ? 'on' : ''}">${slips.length} van ${people.length} geüpload</span><button class="sm primary" id="slip-bulk">Loonfiches uploaden</button></div></div>
      <p class="muted small" style="margin-top:6px">Kies ze allemaal tegelijk, als pdf of foto tot 4 MB. De app leest voor wie elke loonfiche is, de maand en de bedragen, en vult ontbrekende gegevens aan. Jij kijkt het na voor het bewaard wordt. Iedereen downloadt de eigen loonfiche bij Mijn uren.</p>
      <div class="rows">${people.map(p => {
        const slip = slips.find(x => x.staff_id === p.id);
        return `<div class="row">
          <div class="person">${picFor(p.id, p.name)}
            <div class="row-main"><span class="row-title">${esc(p.name)}</span>
            <span class="row-sub">${slip ? `${slip.net_pay != null ? `Netto ${fmt.money(slip.net_pay)} · ` : ''}${esc(slip.file_name)} · ${fmtSize(slip.size_bytes)} · geüpload op ${fmt.short(slip.created_at)}` : 'Nog geen loonfiche'}</span></div></div>
          <div class="row-actions">${slip
            ? `<button class="sm" data-slip-get="${slip.id}">Downloaden</button><button class="sm" data-slip-up="${p.id}">Vervangen</button><button class="sm danger" data-slip-rm="${slip.id}" data-name="${esc(p.name)}">Verwijderen</button>`
            : `<button class="sm primary" data-slip-up="${p.id}">Loonfiche uploaden</button>`}</div>
        </div>`;
      }).join('')}</div>
      <input type="file" id="slip-file" accept="application/pdf,image/png,image/jpeg" hidden>
      <input type="file" id="slip-files" accept="application/pdf,image/png,image/jpeg" multiple hidden>
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
    if (fileInput.files[0] && uploadFor) payslipImport([fileInput.files[0]], { staffId: uploadFor.dataset.slipUp, month: toDateInput(m) });
  });
  const many = $('#slip-files', el);
  $('#slip-bulk', el).addEventListener('click', () => { many.value = ''; many.click(); });
  many.addEventListener('change', () => { if (many.files.length) payslipImport([...many.files], { month: toDateInput(m) }); });
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
        ${x ? '' : `<div class="field wide"><label for="en-staff">Persoon</label><select id="en-staff">${workers().map(p => `<option value="${p.id}" ${p.id === staffId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>`}
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
  const [r] = await Promise.all([rpc('mgr_requests'), loadStaff()]);
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
            <div class="person">${picFor(q.staff_id, q.name)}<span class="row-title">${esc(q.name)} · ${q.entry_id ? 'aanpassing' : 'vergeten uren'} voor ${fmt.dayLong(q.proposed_in)}</span></div>
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

const ROLE_NL = { staff: 'Medewerker', manager: 'Verantwoordelijke', viewer: 'Familie · alleen overzicht' };
const roleOptions = sel => Object.entries({ staff: 'Medewerker', manager: 'Verantwoordelijke (ziet alles)', viewer: 'Familie (alleen het maandoverzicht)' })
  .map(([k, l]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${l}</option>`).join('');
const payOptions = sel => `<option value="">Niet ingevuld</option>${Object.entries(PAY)
  .map(([k, [l]]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${l}</option>`).join('')}`;

async function viewTeam(el, current) {
  const [staff, off] = await Promise.all([loadStaff(true), rpc('mgr_officient_status')]);
  if (!current()) return;
  const link = location.origin + location.pathname;
  const st = S.settings;
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const cutLabel = h => h === 0 ? 'De shift begint' : h === 168 ? '1 week ervoor' : `${h} uur ervoor`;
  el.innerHTML = `
    <div class="view-head"><div><h1>Team</h1><p>Voeg mensen toe, reset pincodes en stel de app in.</p></div>
      <button class="sm" id="see-family">Familie-overzicht bekijken</button></div>
    <section class="card">
      <h2>Delen met je personeel</h2>
      <p class="muted" style="margin-top:6px">Stuur deze link. Iedereen meldt zich aan met de eigen naam en de pincode die je hieronder instelt.</p>
      <div class="copybox" style="margin-top:12px"><code id="share-link">${esc(link)}</code><button class="sm" id="copy-link">Link kopiëren</button></div>
    </section>
    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h2>Mensen</h2><span class="pill">${staff.filter(p => p.active && p.role !== 'viewer').length} actief</span></div>
        <div class="rows">${staff.map(p => `
          <div class="row team-row">
            <div class="person">${personPic(p, 'lg')}
              <div class="row-main"><span class="row-title">${esc(p.name)}${p.id === S.me.id ? ' (jij)' : ''} ${p.role === 'viewer' ? '' : `${levelPill(p.xp)} ${payPill(p.pay_method)}`}</span>
              <span class="row-sub">${ROLE_NL[p.role]}${p.contract_type ? ` · ${CONTRACT_SHORT[p.contract_type]}` : ''}${p.hourly_rate != null ? ` · ${fmt.money(p.hourly_rate)}/u` : ''}${p.payroll_id ? ` · nr. ${esc(p.payroll_id)}` : ''}</span></div></div>
            <div class="row-actions">
              ${p.locked ? '<span class="pill bad">Geblokkeerd</span>' : ''}${p.active ? '' : '<span class="pill">Inactief</span>'}${p.active && p.role !== 'viewer' && p.missing && p.missing.length ? '<span class="pill warn">Gegevens onvolledig</span>' : ''}
              <button class="sm" data-person="${p.id}">Openen</button>
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
            <div class="field"><label for="ap-pay">Betaling</label><select id="ap-pay">${payOptions(null)}</select></div>
            <div class="field wide"><label for="ap-role">Rol</label><select id="ap-role">${roleOptions('staff')}</select>
              <span class="help" id="ap-role-help" hidden>Een familie-account ziet alleen het maandoverzicht: wie wanneer werkt, de open shiften, de uren, het uurloon en cash of ingeschreven. In het Nederlands of het Chinees. Het kan niet inklokken en geen shiften opnemen.</span></div>
          </div>
          <p class="form-error" id="ap-err"></p>
          <div class="form-actions"><button type="submit" class="primary">Persoon toevoegen</button></div>
        </form>
      </section>
    </div>
    <section class="card">
      <h2 id="settings">Instellingen</h2>
      <form id="settings-form" novalidate>
        <div class="form-grid" style="margin-top:12px">
          <div class="field wide"><label for="st-biz">Naam van de zaak</label><input id="st-biz" maxlength="80" value="${esc(st.business_name)}"></div>
          <div class="field"><label for="st-cut">Personeel kan een shift teruggeven tot</label><select id="st-cut">${[0, 12, 24, 48, 72, 168].map(h => `<option value="${h}" ${h === st.drop_cutoff_hours ? 'selected' : ''}>${cutLabel(h)}</option>`).join('')}${[0, 12, 24, 48, 72, 168].includes(st.drop_cutoff_hours) ? '' : `<option value="${st.drop_cutoff_hours}" selected>${cutLabel(st.drop_cutoff_hours)}</option>`}</select></div>
          <div class="field"><label for="st-grace">Speling</label><select id="st-grace">${[0, 5, 10, 15].map(g => `<option value="${g}" ${g === st.grace_minutes ? 'selected' : ''}>${g} minuten</option>`).join('')}${[0, 5, 10, 15].includes(st.grace_minutes) ? '' : `<option value="${st.grace_minutes}" selected>${st.grace_minutes} minuten</option>`}</select><span class="help">Hoeveel minuten iemand te laat of te vroeg mag zijn voor het telt.</span></div>
          <div class="field"><label for="st-cur">Valutateken</label><input id="st-cur" maxlength="4" value="${esc(st.currency)}"></div>
          <div class="field wide"><label class="check"><input type="checkbox" id="st-req" ${st.require_shift ? 'checked' : ''}> Personeel kan alleen inklokken tijdens een shift waarvoor het ingepland is</label>
            <span class="help">Wie werkte zonder shift, voegt de uren toe bij Mijn uren en jij keurt ze goed. Verantwoordelijken kunnen altijd inklokken.</span></div>
          <div class="field"><label for="st-early">Inklokken kan vanaf</label><select id="st-early">${[0, 5, 10, 15, 30, 60].map(m => `<option value="${m}" ${m === st.clock_in_early_minutes ? 'selected' : ''}>${m ? `${m} minuten voor de shift` : 'het begin van de shift'}</option>`).join('')}${[0, 5, 10, 15, 30, 60].includes(st.clock_in_early_minutes) ? '' : `<option value="${st.clock_in_early_minutes}" selected>${st.clock_in_early_minutes} minuten voor de shift</option>`}</select></div>
          <div class="field wide"><label>Tijdzone</label>
            <div class="copybox"><code>${esc(st.timezone || 'Niet ingesteld')}</code>${deviceTz && deviceTz !== st.timezone ? `<button type="button" class="sm" id="st-tz">${esc(deviceTz)} gebruiken</button>` : ''}</div>
            <span class="help">Vaste shiften worden in deze tijdzone aangemaakt.</span></div>
        </div>
        <p class="form-error" id="st-err"></p>
        <div class="form-actions"><button type="submit" class="primary">Instellingen opslaan</button></div>
      </form>
    </section>
    ${officientCard(off, link)}`;

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
    const role = $('#ap-role', ap).value, family = role === 'viewer';
    await busy($('button[type=submit]', ap), async () => {
      const added = await rpc('mgr_save_staff', { p_id: null, p_name: name, p_pin: pin, p_role: role, p_hourly_rate: rate === '' || family ? null : Number(rate), p_active: true });
      const type = $('#ap-type', ap).value, pid = $('#ap-pid', ap).value.trim(), pay = $('#ap-pay', ap).value;
      if (!family && (type || pid)) await rpc('mgr_save_staff_payroll', { p_id: added.id, p_contract_type: type || null, p_payroll_id: pid });
      if (!family && pay) await rpc('mgr_set_pay_method', { p_id: added.id, p_method: pay });
      toast(`${name} toegevoegd. Geef de pincode door: ${pin}`);
      renderView();
    }).catch(e => { err.textContent = e.message; });
  });
  $$('[data-person]', el).forEach(b => b.addEventListener('click', () => { location.hash = `team/${b.dataset.person}`; }));
  $('#see-family', el).addEventListener('click', () => { location.hash = 'family'; });
  // a family account needs no wage, contract or employee number
  const apRole = $('#ap-role', ap);
  apRole.addEventListener('change', () => {
    const family = apRole.value === 'viewer';
    ['#ap-rate', '#ap-type', '#ap-pid', '#ap-pay'].forEach(sel => { $(sel, ap).closest('.field').hidden = family; });
    $('#ap-role-help', ap).hidden = !family;
  });
  const tzBtn = $('#st-tz', el);
  if (tzBtn) tzBtn.addEventListener('click', () => busy(tzBtn, async () => {
    await rpc('mgr_set_timezone', { p_tz: deviceTz });
    await refreshMe();
    toast('Tijdzone bijgewerkt.');
    renderView();
  }).catch(() => {}));
  bindOfficient(el, off, link);
  const sf = $('#settings-form', el);
  sf.addEventListener('submit', async ev => {
    ev.preventDefault();
    await busy($('button[type=submit]', sf), async () => {
      await rpc('mgr_save_settings', {
        p_business_name: $('#st-biz', sf).value, p_drop_cutoff_hours: Number($('#st-cut', sf).value),
        p_grace_minutes: Number($('#st-grace', sf).value), p_currency: $('#st-cur', sf).value,
      });
      await rpc('mgr_save_clock_rules', { p_require_shift: $('#st-req', sf).checked, p_early_minutes: Number($('#st-early', sf).value) });
      await refreshMe();
      toast('Instellingen opgeslagen.');
      renderShell();
    }).catch(e => { $('#st-err', sf).textContent = e.message; });
  });
}

/* ---------------------------------------------------- manager: one person */

// A family account: name, PIN and the switch to turn it off, plus the
// personal details and payslips when that person is on the payroll too.
function familyMember(el, r) {
  const p = r.person;
  el.innerHTML = `
    <div class="view-head"><div class="hello">
      ${personPic(p, 'xl')}
      <div><button class="link back" id="back">‹ Team</button><h1>${esc(p.name)}</h1>
        <p class="muted">Familie · ziet alleen het maandoverzicht${p.active ? '' : ' · Inactief'}</p></div>
    </div></div>
    ${p.locked ? '<p class="hint bad">Geblokkeerd na te veel verkeerde pincodes. Stel hieronder een nieuwe pincode in om te deblokkeren.</p>' : ''}
    <div class="grid-2">
      <section class="card">
        <h2>Account</h2>
        <form id="pm-form" novalidate>
          <div class="form-grid" style="margin-top:12px">
            <div class="field wide"><label for="pm-name">Naam</label><input id="pm-name" maxlength="60" value="${esc(p.name)}" required><span class="help">Hiermee meldt die persoon zich aan.</span></div>
            <div class="field"><label for="pm-pin">Nieuwe pincode</label><input id="pm-pin" class="pin-input" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="Leeg laten om te behouden"></div>
            <div class="field"><label for="pm-role">Rol</label><select id="pm-role">${roleOptions(p.role)}</select></div>
            <div class="field wide"><label class="check"><input type="checkbox" id="pm-active" ${p.active ? 'checked' : ''}> Actief</label></div>
          </div>
          <p class="form-error" id="pm-err"></p>
          <div class="form-actions"><button type="submit" class="primary">Opslaan</button></div>
        </form>
      </section>
      <section class="card">
        <h2>Wat ziet dit account?</h2>
        <ul class="plain-list">
          <li><strong>Kalender:</strong> de maand, met wie op welke dag werkt en de open shiften in het rood. Ook op een gsm: een tik op een dag toont die dag groot.</li>
          <li><strong>Personeel:</strong> iedereen met de leeftijd, het uurloon, de gewerkte uren van de maand, het totaal en <strong>Cash</strong> (rood) of <strong>Ingeschreven</strong>.</li>
          <li>In het Nederlands of het Chinees (中文), te kiezen bovenaan.</li>
        </ul>
        <div class="form-actions"><button class="sm" id="see-family">Bekijk het overzicht</button></div>
      </section>
    </div>
    <section class="card">
      <h2>Persoonlijke gegevens</h2>
      <form id="pf-form" novalidate><div class="form-grid" style="margin-top:12px">${profileFields('mf', r.profile)}</div>
        <p class="form-error" id="pf-err"></p><div class="form-actions"><button type="submit" class="primary">Gegevens opslaan</button></div></form>
    </section>
    ${r.payslips.length ? `<section class="card">
      <h2>Loonfiches</h2>
      <div class="rows">${r.payslips.map(x => `
        <div class="row"><div class="row-main"><span class="row-title">${fmt.month(new Date(x.month + 'T00:00'))}</span>
          <span class="row-sub">${x.net_pay != null ? `Netto ${fmt.money(x.net_pay)}${x.gross_pay != null ? ` · bruto ${fmt.money(x.gross_pay)}` : ''} · ` : ''}${esc(x.file_name)}</span></div>
          <div class="row-actions"><button class="sm" data-slip-get="${x.id}">Downloaden</button></div></div>`).join('')}</div>
    </section>` : ''}`;
  $('#back', el).addEventListener('click', () => { location.hash = 'team'; });
  $('#see-family', el).addEventListener('click', () => { location.hash = 'family'; });
  $$('[data-slip-get]', el).forEach(b => b.addEventListener('click', () => downloadPayslip(b.dataset.slipGet, b)));
  const pf = $('#pf-form', el);
  pf.addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('#pf-err', el); err.textContent = '';
    const r2 = readProfile(pf);
    if (r2.error) { err.textContent = r2.error; r2.field.focus(); return; }
    await busy($('button[type=submit]', pf), async () => {
      await rpc('mgr_save_profile', { p_id: p.id, p_profile: r2.values });
      toast('Gegevens opgeslagen.');
      renderView();
    }).catch(e => { err.textContent = e.message; });
  });
  const pm = $('#pm-form', el);
  pm.addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('#pm-err', el); err.textContent = '';
    const pin = $('#pm-pin', pm).value.trim();
    if (pin && !/^\d{4,8}$/.test(pin)) { err.textContent = 'De pincode moet 4 tot 8 cijfers hebben.'; return; }
    await busy($('button[type=submit]', pm), async () => {
      await rpc('mgr_save_staff', {
        p_id: p.id, p_name: $('#pm-name', pm).value, p_pin: pin || null, p_role: $('#pm-role', pm).value,
        p_hourly_rate: null, p_active: $('#pm-active', pm).checked,
      });
      toast(pin ? `Opgeslagen. Nieuwe pincode: ${pin}` : 'Opgeslagen.');
      await loadStaff(true);
      renderView();
    }).catch(e => { err.textContent = e.message; });
  });
}

async function viewMember(el, current) {
  const id = S.memberId;
  const [r, templates] = await Promise.all([rpc('mgr_get_staff', { p_id: id }), rpc('mgr_templates'), loadStaff()]);
  if (!current()) return;
  const p = r.person, pr = r.profile, xp = r.xp, self = p.id === S.me.id, first = p.name.split(' ')[0];
  const mine = templates.filter(tp => tp.staff_id === p.id);
  if (p.role === 'viewer') return familyMember(el, r);
  el.innerHTML = `
    <div class="view-head"><div class="hello">
      ${personPic(p, 'xl')}
      <div><button class="link back" id="back">‹ Team</button><h1>${esc(p.name)}</h1>
        <p class="lvl-line">${levelPill(xp)} <span>${esc(levelTitle(xp.level))}</span> <span class="muted">· ${ROLE_NL[p.role]}${p.active ? '' : ' · Inactief'}</span> ${payPill(p.pay_method)}${p.officient_id ? ' <span class="pill">Officient</span>' : ''}</p></div>
    </div></div>
    ${p.locked ? '<p class="hint bad">Geblokkeerd na te veel verkeerde pincodes. Stel hieronder een nieuwe pincode in om te deblokkeren.</p>' : ''}
    <div class="grid-2">
      <section class="card">
        <h2>Werk en loon</h2>
        <form id="pm-form" novalidate>
          <div class="form-grid" style="margin-top:12px">
            <div class="field wide"><label for="pm-name">Naam</label><input id="pm-name" maxlength="60" value="${esc(p.name)}" required><span class="help">Hiermee meldt ${esc(first)} zich aan.</span></div>
            <div class="field"><label for="pm-pin">Nieuwe pincode</label><input id="pm-pin" class="pin-input" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="Leeg laten om te behouden"></div>
            <div class="field"><label for="pm-rate">Uurloon (€)</label><input id="pm-rate" type="number" min="0" step="0.01" inputmode="decimal" value="${p.hourly_rate ?? ''}"></div>
            <div class="field"><label for="pm-pay">Betaling</label><select id="pm-pay">${payOptions(p.pay_method)}</select>
              <span class="help">Staat ook in het familie-overzicht. Cash in het rood.</span></div>
            <div class="field"><label for="pm-type">Statuut</label><select id="pm-type">${contractOptions(p.contract_type)}</select></div>
            <div class="field"><label for="pm-pid">Werknemersnummer (Securex)</label><input id="pm-pid" maxlength="30" autocomplete="off" value="${esc(p.payroll_id || '')}"></div>
            <div class="field"><label for="pm-start">In dienst sinds</label><input id="pm-start" data-k="start_date" inputmode="numeric" placeholder="dd/mm/jjjj" maxlength="10" value="${esc(isoToDMY(pr.start_date))}"></div>
            <div class="field"><label for="pm-role">Rol</label><select id="pm-role">${roleOptions(p.role)}</select></div>
            <div class="field"><label for="pm-bonus">Bonus-XP</label><input id="pm-bonus" type="number" min="0" max="100000" step="1" inputmode="numeric" value="${p.xp_bonus || 0}">
              <span class="help">XP die jij geeft, bovenop het werk. Telt voor het level, niet voor de uren of het loon. Level 20 = ${num(xpForLevel(20), 0)} XP.</span></div>
            <div class="field wide"><label class="check"><input type="checkbox" id="pm-active" ${p.active ? 'checked' : ''} ${self ? 'disabled' : ''}> Actief</label>
              <span class="help">${self ? 'Je kan jezelf niet op inactief zetten.' : 'Inactieve mensen kunnen zich niet aanmelden en hun toekomstige shiften komen weer open te staan. Hun uren blijven bewaard.'}</span></div>
          </div>
          <p class="form-error" id="pm-err"></p>
          <div class="form-actions"><button type="submit" class="primary">Opslaan</button></div>
        </form>
      </section>
      <section class="card member-hero">
        <div class="member-pic">${p.avatar ? Avatar.render(p.avatar) : `<span class="hero-empty">${Avatar.render(Avatar.DEFAULT)}</span>`}</div>
        <div class="hero-main">
          <h2 class="hero-level">Level ${xp.level} <span>· ${esc(levelTitle(xp.level))}</span></h2>
          ${xpBar(xp)}
          <dl class="kv">
            ${xp.bonus ? `<dt>Bonus-XP</dt><dd>${num(xp.bonus, 0)}</dd>` : ''}
            <dt>Uren gewerkt</dt><dd>${fmt.hours(xp.minutes)} uur</dd>
            <dt>Keer gewerkt</dt><dd>${xp.entries}</dd>
            <dt>Op tijd begonnen</dt><dd>${xp.entries ? Math.round(xp.on_time / xp.entries * 100) + '%' : '—'}</dd>
            <dt>Gestart in de app</dt><dd>${fmtDate(p.created_at.slice(0, 10))}</dd>
          </dl>
          ${p.avatar ? '' : `<p class="muted small">${esc(first)} heeft nog geen avatar gemaakt.</p>`}
        </div>
      </section>
    </div>
    <section class="card">
      <div class="card-head"><h2>Vaste uren</h2>${p.active ? '<button class="sm" id="add-fixed">+ Vaste uren toevoegen</button>' : ''}</div>
      <p class="muted small" style="margin-top:6px">Werkt ${esc(first)} elke week op dezelfde momenten? Dan kan ${esc(first)} tijdens die uren inklokken. Vaste uren staan niet in de kalender: die is voor studenten en deeltijdsen.</p>
      ${p.contract_minutes && contractText(p.contract_minutes) ? `<p class="small" style="margin-top:6px">Contracturen volgens Officient: <strong>${esc(contractText(p.contract_minutes))}</strong></p>` : ''}
      ${mine.length ? `<div class="rows">${mine.map(tp => `
        <div class="row"><div class="row-main"><span class="row-title">${esc(tp.label || 'Shift')}</span>
          <span class="row-sub">${daysText(tp.weekdays)} · <span class="time">${tp.start_time} – ${tp.end_time}</span></span></div>
          <div class="row-actions"><button class="sm" data-template="${tp.id}">Wijzigen</button></div></div>`).join('')}</div>`
        : '<p class="empty">Geen vaste uren. Shiften neemt die persoon zelf op of krijgt ze van jou.</p>'}
    </section>
    <section class="card">
      <div class="card-head"><h2>Persoonlijke gegevens</h2><button class="sm" id="from-slip">Invullen vanuit een loonfiche</button></div>
      <p class="muted small" style="margin-top:6px">${esc(first)} kan deze gegevens ook zelf invullen bij Profiel. Alleen die persoon en de verantwoordelijken zien ze.</p>
      <form id="pf-form" novalidate><div class="form-grid" style="margin-top:12px">${profileFields('mf', pr)}</div>
        <p class="form-error" id="pf-err"></p><div class="form-actions"><button type="submit" class="primary">Gegevens opslaan</button></div></form>
    </section>
    <div class="grid-2">
      <section class="card">
        <h2>Contracten</h2>
        ${contractRows(r.contracts, true)}
        <details class="addbox" id="ct-box" style="margin-top:12px"><summary><span class="btn sm when-closed">+ Contract toevoegen</span></summary>
          <form id="ct-form" novalidate>
            <div class="form-grid">
              <div class="field wide"><label for="ct-title">Naam</label><input id="ct-title" maxlength="80" placeholder="bv. Studentenovereenkomst 2026"></div>
              <div class="field"><label for="ct-start">Begint op</label><input id="ct-start" inputmode="numeric" placeholder="dd/mm/jjjj" maxlength="10"></div>
              <div class="field"><label for="ct-end">Eindigt op</label><input id="ct-end" inputmode="numeric" placeholder="dd/mm/jjjj (optioneel)" maxlength="10"></div>
              <div class="field wide"><label>Bestand</label><div class="copybox"><code id="ct-name">Nog geen bestand gekozen</code><button type="button" class="sm" id="ct-pick">Kies een bestand</button></div>
                <span class="help">Pdf of foto, tot 4 MB. ${esc(first)} kan het downloaden bij Profiel.</span></div>
            </div>
            <input type="file" id="ct-file" accept="application/pdf,image/png,image/jpeg" hidden>
            <p class="form-error" id="ct-err"></p>
            <div class="form-actions"><button type="button" id="ct-cancel">Annuleren</button><button type="submit" class="primary">Contract toevoegen</button></div>
          </form>
        </details>
      </section>
      <section class="card">
        <div class="card-head"><h2>Loonfiches</h2><button class="sm primary" id="slip-up">Loonfiche uploaden</button></div>
        ${r.payslips.length ? `<div class="rows">${r.payslips.map(x => `
          <div class="row"><div class="row-main"><span class="row-title">${fmt.month(new Date(x.month + 'T00:00'))}</span>
            <span class="row-sub">${x.net_pay != null ? `Netto ${fmt.money(x.net_pay)}${x.gross_pay != null ? ` · bruto ${fmt.money(x.gross_pay)}` : ''} · ` : ''}${esc(x.file_name)}</span></div>
            <div class="row-actions"><button class="sm" data-slip-get="${x.id}">Downloaden</button></div></div>`).join('')}</div>`
          : '<p class="empty">Nog geen loonfiches.</p>'}
        <p class="muted small" style="margin-top:10px">De app leest de maand en de bedragen uit de loonfiche en vult ontbrekende gegevens aan. Jij kijkt het na voor het bewaard wordt.</p>
      </section>
    </div>
    <input type="file" id="slip-file" accept="application/pdf,image/png,image/jpeg" hidden>`;

  $('#back', el).addEventListener('click', () => { location.hash = 'team'; });
  const addFixed = $('#add-fixed', el);
  if (addFixed) addFixed.addEventListener('click', () => templateModal(null, { staffId: p.id }));
  $$('[data-template]', el).forEach(b => b.addEventListener('click', () => templateModal(mine.find(x => x.id === b.dataset.template))));
  const pm = $('#pm-form', el);
  pm.addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('#pm-err', el); err.textContent = '';
    const pin = $('#pm-pin', pm).value.trim(), rate = $('#pm-rate', pm).value, start = parseDMY($('#pm-start', pm).value);
    if (pin && !/^\d{4,8}$/.test(pin)) { err.textContent = 'De pincode moet 4 tot 8 cijfers hebben.'; return; }
    if (start == null) { err.textContent = 'Vul de datum van indiensttreding in als dd/mm/jjjj, bv. 01/09/2026.'; return; }
    const bonus = Number($('#pm-bonus', pm).value || 0);
    if (!Number.isInteger(bonus) || bonus < 0 || bonus > 100000) { err.textContent = 'Bonus-XP moet een getal tussen 0 en 100.000 zijn.'; return; }
    await busy($('button[type=submit]', pm), async () => {
      await rpc('mgr_save_staff', {
        p_id: p.id, p_name: $('#pm-name', pm).value, p_pin: pin || null, p_role: $('#pm-role', pm).value,
        p_hourly_rate: rate === '' ? null : Number(rate), p_active: self ? true : $('#pm-active', pm).checked,
      });
      await rpc('mgr_save_staff_payroll', { p_id: p.id, p_contract_type: $('#pm-type', pm).value || null, p_payroll_id: $('#pm-pid', pm).value.trim() });
      await rpc('mgr_save_profile', { p_id: p.id, p_profile: { start_date: start } });
      if (bonus !== (p.xp_bonus || 0)) await rpc('mgr_set_xp_bonus', { p_id: p.id, p_bonus: bonus });
      const pay = $('#pm-pay', pm).value || null;
      if (pay !== (p.pay_method || null)) await rpc('mgr_set_pay_method', { p_id: p.id, p_method: pay });
      toast(pin ? `Opgeslagen. Nieuwe pincode: ${pin}` : 'Opgeslagen.');
      await loadStaff(true);
      if (self) { await refreshMe(); renderShell(); } else renderView();
    }).catch(e => { err.textContent = e.message; });
  });
  const pf = $('#pf-form', el);
  pf.addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('#pf-err', el); err.textContent = '';
    const r2 = readProfile(pf);
    if (r2.error) { err.textContent = r2.error; r2.field.focus(); return; }
    await busy($('button[type=submit]', pf), async () => {
      await rpc('mgr_save_profile', { p_id: p.id, p_profile: r2.values });
      toast('Gegevens opgeslagen.');
      await loadStaff(true);
      renderView();
    }).catch(e => { err.textContent = e.message; });
  });

  // contracts
  const box = $('#ct-box', el), ctFile = $('#ct-file', el);
  let chosen = null;
  $('#ct-pick', el).addEventListener('click', () => { ctFile.value = ''; ctFile.click(); });
  ctFile.addEventListener('change', () => {
    chosen = ctFile.files[0] || null;
    $('#ct-name', el).textContent = chosen ? `${chosen.name} · ${fmtSize(chosen.size)}` : 'Nog geen bestand gekozen';
    if (chosen && !$('#ct-title', el).value.trim()) $('#ct-title', el).value = chosen.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ');
  });
  $('#ct-cancel', el).addEventListener('click', () => { box.open = false; });
  $('#ct-form', el).addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('#ct-err', el); err.textContent = '';
    const a = parseDMY($('#ct-start', el).value), b = parseDMY($('#ct-end', el).value);
    if (a == null || b == null) { err.textContent = 'Vul de datums in als dd/mm/jjjj, bv. 01/09/2026.'; return; }
    if (a && b && b < a) { err.textContent = 'De einddatum moet na de begindatum liggen.'; return; }
    const type = fileType(chosen);
    if (!chosen) { err.textContent = 'Kies het bestand van het contract.'; return; }
    if (!type) { err.textContent = 'Upload een pdf-, png- of jpg-bestand.'; return; }
    if (chosen.size > 4 * 1024 * 1024) { err.textContent = 'Dat bestand is groter dan 4 MB. Bewaar het als een kleinere pdf en probeer opnieuw.'; return; }
    await busy($('button[type=submit]', ev.target), async () => {
      await rpc('mgr_upload_contract', {
        p_staff_id: p.id, p_title: $('#ct-title', el).value, p_starts_on: a || null, p_ends_on: b || null,
        p_file_name: chosen.name, p_content_type: type, p_data: await readAsBase64(chosen),
      });
      toast(`Contract toegevoegd. ${first} kan het downloaden bij Profiel.`);
      renderView();
    }).catch(e => { err.textContent = e.message; });
  });
  $$('[data-contract]', el).forEach(b => b.addEventListener('click', () => downloadContract(b.dataset.contract, b)));
  $$('[data-contract-rm]', el).forEach(b => b.addEventListener('click', async () => {
    const ok = await modal.confirm({ title: `“${b.dataset.title}” verwijderen?`, body: `${esc(first)} kan dit contract dan niet meer downloaden.`, ok: 'Contract verwijderen', danger: true });
    if (!ok) return;
    busy(null, async () => { await rpc('mgr_remove_contract', { p_id: b.dataset.contractRm }); toast('Contract verwijderd.'); renderView(); }).catch(() => {});
  }));

  // payslips: both buttons read the file and show what was found
  const slipFile = $('#slip-file', el);
  const pick = () => { slipFile.value = ''; slipFile.click(); };
  $('#slip-up', el).addEventListener('click', pick);
  $('#from-slip', el).addEventListener('click', pick);
  slipFile.addEventListener('change', () => { if (slipFile.files.length) payslipImport([...slipFile.files], { staffId: p.id }); });
  $$('[data-slip-get]', el).forEach(b => b.addEventListener('click', () => downloadPayslip(b.dataset.slipGet, b)));
}

const fileType = f => f ? (f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : '')).replace(/^image\/jpg$/, 'image/jpeg') : '';
const okFileType = t => ['application/pdf', 'image/png', 'image/jpeg'].includes(t);

/* ------------------------------------------------------ Exact Officient */

// The link with Exact Officient runs as a Supabase Edge Function: it signs in
// at Officient with the manager's own API app, and every night fetches the
// staff's details, wages, contract hours and new payslips.
const officientCall = body => rpc('officient', { token: S.token, ...body }, { auth: false, path: '/functions/v1/officient' });
const OFFICIENT_RETURN = 'prikklok.officient';
const OFFICIENT_SCOPES = ['basics:read', 'personal.info:read', 'wages:read', 'weekly.schedules:read', 'contracts:read', 'documents.read'];

// Officient sends the manager back to the app with ?code=…&state=…; keep it
// until the app has signed in, and clean up the address.
(function catchOfficientReturn() {
  const q = new URLSearchParams(location.search);
  if (!q.get('state') || !(q.get('code') || q.get('error'))) return;
  store.set(OFFICIENT_RETURN, JSON.stringify({ code: q.get('code'), state: q.get('state'), error: q.get('error') }));
  history.replaceState(null, '', location.pathname + '#team');
})();

async function finishOfficient() {
  const raw = store.get(OFFICIENT_RETURN);
  if (!raw || !isManager()) return;
  store.set(OFFICIENT_RETURN, null);
  let back;
  try { back = JSON.parse(raw); } catch { return; }
  if (back.error || !back.code) { toast('Koppelen met Officient geannuleerd.', 'error'); return; }
  toast('Bezig met koppelen en ophalen bij Officient…');
  try {
    const r = await officientCall({ action: 'connect', code: back.code, state: back.state });
    toast(`Gekoppeld met Officient. ${officientSummary(r.report)}`);
  } catch (e) {
    if (e.code !== 'auth') toast(e.message, 'error');
  }
  await loadStaff(true).catch(() => {});
  if (S.view === 'team') renderView();
}

const officientSummary = r => r
  ? `${r.matched} van ${plural(r.people, 'persoon', 'mensen')} gevonden, ${r.updated.length} bijgewerkt, ${plural(r.payslips.length, 'nieuwe loonbrief', 'nieuwe loonbrieven')}.`
  : '';

function officientReport(r) {
  if (!r) return '';
  const types = Object.entries(r.document_types || {});
  return `
    <ul class="plain-list off-report">
      <li><strong>${r.matched}</strong> van de ${plural(r.people, 'persoon', 'mensen')} in Officient gevonden in de app${r.linked ? `, waarvan ${r.linked} nieuw gekoppeld` : ''}.</li>
      ${r.updated.length ? `<li>Bijgewerkt: ${r.updated.map(u => `${esc(u.name)} <span class="muted">(${esc(u.changed.join(', '))})</span>`).join(', ')}.</li>` : '<li>Geen gegevens gewijzigd.</li>'}
      ${r.payslips.length ? `<li>Nieuwe loonbrieven: ${r.payslips.map(x => `${esc(x.name)} – ${esc(fmt.month(new Date(x.month + 'T00:00')))}`).join(', ')}.</li>` : '<li>Geen nieuwe loonbrieven.</li>'}
      ${r.already ? `<li>${plural(r.already, 'loonbrief stond', 'loonbrieven stonden')} er al (zelf geüpload).</li>` : ''}
      ${r.more ? '<li>Er zijn nog meer loonbrieven; die komen bij de volgende ophaling.</li>' : ''}
      ${r.unmatched.length ? `<li class="off-unmatched">In Officient, maar niet in de app: <strong>${r.unmatched.map(esc).join(', ')}</strong>. Voeg ze toe bij <em>Persoon toevoegen</em> met dezelfde naam; de volgende ophaling vult hun gegevens aan.</li>` : ''}
      <li class="muted">Documenten in Officient: ${types.length ? types.map(([k, n]) => `${esc(k)} (${n})`).join(', ') : 'geen'}.</li>
    </ul>`;
}

function officientCard(o, link) {
  const callback = link;
  const appForm = `
    <form id="off-form" novalidate>
      <ol class="plain-list off-steps">
        <li>Meld je aan in Officient als beheerder. Klik rechtsboven op je avatar en dan op <a href="https://app.officient.io/developer" target="_blank" rel="noopener">Developers</a>.</li>
        <li>Maak een <strong>client app</strong>, bv. “Prikklok”. Geef alleen <strong>leesrechten</strong>: <code>${OFFICIENT_SCOPES.join('</code>, <code>')}</code>.</li>
        <li>Vul als <strong>callback-URL</strong> in: <span class="copybox off-callback"><code id="off-cb">${esc(callback)}</code><button type="button" class="sm" id="off-copy">Kopiëren</button></span></li>
        <li>Kopieer de <strong>client ID</strong> en de <strong>client secret</strong> van die app hieronder.</li>
      </ol>
      <div class="form-grid" style="margin-top:12px">
        <div class="field"><label for="off-id">Client ID</label><input id="off-id" maxlength="200" autocomplete="off" spellcheck="false" value="${esc(o.client_id || '')}"></div>
        <div class="field"><label for="off-secret">Client secret</label><input id="off-secret" type="password" maxlength="200" autocomplete="off" spellcheck="false"></div>
      </div>
      <p class="muted small">De client secret wordt enkel op de server bewaard. De app toont hem nooit meer.</p>
      <p class="form-error" id="off-err"></p>
      <div class="form-actions">${o.configured ? '<button type="button" id="off-cancel">Annuleren</button>' : ''}<button type="submit" class="primary">App-gegevens opslaan</button></div>
    </form>`;
  let body;
  if (!o.configured) body = appForm;
  else if (!o.connected) body = `
    <p>De app-gegevens zijn bewaard (client ID <code>${esc(o.client_id)}</code>). Koppel nu: je meldt je aan bij Officient en keurt de toegang goed.</p>
    ${o.last_error ? `<p class="hint bad">${esc(tr(o.last_error))}</p>` : ''}
    <div class="form-actions" style="justify-content:space-between"><button type="button" class="link" id="off-edit">Andere app-gegevens</button><button type="button" class="primary" id="off-connect">Koppelen met Officient</button></div>
    <div id="off-edit-box" hidden>${appForm}</div>`;
  else body = `
    <p>Elke nacht haalt de app de gegevens van je personeel uit Officient (adres, rekeningnummer, uurloon, contracturen) en de nieuwe loonbrieven.
      ${o.last_sync_at ? `Laatst opgehaald: <strong>${esc(fmt.when(o.last_sync_at))}</strong>.` : 'Nog niet opgehaald.'}</p>
    ${o.last_error ? `<p class="hint bad">Het laatste ophalen lukte niet: ${esc(tr(o.last_error))}</p>` : ''}
    ${officientReport(o.last_report)}
    <div class="form-actions" style="justify-content:space-between"><button type="button" class="danger" id="off-disconnect">Ontkoppelen</button>
      <button type="button" class="primary" id="off-sync" ${o.syncing ? 'disabled' : ''}>${o.syncing ? 'Bezig met ophalen…' : 'Nu ophalen'}</button></div>`;
  return `
    <section class="card" id="officient">
      <div class="card-head"><h2>Exact Officient</h2>${o.connected ? '<span class="pill on">Gekoppeld</span>' : o.configured ? '<span class="pill warn">Nog niet gekoppeld</span>' : ''}</div>
      <p class="muted small" style="margin-top:6px">Officient is het HR-platform van Securex. Gekoppeld vult de app je personeel en de loonbrieven vanzelf aan.</p>
      ${body}
    </section>`;
}

function bindOfficient(el, o, link) {
  const card = $('#officient', el);
  const form = $('#off-form', card);
  if (form) {
    const copy = $('#off-copy', form);
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(link); toast('Callback-URL gekopieerd.'); }
      catch { const r = document.createRange(); r.selectNodeContents($('#off-cb', form)); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
    });
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const err = $('#off-err', form); err.textContent = '';
      const id = $('#off-id', form).value.trim(), secret = $('#off-secret', form).value.trim();
      if (!id || !secret) { err.textContent = 'Vul de client ID en de client secret in.'; return; }
      await busy($('button[type=submit]', form), async () => {
        await rpc('mgr_officient_save_app', { p_client_id: id, p_client_secret: secret });
        toast('App-gegevens bewaard. Koppel nu met Officient.');
        renderView();
      }).catch(e => { err.textContent = e.message; });
    });
    const cancel = $('#off-cancel', form);
    if (cancel) cancel.addEventListener('click', () => { $('#off-edit-box', card).hidden = true; });
  }
  const edit = $('#off-edit', card);
  if (edit) edit.addEventListener('click', () => { $('#off-edit-box', card).hidden = false; $('#off-id', card).focus(); });
  const connect = $('#off-connect', card);
  if (connect) connect.addEventListener('click', () => busy(connect, async () => {
    const a = await rpc('mgr_officient_authorize');
    location.href = `https://app.officient.io/authorize?client_id=${encodeURIComponent(a.client_id)}&state=${encodeURIComponent(a.state)}`;
  }).catch(() => {}));
  const sync = $('#off-sync', card);
  if (sync) sync.addEventListener('click', () => busy(sync, async () => {
    const r = await officientCall({ action: 'sync' });
    toast(`Opgehaald. ${officientSummary(r.report)}`);
    await loadStaff(true);
    renderView();
  }).catch(() => renderView()));
  const off = $('#off-disconnect', card);
  if (off) off.addEventListener('click', async () => {
    const ok = await modal.confirm({ title: 'Ontkoppelen van Officient?', body: 'De app haalt dan niets meer op. Wat al in de app staat, blijft.', ok: 'Ontkoppelen', danger: true });
    if (!ok) return;
    busy(null, async () => { await rpc('mgr_officient_disconnect'); toast('Ontkoppeld van Officient.'); renderView(); }).catch(() => {});
  });
}

// contract hours from Officient, eg "20u per week (ma 4u, wo 4u, …)"
const OFF_DAYS = [['monday', 1], ['tuesday', 2], ['wednesday', 3], ['thursday', 4], ['friday', 5], ['saturday', 6], ['sunday', 0]];
function contractText(mins) {
  if (!mins) return '';
  const days = OFF_DAYS.filter(([k]) => Number(mins[k]) > 0);
  const total = days.reduce((a, [k]) => a + Number(mins[k]), 0);
  if (!total) return '';
  const h = m => `${num(Math.round(m / 6) / 10, m % 60 ? 1 : 0)}u`;
  return `${h(total)} per week (${days.map(([k, d]) => `${DAY_SHORT[d]} ${h(Number(mins[k]))}`).join(', ')})`;
}

/* ------------------------------------------------- family (view only) */

// A family account sees one simple page per month: the open shifts, who works
// which day, and per person the hours, the hourly rate and whether they're
// paid in cash or registered. That page and the sign-in screen read in Dutch
// or Chinese; the rest of the app is Dutch.
const LANG_KEY = 'prikklok.lang';
const lang = () => store.get(LANG_KEY) === 'zh' ? 'zh' : 'nl';
const L = (nl, zh) => lang() === 'zh' ? zh : nl;
const langAttr = () => lang() === 'zh' ? 'zh-Hans' : 'nl-BE';
const fam = {
  locale: () => lang() === 'zh' ? 'zh-CN' : LOCALE,
  month: d => new Date(d).toLocaleDateString(fam.locale(), { month: 'long', year: 'numeric' }),
  day: d => new Date(d).toLocaleDateString(fam.locale(), { weekday: 'long', day: 'numeric', month: 'long' }),
  dur(mins) {
    const t = Math.max(0, Math.round(mins)), h = Math.floor(t / 60), m = t % 60;
    return L(h ? `${h}u ${pad(m)}m` : `${m}m`, h ? `${h}小时${m ? `${m}分` : ''}` : `${m}分钟`);
  },
  money: n => lang() === 'zh' ? `${S.settings.currency || '€'}${num(n, 2).replace(/\./g, '').replace(',', '.')}` : fmt.money(n),
  part: s => { const p = shiftPart(s); return lang() === 'zh' ? ({ Middag: '午班', Avond: '晚班' }[p] || p) : p; },
};

const PAY = { cash: ['Cash', '现金'], registered: ['Ingeschreven', '已登记'] };
// Cash is red; t is L on the family page, Dutch everywhere else.
const payPill = (m, t = nl => nl) => PAY[m]
  ? `<span class="pay-pill is-${m}">${esc(t(...PAY[m]))}</span>`
  : `<span class="pay-pill is-none">${esc(t('Niet ingevuld', '未填写'))}</span>`;

function langSwitch() {
  return `<div class="chips lang-switch" role="group" aria-label="Taal · 语言">${[['nl', 'Nederlands', 'nl-BE'], ['zh', '中文', 'zh-Hans']].map(([k, l, a]) =>
    `<button type="button" class="chip${lang() === k ? ' is-on' : ''}" data-lang="${k}" lang="${a}" aria-pressed="${lang() === k}">${l}</button>`).join('')}</div>`;
}
function bindLang(root, after) {
  $$('[data-lang]', root).forEach(b => b.addEventListener('click', () => { store.set(LANG_KEY, b.dataset.lang); after(); }));
}

function renderFamilyShell() {
  const tabs = tabsFor();
  const icon = { family: ICONS.shifts, famstaff: ICONS.team };
  document.title = `${S.settings.business_name} · ${L('Overzicht', '概览')}`;
  $('#app').innerHTML = `
    <header class="topbar" lang="${langAttr()}">
      <div class="topbar-inner">
        <div class="brand">${personPic(S.me, 'lg')}
          <div class="brand-text"><div class="biz">${esc(S.me.name)}</div><div class="who">${L('Maandoverzicht', '每月概览')}</div></div>
        </div>
        <a class="logo-link" href="#" aria-label="${esc(S.settings.business_name)}">${logoHTML('logo')}</a>
        <div class="topbar-end"><button type="button" class="icon ghost theme-btn" data-theme-btn></button><button class="ghost sm" id="signout">${L('Afmelden', '退出')}</button></div>
      </div>
      <nav class="tabs" aria-label="${L('Onderdelen', '页面')}"><div class="tabs-inner">
        ${tabs.map(([k, l]) => `<button class="tab" data-tab="${k}">${l}</button>`).join('')}
      </div></nav>
    </header>
    <main class="view" id="view"></main>
    <nav class="bnav" aria-label="${L('Onderdelen', '页面')}" lang="${langAttr()}">
      ${tabs.map(([k, l]) => `<button data-tab="${k}">${icon[k]}<span>${l}</span></button>`).join('')}
    </nav>`;
  $('#signout').addEventListener('click', askSignOut);
  $('[data-theme-btn]').addEventListener('click', () => setTheme(isDark() ? 'light' : 'dark'));
  $$('[data-tab]').forEach(b => b.addEventListener('click', () => { location.hash = b.dataset.tab; }));
  applyTheme();
  route();
}

// Both family pages share the month and the top of the page.
async function familyData() {
  S.famMonth = S.famMonth || startOfMonth(now());
  const m = S.famMonth;
  return { m, r: await rpc('family_overview', { p_from: m.toISOString(), p_to: addMonths(m, 1).toISOString() }) };
}
function familyHead(m, title) {
  return `
    <div class="view-head fam-head"><div><h1>${title}</h1><p>${esc(S.settings.business_name)}</p></div>${langSwitch()}</div>
    ${isViewer() ? '' : `<p class="hint info">Zo ziet het familie-account dit.
      <button class="link" data-go-fam="family">Kalender</button> · <button class="link" data-go-fam="famstaff">Personeel</button> · <button class="link" data-go-fam="team">Terug naar Team</button></p>`}
    ${periodBar(esc(fam.month(m)), sameDay(m, startOfMonth(now())) ? L('Deze maand', '本月') : '&nbsp;', 'fam-prev', 'fam-next')}`;
}
function bindFamilyHead(el, m) {
  $('#fam-prev', el).addEventListener('click', () => { S.famMonth = addMonths(m, -1); renderView(); });
  $('#fam-next', el).addEventListener('click', () => { S.famMonth = addMonths(m, 1); renderView(); });
  bindLang(el, () => (isViewer() ? renderShell() : renderView()));
  $$('[data-go-fam]', el).forEach(b => b.addEventListener('click', () => { location.hash = b.dataset.goFam; }));
  const so = $('#fam-signout', el);
  if (so) so.addEventListener('click', askSignOut);
  startPolling(5 * 60000);
}
const famSignOut = () => isViewer() ? `<button type="button" class="signout-wide" id="fam-signout">${ICONS.signout}<span>${L('Afmelden', '退出登录')}</span></button>` : '';

const DAY_NAMES_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

// A fixed worker's weekly hours in words: "elke dag behalve dinsdag · 11:30 – 14:30 en 17:00 – 22:30".
function fixedText(list, t = nl => nl) {
  if (!list || !list.length) return '';
  const zh = t('nl', 'zh') === 'zh', names = zh ? DAY_NAMES_ZH.map(n => n.replace('星期', '周')) : DAY_NAMES;
  const daysOf = days => {
    if (days.length === 7) return t('elke dag', '每天');
    if (days.length === 6) { const off = WEEK_ORDER.find(d => !days.includes(d)); return t(`elke dag behalve ${names[off]}`, `除${names[off]}外每天`); }
    return WEEK_ORDER.filter(d => days.includes(d)).map(d => zh ? names[d] : DAY_SHORT[d]).join(zh ? '、' : ', ');
  };
  const groups = new Map();
  for (const x of list) {
    const k = [...x.weekdays].sort().join();
    if (!groups.has(k)) groups.set(k, { days: x.weekdays, times: [] });
    groups.get(k).times.push(`${x.start_time} – ${x.end_time}`);
  }
  return [...groups.values()].map(g => `${daysOf(g.days)} · ${g.times.join(t(' en ', '、'))}`).join('; ');
}

// The month grid, read only, in the family's language. On a phone the cells
// only show a letter and a picture; the chosen day is spelled out below it.
function famCalendarHTML(shifts, month, people, selected) {
  const t = now(), first = startOfMonth(month), today = startOfDay(t);
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const avatarOf = id => (people.find(p => p.id === id) || {}).avatar;
  const entry = x => {
    const part = shiftPart(x), label = fam.part(x), past = new Date(x.ends_at) <= t;
    if (isGroup(x)) {
      const people = x.people.map(p => ({ ...p, avatar: avatarOf(p.id) }));
      return `<span class="cal-shift is-group${past ? ' is-past' : ''}" title="${esc(`${label}, ${fmt.range(x.starts_at, x.ends_at)}: ${people.map(p => p.name).join(', ')}`)}">
        <span class="cal-line"><span class="cal-tag${partClass(part)}"><span class="tag-full">${esc(label)}</span><span class="tag-short" aria-hidden="true">${esc(label.charAt(0))}</span></span><span class="t">${fmt.range(x.starts_at, x.ends_at)}</span></span>
        ${groupWho(people)}</span>`;
    }
    const who = x.open ? `${L('Open', '空缺')}${x.count > 1 ? ` ×${x.count}` : ''}` : esc(x.staff_name);
    const av = x.open ? null : avatarOf(x.staff_id);
    const pic = x.open ? '' : av ? `<span class="cal-pic">${Avatar.head(av)}</span>` : `<span class="cal-pic cal-initials">${esc(initials(x.staff_name))}</span>`;
    return `<span class="cal-shift${x.open ? ' is-open' : ''}${past ? ' is-past' : ''}" title="${esc(`${label}, ${fmt.range(x.starts_at, x.ends_at)}`)}">
      <span class="cal-line"><span class="cal-tag${partClass(part)}"><span class="tag-full">${esc(label)}</span><span class="tag-short" aria-hidden="true">${esc(label.charAt(0))}</span></span><span class="t">${fmt.range(x.starts_at, x.ends_at)}</span>${x.open && x.count > 1 ? `<span class="cal-count" aria-hidden="true">×${x.count}</span>` : ''}</span>
      <span class="cal-who">${pic}<b>${who}</b></span></span>`;
  };
  const cells = [];
  for (let i = 0; i < weekdayIndex(first); i++) cells.push('<div class="cal-cell is-blank"></div>');
  for (let i = 0; i < days; i++) {
    const d = addDays(first, i), list = dayEntries(shifts.filter(s => sameDay(s.starts_at, d)), { group: true });
    cells.push(`<div class="cal-cell${sameDay(d, t) ? ' is-today' : ''}${d < today ? ' is-before' : ''}${list.length ? ' has-shifts' : ''}${sameDay(d, selected) ? ' is-selected' : ''}" data-day="${toDateInput(d)}">
      <div class="cal-day"><span class="cal-num">${i + 1}</span></div>
      ${list.map(entry).join('')}
    </div>`);
  }
  while (cells.length % 7) cells.push('<div class="cal-cell is-blank"></div>');
  const names = lang() === 'zh' ? DAY_NAMES_ZH : DAY_NAMES;
  return `
    <div class="cal-wrap" lang="${langAttr()}">
      <h2 class="cal-title">${esc(fam.month(first))}</h2>
      <div class="cal-grid">
        ${WEEK_ORDER.map(i => names[i]).map(n => `<div class="cal-head"><span class="only-wide">${n}</span><span class="only-phone" aria-hidden="true">${lang() === 'zh' ? n.slice(-1) : n.slice(0, 2)}</span></div>`).join('')}
        ${cells.join('')}
      </div>
      <div class="cal-legend only-phone">
        <span><span class="cal-tag is-day">${L('M', '午')}</span> ${L('Middag', '午班')}</span><span><span class="cal-tag is-eve">${L('A', '晚')}</span> ${L('Avond', '晚班')}</span>
        <span><span class="lg-box is-open"></span> ${L('Open, nog niemand', '空缺，还没人')}</span>
        <span class="muted">${L('Tik op een dag.', '点日期看详情。')}</span>
      </div>
    </div>`;
}

// One day spelled out in big letters, under the calendar on a phone.
function famDayHTML(shifts, day, people) {
  const t = now(), list = dayEntries(shifts.filter(s => sameDay(s.starts_at, day)), { group: true });
  const avatarOf = id => (people.find(p => p.id === id) || {}).avatar;
  const who = p => `<span class="fam-person-chip">${personPic({ name: p.name, avatar: avatarOf(p.id) })}<span>${esc(p.name)}</span></span>`;
  return `
    <h2>${esc(fam.day(day))}${sameDay(day, t) ? ` <span class="pill on">${L('Vandaag', '今天')}</span>` : ''}</h2>
    ${list.length ? `<div class="day-list">${list.map(x => `
      <div class="day-shift${x.open ? ' is-open' : ''}${new Date(x.ends_at) <= t ? ' is-past' : ''}">
        <div class="day-main">
          <div class="day-when"><span class="cal-tag${partClass(shiftPart(x))}">${esc(fam.part(x))}</span><span class="time">${fmt.range(x.starts_at, x.ends_at)}</span></div>
          <div class="day-who">${x.open ? `<span class="fam-open-who">${L('Open, nog niemand', '空缺，还没人')}${x.count > 1 ? ` · ${L(`${x.count} plaatsen`, `${x.count}个位置`)}` : ''}</span>`
            : `<span class="fam-people-list">${(x.people || [personOf(x)]).map(who).join('')}</span>`}</div>
        </div>
      </div>`).join('')}</div>` : `<p class="empty">${L('Geen shiften op deze dag.', '这天没有班次。')}</p>`}`;
}

async function viewFamily(el, current) {
  const { m, r } = await familyData();
  if (!current()) return;
  el.setAttribute('lang', langAttr());
  const t = now();
  const shifts = r.shifts.filter(s => new Date(s.starts_at) >= m);
  const openCount = dayEntries(shifts.filter(s => !s.staff_id && new Date(s.ends_at) > t)).reduce((a, x) => a + x.count, 0);
  const people = r.people;
  // the chosen day: today in this month, otherwise the first day with shifts
  let day = sameDay(startOfMonth(t), m) ? startOfDay(t)
    : shifts.length ? startOfDay(shifts[0].starts_at) : m;
  const working = new Set(shifts.filter(s => s.staff_id && new Date(s.ends_at) > t).map(s => s.staff_id)).size;
  el.innerHTML = `
    ${familyHead(m, L('Kalender', '排班'))}
    <div class="stats stats-3 fam-stats">
      <div class="stat ${openCount ? 'alert' : 'good'}"><span class="v">${openCount}</span><span class="k">${L('Open shiften, nog niemand', '空缺班次，还没人')}</span></div>
      <div class="stat"><span class="v">${shifts.filter(s => s.staff_id).length}</span><span class="k">${L('Shiften met iemand', '有人的班次')}</span></div>
      <div class="stat"><span class="v">${working}</span><span class="k">${L('Mensen die nog komen werken', '还要来上班的人')}</span></div>
    </div>
    <section class="card cal-card">${famCalendarHTML(shifts, m, people, day)}</section>
    <section class="card fam-daypanel" id="fam-day" lang="${langAttr()}">${famDayHTML(shifts, day, people)}</section>
    ${famSignOut()}`;
  bindFamilyHead(el, m);
  // phones: a tap on a day shows it below the calendar
  $('.cal-grid', el).addEventListener('click', ev => {
    const cell = ev.target.closest('.cal-cell[data-day]');
    if (!cell || !isPhone()) return;
    day = new Date(cell.dataset.day + 'T00:00');
    $$('.cal-cell.is-selected', el).forEach(c => c.classList.remove('is-selected'));
    cell.classList.add('is-selected');
    const panel = $('#fam-day', el);
    panel.innerHTML = famDayHTML(shifts, day, people);
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

async function viewFamilyStaff(el, current) {
  const { m, r } = await familyData();
  if (!current()) return;
  el.setAttribute('lang', langAttr());
  const team = r.people.filter(p => p.active || p.worked_minutes > 0);
  const owed = p => p.hourly_rate != null ? Math.round(p.worked_minutes / 60 * p.hourly_rate * 100) / 100 : null;
  const cashTotal = team.filter(p => p.pay_method === 'cash').reduce((a, p) => a + (owed(p) || 0), 0);
  const totalMins = team.reduce((a, p) => a + p.worked_minutes, 0);
  const role = p => p.role === 'manager' ? L('Verantwoordelijke', '负责人') : L('Medewerker', '员工');
  const age = p => p.age != null ? L(`${p.age} jaar`, `${p.age}岁`) : '—';
  const rate = p => p.hourly_rate != null ? fam.money(p.hourly_rate) : '—';
  const total = p => owed(p) != null ? fam.money(owed(p)) : '—';
  const tel = p => p.phone ? `<a href="tel:${esc(p.phone.replace(/[^\d+]/g, ''))}">${esc(p.phone)}</a>` : '';
  el.innerHTML = `
    ${familyHead(m, L('Personeel', '员工'))}
    <div class="stats stats-3 fam-stats">
      <div class="stat"><span class="v">${team.filter(p => p.active).length}</span><span class="k">${L('Mensen in het team', '团队人数')}</span></div>
      <div class="stat"><span class="v">${fam.dur(totalMins)}</span><span class="k">${L('Samen gewerkt deze maand', '本月总共工作')}</span></div>
      <div class="stat is-cash"><span class="v">${fam.money(cashTotal)}</span><span class="k">${L('Cash te betalen', '要付的现金')}</span></div>
    </div>
    <section class="card fam-card">
      <div class="card-head"><h2>${L('Al het personeel', '全部员工')}</h2><span class="muted small">${L('Uren volgens de prikklok', '按打卡记录的工时')}</span></div>
      ${team.length ? `
      <div class="table-wrap only-wide-block"><table class="fam-table">
        <thead><tr><th>${L('Naam', '名字')}</th><th class="num">${L('Leeftijd', '年龄')}</th><th>${L('Vaste uren', '固定时间')}</th><th class="num">${L('Per uur', '时薪')}</th><th class="num">${L('Gewerkt', '工作时间')}</th><th class="num">${L('Samen', '合计')}</th><th>${L('Betaling', '付款')}</th></tr></thead>
        <tbody>${team.map(p => `<tr class="${p.pay_method === 'cash' ? 'is-cash' : ''}">
          <td><span class="person">${personPic(p, 'lg')}<span><strong>${esc(p.name)}</strong><span class="row-sub">${role(p)}${p.phone ? ` · ${tel(p)}` : ''}</span></span></span></td>
          <td class="num">${age(p)}</td><td class="fam-fixed">${p.fixed ? esc(fixedText(p.fixed, L)) : `<span class="muted">${L('Volgens de kalender', '按排班')}</span>`}</td><td class="num">${rate(p)}</td>
          <td class="num">${fam.dur(p.worked_minutes)}</td><td class="num fam-total">${total(p)}</td>
          <td>${payPill(p.pay_method, L)}</td></tr>`).join('')}</tbody>
      </table></div>
      <div class="fam-people only-phone-block">${team.map(p => `
        <div class="fam-person${p.pay_method === 'cash' ? ' is-cash' : ''}">
          <div class="fam-person-head">${personPic(p, 'lg')}<strong>${esc(p.name)}</strong>${payPill(p.pay_method, L)}</div>
          <dl class="fam-kv">
            <dt>${L('Leeftijd', '年龄')}</dt><dd>${age(p)}</dd>
            <dt>${L('Vaste uren', '固定时间')}</dt><dd>${p.fixed ? esc(fixedText(p.fixed, L)) : `<span class="muted">${L('Volgens de kalender', '按排班')}</span>`}</dd>
            <dt>${L('Per uur', '时薪')}</dt><dd>${rate(p)}</dd>
            <dt>${L('Gewerkt', '工作时间')}</dt><dd>${fam.dur(p.worked_minutes)} <span class="muted">· ${L(`${p.times} keer`, `${p.times}次`)}</span></dd>
            <dt>${L('Samen', '合计')}</dt><dd class="fam-total">${total(p)}</dd>
            <dt>${L('Functie', '职位')}</dt><dd>${role(p)}</dd>
            ${p.phone ? `<dt>${L('Telefoon', '电话')}</dt><dd>${tel(p)}</dd>` : ''}
          </dl>
        </div>`).join('')}</div>` : `<p class="empty">${L('Nog niemand in het team.', '团队里还没有人。')}</p>`}
    </section>
    ${famSignOut()}`;
  bindFamilyHead(el, m);
}

/* -------------------------------------- payslips: read, check and save */

// What can be copied from a payslip into someone's details: [key, label, where]
const SLIP_FIELDS = [
  ['national_id', 'Rijksregisternummer', 'profile'], ['birth_date', 'Geboortedatum', 'profile'], ['iban', 'IBAN', 'profile'],
  ['street', 'Straat en huisnummer', 'profile'], ['postcode', 'Postcode', 'profile'], ['city', 'Gemeente', 'profile'],
  ['start_date', 'In dienst sinds', 'profile'], ['payroll_id', 'Werknemersnummer', 'payroll'], ['contract_type', 'Statuut', 'payroll'],
  ['hourly_rate', 'Uurloon', 'rate'],
];
function slipValue(k, v) {
  if (v == null || v === '') return '';
  if (k === 'contract_type') return CONTRACTS[v] || v;
  if (k === 'hourly_rate') return fmt.money(v);
  return showValue(k, v);
}
function currentValue(k, person) {
  if (!person) return null;
  if (k === 'payroll_id' || k === 'contract_type' || k === 'hourly_rate') return person.person[k];
  return person.profile[k];
}

async function payslipImport(files, { staffId = null, month = null } = {}) {
  for (const f of files) {
    if (!okFileType(fileType(f))) { toast(`${f.name}: upload een pdf-, png- of jpg-bestand.`, 'error'); return; }
    if (f.size > 4 * 1024 * 1024) { toast(`${f.name} is groter dan 4 MB. Bewaar het als een kleinere pdf en probeer opnieuw.`, 'error'); return; }
  }
  modal.open(`<h2 id="modal-title">${files.length > 1 ? `${files.length} loonfiches lezen…` : 'Loonfiche lezen…'}</h2><p>Even geduld, de app zoekt wie, welke maand en welke bedragen erop staan.</p><div class="spinner" aria-hidden="true"></div>`);
  let items;
  try {
    const staff = await loadStaff(true);
    const fallback = month || toDateInput(addMonths(startOfMonth(now()), -1));
    items = [];
    for (const file of files) {
      const info = await Loonfiche.read(file, staff);
      items.push({ file, info, staffId: staffId || info.staff_id || '', month: info.month || fallback, person: null });
    }
    const people = {};
    await Promise.all([...new Set(items.map(it => it.staffId).filter(Boolean))].map(async id => { people[id] = await rpc('mgr_get_staff', { p_id: id }); }));
    items.forEach(it => { it.person = people[it.staffId] || null; });
  } catch (e) {
    modal.close();
    if (e.code !== 'auth') toast(e.message, 'error');
    return;
  }
  slipReview(items, { fixed: !!staffId });
}

function slipReview(items, { fixed }) {
  const t = now();
  const months = [];
  for (let i = -18; i <= 1; i++) months.push(toDateInput(addMonths(startOfMonth(t), i)));
  const itemHTML = (it, i) => {
    const info = it.info, person = it.person;
    if (!months.includes(it.month)) months.push(it.month);
    const name = person ? person.person.name : '';
    const replaces = person && person.payslips.some(x => x.month === it.month);
    const found = SLIP_FIELDS.filter(([k]) => info[k] != null && info[k] !== '').map(([k, label]) => {
      const cur = currentValue(k, person), same = cur != null && String(cur) === String(info[k]);
      if (same) return '';
      const empty = cur == null || cur === '';
      return `<label class="check found-row"><input type="checkbox" data-take="${k}" ${person && empty ? 'checked' : ''} ${person ? '' : 'disabled'}>
        <span><b>${label}</b> ${esc(slipValue(k, info[k]))} <span class="muted small">· ${empty ? 'nu leeg' : `nu ${esc(slipValue(k, cur))}`}</span></span></label>`;
    }).join('');
    return `<section class="slip-item" data-i="${i}">
      <div class="slip-head"><strong>${esc(it.file.name)}</strong>
        ${info.text_found ? `<span class="pill on">Gelezen${info.staff_id ? '' : ', naam niet gevonden'}</span>` : `<span class="pill warn">${/pdf/.test(fileType(it.file)) ? 'Geen tekst gevonden' : 'Foto'}: kies zelf</span>`}</div>
      <div class="form-grid">
        <div class="field"><label for="si-staff-${i}">Voor wie</label><select id="si-staff-${i}" data-f="staff" ${fixed ? 'disabled' : ''}>
          <option value="">Kies een persoon</option>${workers().filter(p => p.active || p.id === it.staffId).map(p => `<option value="${p.id}" ${p.id === it.staffId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="si-month-${i}">Maand</label><select id="si-month-${i}" data-f="month">${months.sort().reverse().map(m => `<option value="${m}" ${m === it.month ? 'selected' : ''}>${fmt.month(new Date(m + 'T00:00'))}</option>`).join('')}</select></div>
        <div class="field"><label for="si-gross-${i}">Bruto</label><input id="si-gross-${i}" data-f="gross" inputmode="decimal" placeholder="Niet gevonden" value="${moneyInput(info.gross_pay)}"></div>
        <div class="field"><label for="si-net-${i}">Netto, uitbetaald</label><input id="si-net-${i}" data-f="net" inputmode="decimal" placeholder="Niet gevonden" value="${moneyInput(info.net_pay)}"></div>
      </div>
      ${replaces ? `<p class="hint warn" style="margin-top:10px">${esc(name)} heeft al een loonfiche voor ${fmt.month(new Date(it.month + 'T00:00'))}. Die wordt vervangen.</p>` : ''}
      ${found ? `<div class="found"><p class="section-label">Gevonden op de loonfiche${person ? '' : ' (kies eerst voor wie)'}</p>${found}
        ${info.other_ibans ? `<p class="muted small">Er staan nog andere rekeningnummers op (${info.other_ibans.map(fmtIban).join(', ')}), wellicht van de werkgever.</p>` : ''}</div>` : ''}
    </section>`;
  };
  const d = modal.open(`
    <h2 id="modal-title">${items.length > 1 ? `${items.length} loonfiches nakijken` : 'Loonfiche nakijken'}</h2>
    <p>Kijk na of het klopt. De loonfiche wordt bewaard bij de juiste persoon en maand, die ze dan downloadt bij Mijn uren. Aangevinkte gegevens worden overgenomen in het profiel.</p>
    <div id="slip-items">${items.map(itemHTML).join('')}</div>
    <p class="form-error" id="si-err"></p>
    <div class="form-actions"><button type="button" data-close>Annuleren</button><button type="button" class="primary" id="si-save">${items.length > 1 ? 'Alles opslaan' : 'Opslaan'}</button></div>`, null, { wide: true });
  const wrap = $('#slip-items', d);
  const redraw = i => { const sec = $(`.slip-item[data-i="${i}"]`, wrap); sec.outerHTML = itemHTML(items[i], i); };
  wrap.addEventListener('change', async ev => {
    const sec = ev.target.closest('.slip-item'), i = Number(sec.dataset.i), it = items[i], f = ev.target.dataset.f;
    if (f === 'staff') {
      it.staffId = ev.target.value;
      it.person = it.staffId ? await rpc('mgr_get_staff', { p_id: it.staffId }).catch(() => null) : null;
      redraw(i);
    } else if (f === 'month') { it.month = ev.target.value; redraw(i); }
  });
  wrap.addEventListener('input', ev => {
    const sec = ev.target.closest('.slip-item'), it = items[Number(sec.dataset.i)];
    if (ev.target.dataset.f === 'gross') it.gross = ev.target.value;
    if (ev.target.dataset.f === 'net') it.net = ev.target.value;
  });
  const save = $('#si-save', d);
  save.addEventListener('click', async () => {
    const err = $('#si-err', d); err.textContent = '';
    const plan = [];
    for (const [i, it] of items.entries()) {
      if (it.done) continue;
      const sec = $(`.slip-item[data-i="${i}"]`, wrap);
      if (!it.staffId || !it.person) { err.textContent = `Kies voor wie ${it.file.name} is.`; return; }
      const gross = parseMoney($('[data-f=gross]', sec).value), net = parseMoney($('[data-f=net]', sec).value);
      if (Number.isNaN(gross) || Number.isNaN(net)) { err.textContent = `Controleer de bedragen bij ${it.file.name}, bv. 1.234,56.`; return; }
      plan.push({ it, i, gross, net, take: $$('[data-take]:checked', sec).map(x => x.dataset.take) });
    }
    save.disabled = true; save.textContent = 'Bezig…';
    let done = 0;
    try {
      for (const { it, i, gross, net, take } of plan) {
        const up = await rpc('mgr_upload_payslip', { p_staff_id: it.staffId, p_month: it.month, p_file_name: it.file.name, p_content_type: fileType(it.file), p_data: await readAsBase64(it.file) });
        if (gross != null || net != null) await rpc('mgr_set_payslip_amounts', { p_id: up.id, p_gross: gross, p_net: net });
        const prof = {};
        for (const k of take) if (SLIP_FIELDS.find(f => f[0] === k)[2] === 'profile') prof[k] = it.info[k];
        if (Object.keys(prof).length) await rpc('mgr_save_profile', { p_id: it.staffId, p_profile: prof });
        const pp = it.person.person;
        if (take.includes('payroll_id') || take.includes('contract_type')) {
          await rpc('mgr_save_staff_payroll', { p_id: it.staffId, p_contract_type: take.includes('contract_type') ? it.info.contract_type : pp.contract_type, p_payroll_id: take.includes('payroll_id') ? it.info.payroll_id : (pp.payroll_id || '') });
        }
        if (take.includes('hourly_rate')) {
          await rpc('mgr_save_staff', { p_id: it.staffId, p_name: pp.name, p_pin: null, p_role: pp.role, p_hourly_rate: it.info.hourly_rate, p_active: pp.active });
        }
        it.done = true; done++;
        const sec = $(`.slip-item[data-i="${i}"]`, wrap);
        sec.classList.add('is-done');
        $('.slip-head', sec).insertAdjacentHTML('beforeend', '<span class="pill on">Opgeslagen</span>');
      }
    } catch (e) {
      err.textContent = `${done ? `${plural(done, 'loonfiche', 'loonfiches')} opgeslagen, daarna ging het mis: ` : ''}${e.message}`;
      save.disabled = false; save.textContent = 'Opnieuw proberen';
      return;
    }
    modal.close();
    const names = [...new Set(items.map(x => x.person.person.name))];
    toast(`${plural(items.length, 'loonfiche', 'loonfiches')} opgeslagen voor ${names.join(', ')}.`);
    await loadStaff(true);
    renderView();
  });
}

boot();
