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

// Dutch or Chinese: the sign-in screen, the family pages and everything staff
// see; manager screens are Dutch. Kept on the phone and, for staff, on the server.
const LANG_KEY = 'prikklok.lang';
const lang = () => store.get(LANG_KEY) === 'zh' ? 'zh' : 'nl';
const L = (nl, zh) => lang() === 'zh' ? zh : nl;
const langAttr = () => lang() === 'zh' ? 'zh-Hans' : 'nl-BE';

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
  'Fill in your Officient address, like yourcompany.officient.io.': 'Vul je Officient-adres in, bv. jouwzaak.officient.io.',
  'Grace period must be between 0 and 120 minutes.': 'De speling moet tussen 0 en 120 minuten liggen.',
  'Number of people must be between 1 and 20.': 'Het aantal personen moet tussen 1 en 20 liggen.',
  'Officient gave no lasting access. Connect again.': 'Officient gaf geen blijvende toegang. Koppel opnieuw.',
  'Officient is already being read. Try again in a few minutes.': 'De app haalt al gegevens op bij Officient. Probeer het over enkele minuten opnieuw.',
  'Officient is busy. Try again later.': 'Officient is druk bezet. Probeer het later opnieuw.',
  "Officient isn't connected yet.": 'Officient is nog niet gekoppeld.',
  'Officient refused the connection. Connect again under Team.': 'Officient weigerde de koppeling. Koppel opnieuw bij Team.',
  'Officient gives no access to the calendar yet. Add calendar:read and calendar:write to the Prikklok app in Officient, then connect again.':
    'Officient geeft nog geen toegang tot de kalender. Voeg calendar:read en calendar:write toe aan de Prikklok-app in Officient (avatar → Developers) en klik dan bij Team → Exact Officient op Opnieuw koppelen.',
  'Officient sent no code back. Connect again.': 'Officient stuurde geen code terug. Koppel opnieuw.',
  "One entry can't be longer than 24 hours.": 'Eén registratie mag niet langer dan 24 uur zijn.',
  'Only managers can do that.': 'Alleen een verantwoordelijke kan dat doen.',
  'PIN must be 4 to 8 digits.': 'De pincode moet 4 tot 8 cijfers hebben.',
  'People needed must be between 1 and 20.': 'Het aantal personen moet tussen 1 en 20 liggen.',
  'Pick a date range up to a year long.': 'Kies een periode van maximaal een jaar.',
  'Pick a month.': 'Kies een maand.',
  'Pick who to send.': 'Duid aan voor wie je de uren stuurt.',
  'Pick a contract.': 'Kies een contract.',
  'Officient gives no access to change people yet. Add personal.info:write and basics:write to the Prikklok app in Officient, then connect again.': 'Officient laat de app nog geen mensen aanpassen. Voeg personal.info:write en basics:write toe aan de Prikklok-app in Officient en koppel opnieuw.',
  'This person is already in Officient.': 'Deze persoon staat al in Officient.',
  'Officient no longer has this person.': 'Officient heeft deze persoon niet meer.',
  'Officient did not add the person.': 'Officient voegde de persoon niet toe.',
  'Someone else in the app is linked with that person in Officient.': 'Iemand anders in de app is al gekoppeld met die persoon in Officient.',
  'Pick a shorter period.': 'Kies een kortere periode.',
  "This person isn't linked with Officient yet.": 'Deze persoon is nog niet gekoppeld met Officient. Haal de gegevens op bij Team → Exact Officient.',
  'Officient gives no access to contracts yet. Add contracts.write to the Prikklok app in Officient, then connect again.': 'Officient geeft nog geen toegang tot de contracten. Voeg contracts.write toe aan de Prikklok-app in Officient en koppel opnieuw.',
  'Officient did not take the contract.': 'Officient nam het contract niet aan.',
  'Officient has no absence type "Gewettigde Afwezigheid" (Securex code GA) this year.': 'Officient heeft dit jaar geen afwezigheid "Gewettigde Afwezigheid" (Securex-code GA). Kijk de soorten na in Officient.',
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
  'Drivers clock in at the restaurant, with their location.': 'Als chauffeur klok je in aan het restaurant, met je locatie.',
  'Drivers clock out at the restaurant, with their location.': 'Als chauffeur klok je uit aan het restaurant, met je locatie.',
  "The restaurant's location isn't set yet. Ask your manager.": 'De plaats van het restaurant is nog niet ingesteld. Vraag het aan je verantwoordelijke.',
  'Your location is needed to clock in or out. Allow it and try again.': 'Je locatie is nodig om in of uit te klokken. Sta ze toe en probeer opnieuw.',
  'Only drivers can do that.': 'Dat kan alleen een chauffeur.',
  'MATO Info is not linked.': 'MATO Info is nog niet gekoppeld.',
  'MATO Info sent something unexpected.': 'MATO Info stuurde iets onverwachts. Probeer het later opnieuw.',
  'Not allowed.': 'Dat mag niet.',
  'Send at most 500 positions at a time.': 'Stuur maximaal 500 locaties tegelijk.',
  'Give the place a name.': 'Geef de plaats een naam.',
  'Pick where the place is.': 'Duid aan waar de plaats is.',
  'The zone around a place must be between 20 and 1000 metres.': 'De zone rond een plaats moet tussen 20 en 1000 meter zijn.',
  'That place no longer exists.': 'Die plaats bestaat niet meer.',
  'Pick where the restaurant is.': 'Duid aan waar het restaurant is.',
  'The zone around the restaurant must be between 25 and 2000 metres.': 'De zone rond het restaurant moet tussen 25 en 2000 meter zijn.',
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
  'Clocking in is off for you. Ask your manager.': 'Inklokken staat voor jou uit. Vraag het aan je verantwoordelijke.',
  'Pick a language.': 'Kies een taal.',
  'Pick who clocks in.': 'Duid aan wie inklokt.',
  'The XP a day must be between 0 and 500.': 'De XP per dag moet tussen 0 en 500 liggen.',
  'Pick a title from the list.': 'Kies een titel uit de lijst.',
  'Picking shifts is off for you for now. Ask your manager.': 'Shiften opnemen staat voorlopig uit voor jou. Vraag het aan je verantwoordelijke.',
  'Check the phone number.': 'Controleer het telefoonnummer.',
};
// What staff can run into, for who uses the app in Chinese.
const SERVER_ZH = {
  'Add a short reason so your manager knows what happened.': '请写个简短的原因，让负责人知道发生了什么。',
  'Check-out must be after check-in.': '下班时间必须在上班时间之后。',
  'Enter a check-in time.': '请填写上班时间。',
  'Enter a check-out time.': '请填写下班时间。',
  "One entry can't be longer than 24 hours.": '一条记录不能超过 24 小时。',
  'PIN must be 4 to 8 digits.': '密码必须是 4 到 8 位数字。',
  'Say briefly why you give this shift back.': '请简单说说为什么退回这个班次。',
  'Someone else already picked up this shift.': '别人已经认领了这个班次。',
  "That file couldn't be read. Try again.": '文件无法读取，请重试。',
  "That isn't one of your shifts.": '这不是你的班次。',
  "That name and PIN don't match.": '名字或密码不对。',
  "That payslip isn't available.": '这张工资单不可用。',
  'That shift no longer exists.': '这个班次已经不存在了。',
  'That time entry no longer exists.': '这条工时记录已经不存在了。',
  'That time entry was removed.': '这条工时记录已被删除。',
  "That time entry wasn't found.": '找不到这条工时记录。',
  'This overlaps a shift you already have.': '这和你已有的班次时间重叠。',
  'This request was already handled.': '这个申请已经处理过了。',
  'This shift is already over.': '这个班次已经结束了。',
  "Times can't be in the future.": '时间不能在将来。',
  "You're already checked in.": '你已经上班打卡了。',
  "You're not checked in.": '你还没有上班打卡。',
  'Your sign-in has expired. Please sign in again.': '登录已过期，请重新登录。',
  "You're not on the schedule right now. Pick up a shift first, or ask your manager.": '你现在没有排班。先认领一个班次，或者问负责人。',
  "These details couldn't be saved.": '这些信息无法保存。',
  'Check the email address.': '请检查电子邮件地址。',
  'Check the national register number (11 digits).': '请检查国民编号（11 位数字）。',
  'Check the IBAN account number.': '请检查银行账号（IBAN）。',
  'Check the dates.': '请检查日期。',
  'Check the date of birth.': '请检查出生日期。',
  "That avatar couldn't be saved.": '头像无法保存。',
  "Your current PIN isn't right.": '当前密码不对。',
  "That contract isn't available.": '这份合同不可用。',
  'This account can only look at the overview.': '这个账号只能查看概览。',
  'Not allowed.': '不允许这样做。',
  'Clocking in is off for you. Ask your manager.': '你不需要打卡。有问题请问负责人。',
  'Pick a language.': '请选择语言。',
  'Pick a title from the list.': '请从列表里选一个称号。',
  'Picking shifts is off for you for now. Ask your manager.': '你暂时不能认领班次。请问负责人。',
  "That person wasn't found.": '找不到这个人。',
};
const SERVER_ZH_PATTERNS = [
  [/^Shifts can't be dropped less than (\d+) hours before they start\. Ask your manager\.$/, '离开始不到 $1 小时的班次不能退回。请问负责人。'],
  [/^Too many wrong PINs\. Try again in (\d+) min, or ask your manager to reset your PIN\.$/, '密码错误次数太多。请 $1 分钟后再试，或请负责人重设密码。'],
  [/^Your shift starts at (\d\d:\d\d)\. You can check in from (\d\d:\d\d)\.$/, '你的班次 $1 开始，$2 起可以打卡。'],
  [/^That item unlocks at level (\d+)\.$/, '这个物品 $1 级才解锁。'],
  [/^That title unlocks at level (\d+)\.$/, '这个称号 $1 级才解锁。'],
];
const SERVER_NL_PATTERNS = [
  [/^(.+) already has a shift that overlaps one of these\.$/, '$1 heeft al een shift die met een van deze overlapt.'],
  [/^(.+) already has a shift that overlaps\.$/, '$1 heeft op dat moment al een shift.'],
  [/^Shifts can't be dropped less than (\d+) hours before they start\. Ask your manager\.$/, 'Je kan een shift niet meer teruggeven minder dan $1 uur voor het begin. Vraag het aan je verantwoordelijke.'],
  [/^Too many wrong PINs\. Try again in (\d+) min, or ask your manager to reset your PIN\.$/, 'Te vaak een verkeerde pincode. Probeer opnieuw over $1 min, of vraag je verantwoordelijke om een nieuwe pincode.'],
  [/^Your shift starts at (\d\d:\d\d)\. You can check in from (\d\d:\d\d)\.$/, 'Je shift begint om $1. Je kan inklokken vanaf $2.'],
  [/^That item unlocks at level (\d+)\.$/, 'Dat krijg je pas vanaf level $1.'],
  [/^That title unlocks at level (\d+)\.$/, 'Die titel krijg je pas vanaf level $1.'],
  [/^Officient answered (\d+)( for .*)?\.$/, 'Officient gaf een fout ($1). Probeer het later opnieuw.'],
  [/^MATO Info answered (\d+)(: .*)?\.$/, 'MATO Info gaf een fout ($1). Probeer het later opnieuw.'],
  [/^You're (\d+) m from the restaurant\. Clock in and out at the restaurant\.$/, (_, m) => `Je bent ${metres(+m)} van het restaurant. In- en uitklokken kan alleen aan het restaurant.`],
];
function tr(msg) {
  if (!msg) return msg;
  if (zhUI()) {
    if (SERVER_ZH[msg]) return SERVER_ZH[msg];
    for (const [re, zh] of SERVER_ZH_PATTERNS) if (re.test(msg)) return msg.replace(re, zh);
  }
  if (SERVER_NL[msg]) return SERVER_NL[msg];
  for (const [re, nl] of SERVER_NL_PATTERNS) if (re.test(msg)) return msg.replace(re, nl);
  return msg;
}

/* ----------------------------------------------------------------- api */

class AppError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

async function rpc(fn, args = {}, { auth = true, path = `/rest/v1/rpc/${fn}`, keepalive = false } = {}) {
  const body = auth ? { p_token: S.token, ...args } : args;
  const headers = { 'Content-Type': 'application/json', apikey: CFG.key };
  if (CFG.key.startsWith('ey')) headers.Authorization = 'Bearer ' + CFG.key;
  let res;
  try {
    res = await fetch(`${CFG.url}${path}`, { method: 'POST', headers, body: JSON.stringify(body), keepalive });
  } catch {
    throw new AppError(T('Kan de server niet bereiken. Controleer je verbinding en probeer opnieuw.', '连不上服务器。请检查网络后重试。'), 'network');
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) {
    if (data && data.code === '28000') {
      signOut({ silent: true });
      throw new AppError(tr(data.message), 'auth');
    }
    throw new AppError(tr(data && data.message) || T(`Er ging iets mis (fout ${res.status}).`, `出错了（错误 ${res.status}）。`));
  }
  return data;
}

async function refreshMe() {
  const r = await rpc('get_me');
  S.me = r.me;
  S.settings = r.settings;
  if (S.me.lang && S.me.lang !== lang()) {
    store.set(LANG_KEY, S.me.lang);
    if ($('#view')) setTimeout(renderShell); // set by the manager meanwhile
  }
  S.openEntry = r.open_entry;
  S.nextShifts = r.next_shifts || [];
  S.pending = r.pending_requests || 0;
  S.offset = new Date(r.server_time).getTime() - Date.now();
  updateBadges();
  checkLevelUp();
  syncTracker();
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
const dayLabel = d => d.toLocaleDateString(loc(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
function dateField(id, selected, from, to) {
  const sel = toDateInput(selected), opts = [];
  for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) opts.push(d);
  if (!opts.some(d => toDateInput(d) === sel)) opts.push(startOfDay(selected));
  opts.sort((a, b) => a - b);
  return `<select id="${id}">${opts.map(d => `<option value="${toDateInput(d)}" ${toDateInput(d) === sel ? 'selected' : ''}>${dayLabel(d)}</option>`).join('')}</select>`;
}
function timeField(id, value, { required = true } = {}) {
  return `<input id="${id}" class="time-field" inputmode="numeric" maxlength="5" autocomplete="off" spellcheck="false" placeholder="${T('uu:mm', '时:分')}" value="${value || ''}" ${required ? 'required' : ''}>`;
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

const num = (n, digits) => Number(n).toLocaleString(loc(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmt = {
  time: d => new Date(d).toLocaleTimeString(LOCALE, HM),
  clock: d => new Date(d).toLocaleTimeString(LOCALE, HM),
  day: d => new Date(d).toLocaleDateString(loc(), { weekday: 'short', day: 'numeric', month: 'short' }),
  dayLong: d => new Date(d).toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' }),
  month: d => new Date(d).toLocaleDateString(loc(), { month: 'long', year: 'numeric' }),
  monthName: d => new Date(d).toLocaleDateString(loc(), { month: 'long' }),
  short: d => new Date(d).toLocaleDateString(loc(), { day: 'numeric', month: 'short' }),
  range: (a, b) => `${fmt.time(a)} – ${fmt.time(b)}`,
  when(d) {
    const x = new Date(d), today = now();
    if (sameDay(x, today)) return `${T('vandaag', '今天')} ${fmt.time(x)}`;
    if (sameDay(x, addDays(today, 1))) return `${T('morgen', '明天')} ${fmt.time(x)}`;
    if (sameDay(x, addDays(today, -1))) return `${T('gisteren', '昨天')} ${fmt.time(x)}`;
    return `${fmt.day(x)} ${fmt.time(x)}`;
  },
  dur(mins) {
    const t = Math.max(0, Math.round(mins));
    const h = Math.floor(t / 60), m = t % 60;
    if (zhUI()) return h ? `${h}小时${m ? `${m}分` : ''}` : `${m}分钟`;
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
const isDriver = () => S.me && S.me.role === 'driver';
// Who clocks in: students and drivers (Team → Instellingen); the rest earn XP a
// day. Someone still clocked in keeps the clock until they clock out.
const canClock = () => !!(S.me && (S.me.can_clock || S.openEntry));
// The manager can hide the schedule from someone for now (Team → person).
const seesShifts = () => !S.me || S.me.shifts !== false;
// Staff screens follow the person's language (Profiel → Taal, or 中文 on the
// sign-in screen); manager and driver screens stay Dutch.
const zhUI = () => lang() === 'zh' && !isManager() && !isDriver();
const T = (nl, zh) => zhUI() ? zh : nl;
const loc = () => zhUI() ? 'zh-CN' : LOCALE;

/* ------------------------------------------------ people, avatars, levels */

// A person's picture for lists: their avatar's head, or their initials.
function personPic(p, cls = '') {
  return p && p.avatar
    ? `<span class="avatar pic ${cls}" aria-hidden="true">${Avatar.head(p.avatar)}</span>`
    : `<span class="avatar ${cls}" aria-hidden="true">${esc(initials(p && p.name))}</span>`;
}
const picFor = (id, name, cls = '') => personPic((S.staff || []).find(p => p.id === id) || { name }, cls);

// Level L needs 12.5 * (L - 1) * (L + 2) XP (5225 for level 20, 8100 for 25), the same formula as the database.
// Work and bonus go up to 20; 21 to 25 are for the founders (bonus XP), 25 is Grondlegger.
const LEVEL_TITLES = ['Nieuwkomer', 'Starter', 'Teamspeler', 'Vaste waarde', 'Doorzetter', 'Ster', 'Topper', 'Kampioen', 'Held', 'Legende',
  'Meester', 'Grootmeester', 'Kanjer', 'Tijger', 'Kraanvogel', 'Feniks', 'Draak', 'Keizer', 'Jade', 'Gouden draak',
  'Jadedraak', 'Hemelse draak', 'Drakenkoning', 'Onsterfelijke', 'Grondlegger'];
const xpForLevel = l => 12.5 * (l - 1) * (l + 2);
const LEVEL_TITLES_ZH = ['新人', '新手', '团队成员', '中坚力量', '坚持者', '明星', '高手', '冠军', '英雄', '传奇',
  '大师', '宗师', '能手', '猛虎', '仙鹤', '凤凰', '神龙', '皇帝', '翡翠', '金龙',
  '玉龙', '天龙', '龙王', '仙人', '创始人'];
const levelTitle = l => (zhUI() ? LEVEL_TITLES_ZH : LEVEL_TITLES)[Math.min(l, LEVEL_TITLES.length) - 1];
const levelPill = xp => `<span class="pill lvl">${T('Level', '等级')} ${xp ? xp.level : 1}</span>`;
const TOP_LEVEL = LEVEL_TITLES.length; // 25: the founders' level
function xpBar(xp) {
  const l = xp.level, a = xpForLevel(l), b = xpForLevel(l + 1);
  if (l >= TOP_LEVEL) return `<div class="xpbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100" aria-label="${T('Hoogste level', '最高等级')}"><span style="width:100%"></span></div>
    <p class="xp-text"><span class="mono">${xp.xp} XP</span><span class="muted">${T('Hoogste level', '最高等级')}</span></p>`;
  const pct = Math.max(0, Math.min(100, Math.round((xp.xp - a) / (b - a) * 100)));
  return `<div class="xpbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${T(`Op weg naar level ${l + 1}`, `距离 ${l + 1} 级`)}"><span style="width:${pct}%"></span></div>
    <p class="xp-text"><span class="mono">${xp.xp} XP</span><span class="muted">${T(`nog ${b - xp.xp} XP tot level ${l + 1}`, `还差 ${b - xp.xp} XP 升到 ${l + 1} 级`)}</span></p>`;
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
  for (let l = up.from + 1; l <= up.to; l++) rewards.push(...Avatar.rewardsAt(l, zhUI() ? 'zh' : 'nl'));
  const d = modal.open(`
    <div class="levelup">
      <div class="levelup-pic">${S.me.avatar ? Avatar.render(S.me.avatar, { view: 'bust' }) : `<span class="levelup-num">${up.to}</span>`}</div>
      <p class="section-label">${T('Level omhoog', '升级了')}</p>
      <h2 id="modal-title">${T('Level', '等级')} ${up.to} · ${esc(levelTitle(up.to))}</h2>
      <p>${T(`Goed bezig, ${esc(S.me.name.split(' ')[0])}!`, `做得好，${esc(S.me.name.split(' ')[0])}！`)} ${rewards.length > 4 ? T(`Je hebt <strong>${rewards.length} nieuwe dingen</strong> voor je avatar vrijgespeeld.`, `你为头像解锁了 <strong>${rewards.length} 样新东西</strong>。`)
        : rewards.length ? `${T('Nieuw voor je avatar:', '头像新物品：')} <strong>${rewards.map(esc).join(T(', ', '、'))}</strong>.` : T('Blijf zo doorgaan voor de volgende beloning.', '继续加油，下一个奖励在等你。')}</p>
    </div>
    <div class="form-actions"><button type="button" data-close>${T('Sluiten', '关闭')}</button>${rewards.length ? `<button type="button" class="primary" id="lu-avatar">${T('Avatar aanpassen', '修改头像')}</button>` : ''}</div>`);
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
  ['phone', 'Telefoon', { type: 'tel', max: 30, auto: 'tel', zh: '电话' }],
  ['email', 'E-mail', { type: 'email', max: 120, auto: 'email', zh: '电子邮件' }],
  ['birth_date', 'Geboortedatum', { date: true, auto: 'bday', zh: '出生日期' }],
  ['national_id', 'Rijksregisternummer', { max: 15, ph: '00.00.00-000.00', mono: true, mode: 'numeric', help: 'Staat op de achterkant van je identiteitskaart.',
    zh: '国民编号（Rijksregisternummer）', zhHelp: '在你身份证的背面。' }],
  ['street', 'Straat en huisnummer', { max: 120, auto: 'address-line1', wide: true, zh: '街道和门牌号' }],
  ['postcode', 'Postcode', { max: 10, auto: 'postal-code', mode: 'numeric', zh: '邮编' }],
  ['city', 'Gemeente', { max: 80, auto: 'address-level2', zh: '城市' }],
  ['iban', 'Rekeningnummer (IBAN)', { max: 42, ph: 'BE00 0000 0000 0000', mono: true, wide: true, help: 'Hierop krijg je je loon.',
    zh: '银行账号（IBAN）', zhHelp: '工资会打到这个账户。' }],
  ['emergency_name', 'Noodcontact: naam', { max: 80, zh: '紧急联系人：姓名' }],
  ['emergency_phone', 'Noodcontact: telefoon', { type: 'tel', max: 30, zh: '紧急联系人：电话' }],
];
const FIELD_LABEL = Object.fromEntries(PROFILE_FIELDS.map(([k, l]) => [k, l]));
const showValue = (k, v) => k === 'national_id' ? fmtNid(v) : k === 'iban' ? fmtIban(v) : /date/.test(k) ? isoToDMY(v) : (v ?? '');

function profileFields(prefix, pr) {
  return PROFILE_FIELDS.map(([k, label, o]) => `
    <div class="field${o.wide ? ' wide' : ''}"><label for="${prefix}-${k}">${T(label, o.zh || label)}</label>
      <input id="${prefix}-${k}" data-k="${k}" ${o.type ? `type="${o.type}"` : ''} maxlength="${o.max || 10}" ${o.auto ? `autocomplete="${o.auto}"` : 'autocomplete="off"'}
        ${o.mode ? `inputmode="${o.mode}"` : ''} ${o.date ? `inputmode="numeric" placeholder="${T('dd/mm/jjjj', '日/月/年')}"` : o.ph ? `placeholder="${o.ph}"` : ''} class="${o.mono ? 'mono-field' : ''}"
        value="${esc(showValue(k, pr[k]))}">${o.help ? `<span class="help">${T(o.help, o.zhHelp || o.help)}</span>` : ''}</div>`).join('');
}
// Reads the fields back; returns { values } or { error }.
function readProfile(root) {
  const out = {};
  for (const inp of $$('input[data-k]', root)) {
    const k = inp.dataset.k, v = inp.value.trim();
    if (k === 'birth_date' || k === 'start_date') {
      const iso = parseDMY(v);
      if (iso == null) return { error: T(`Vul de ${k === 'birth_date' ? 'geboortedatum' : 'datum van indiensttreding'} in als dd/mm/jjjj, bv. 30/07/1999.`, `请按 日/月/年 填写${k === 'birth_date' ? '出生日期' : '入职日期'}，例如 30/07/1999。`), field: inp };
      out[k] = iso;
    } else if (k === 'national_id') {
      const d = cleanNid(v);
      if (d && !Loonfiche.validNationalId(d)) return { error: T('Dat rijksregisternummer klopt niet. Het heeft 11 cijfers, bv. 85.07.30-033.28.', '国民编号不对。它有 11 位数字，例如 85.07.30-033.28。'), field: inp };
      out[k] = d;
    } else if (k === 'iban') {
      const d = cleanIban(v);
      if (d && !Loonfiche.validIban(d)) return { error: T('Dat rekeningnummer klopt niet. Controleer de IBAN, bv. BE68 5390 0754 7034.', '银行账号不对。请检查 IBAN，例如 BE68 5390 0754 7034。'), field: inp };
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
  if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = T('Bezig…', '请稍候…'); }
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
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  route: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  signout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
};

/* --------------------------------------------------------------- theme */

// Light is the default. theme.js sets it before the page draws; this keeps
// it in step when someone changes it, and follows the phone in "auto".
const THEME_KEY = 'prikklok.theme';
const THEMES = [['light', 'Licht', '浅色'], ['dark', 'Donker', '深色'], ['auto', 'Zoals mijn toestel', '跟随手机']];
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
    b.setAttribute('aria-label', dark ? T('Licht thema', '浅色主题') : T('Donker thema', '深色主题'));
    b.title = dark ? T('Licht thema', '浅色主题') : T('Donker thema', '深色主题');
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
  if (isDriver()) return [['clock', 'Klok'], ['hours', 'Mijn uren'], ['profile', 'Profiel']];
  if (isManager()) return [['today', 'Vandaag'], ['schedule', 'Planning'], ['monthly', 'Overzicht'], ['requests', 'Aanvragen'],
    ...(S.settings.has_drivers ? [['routes', 'Ritten']] : []), ['team', 'Team'], ['ranking', 'Ranglijst'], ['profile', 'Profiel']];
  // Who doesn't clock in gets a start page instead of the clock.
  return [['clock', canClock() ? T('Klok', '打卡') : T('Start', '首页')], ...(seesShifts() ? [['shifts', T('Shiften', '班次')]] : []),
    ['hours', T('Mijn uren', '我的工时')], ['ranking', T('Ranglijst', '排行榜')], ['profile', T('Profiel', '我的资料')]];
}
const ICON_FOR = { home: 'home', clock: 'clock', shifts: 'shifts', hours: 'hours', profile: 'profile', ranking: 'ranking', today: 'today', schedule: 'shifts', monthly: 'monthly', requests: 'requests', team: 'team', routes: 'route' };

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
  confirm({ title, body = '', ok = T('Bevestigen', '确定'), cancel = T('Annuleren', '取消'), danger = false }) {
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

/* ------------------------------------------------- colleagues and titles */

// Funny titles people pick for their card (Profiel → Titel kiezen); some need
// a level. Same keys and levels as app_private.fun_title_level.
const TITLES = [
  ['dumpling', 'Dumplingbaas', '饺子大王', 1], ['wok', 'Wokmeester', '炒锅大师', 1], ['rice', 'Rijstridder', '米饭骑士', 1],
  ['tea', 'Theemeester', '茶艺大师', 1], ['fortune', 'Gelukskoekje', '幸运饼干', 1], ['panda', 'Panda van de zaak', '店里的熊猫', 1],
  ['spicy', 'Pittig pepertje', '小辣椒', 1], ['clown', 'Hofnar', '开心果', 1], ['owl', 'Nachtuil', '夜猫子', 1],
  ['bird', 'Vroege vogel', '早起的鸟儿', 1], ['smile', 'Glimlach van de zaal', '大堂微笑担当', 1],
  ['noodle', 'Noedelnerd', '面条达人', 2], ['dishes', 'Afwaskampioen', '洗碗冠军', 2],
  ['karaoke', 'Karaokester', '卡拉OK之星', 3], ['speed', 'Snelste bord van Torhout', '托尔豪特上菜最快', 3],
  ['chopsticks', 'Stokjesninja', '筷子忍者', 4], ['springroll', 'Loempialegende', '春卷传奇', 5],
  ['boss', 'Baas van de bar', '吧台老大', 6], ['zen', 'Zen tijdens de rush', '高峰期淡定大师', 8],
  ['dragon', 'Drakenhart', '龙之心', 10], ['emperor', 'Keizer van de keuken', '厨房皇帝', 15], ['legend', 'Levende legende', '活传奇', 20],
];
const TITLE_BY = Object.fromEntries(TITLES.map(t => [t[0], t]));
// The title on someone's card: theirs, the manager's own words, or one the app picks for them.
function funTitle(p) {
  const t = p && p.title;
  if (t) return TITLE_BY[t] ? T(TITLE_BY[t][1], TITLE_BY[t][2]) : t;
  const free = TITLES.filter(x => x[3] === 1);
  const n = [...String((p && p.id) || '')].reduce((a, c) => a + c.charCodeAt(0), 0);
  return T(free[n % free.length][1], free[n % free.length][2]);
}
// "2 jaar en 1 maand" since a date
function sinceText(iso) {
  const d = new Date(iso + 'T00:00'), t = now();
  const m = Math.max(0, (t.getFullYear() - d.getFullYear()) * 12 + t.getMonth() - d.getMonth() - (t.getDate() < d.getDate() ? 1 : 0));
  const y = Math.floor(m / 12), r = m % 12;
  if (!m) return T('net begonnen', '刚加入');
  return zhUI() ? `${y ? `${y}年` : ''}${r ? `${r}个月` : ''}`
    : [y && `${y} jaar`, r && plural(r, 'maand', 'maanden')].filter(Boolean).join(' en ');
}

// A colleague's card: their picture, title, level and since when they work
// here. Opens from the ranking, the calendar and a day's shifts.
async function mateCard(id) {
  let p;
  try { p = await rpc('colleague', { p_id: id }); } catch (e) { if (e.code !== 'auth') toast(e.message, 'error'); return; }
  const role = { manager: T('Verantwoordelijke', '负责人'), driver: T('Chauffeur', '司机'), viewer: T('Familie', '家人') }[p.role];
  const d = modal.open(`
    <div class="mate">
      <div class="mate-pic">${p.avatar ? Avatar.render(p.avatar, { title: p.name }) : `<span class="hero-empty">${Avatar.render(Avatar.DEFAULT)}</span>`}</div>
      <div class="mate-main">
        <p class="mate-title">“${esc(funTitle(p))}”</p>
        <h2 id="modal-title">${esc(p.name)}${p.me ? ` <span class="pill accent">${T('jij', '你')}</span>` : ''}</h2>
        <p class="lvl-line">${levelPill(p)} <span>${esc(levelTitle(p.level))}</span></p>
        ${xpBar({ xp: p.xp, level: p.level })}
        <dl class="kv">
          <dt>${p.since_app ? T('In de app sinds', '开始用 app') : T(`Bij ${esc(S.settings.business_name)} sinds`, `加入 ${esc(S.settings.business_name)}`)}</dt>
          <dd>${fmtDate(p.since)} <span class="muted">· ${sinceText(p.since)}</span></dd>
          ${role ? `<dt>${T('Rol', '角色')}</dt><dd>${role}</dd>` : ''}
        </dl>
      </div>
    </div>
    <div class="form-actions">${p.me ? `<button type="button" id="mate-title">${T('Titel kiezen', '选择称号')}</button>` : ''}${isManager() && !p.me
      ? '<button type="button" id="mate-team">Openen bij Team</button>' : ''}<button type="button" class="primary" data-close>${T('Sluiten', '关闭')}</button></div>`, null, { sheet: true });
  const team = $('#mate-team', d);
  if (team) team.addEventListener('click', () => { modal.close(); location.hash = `team/${p.id}`; });
  const ti = $('#mate-title', d);
  if (ti) ti.addEventListener('click', () => titlePicker(p.title, p.level, () => { if (S.view === 'profile' || S.view === 'ranking') renderView(); }));
}
function bindMates(el) {
  $$('[data-mate]', el).forEach(r => {
    r.addEventListener('click', () => mateCard(r.dataset.mate));
    r.addEventListener('keydown', e => { if (e.target === r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); mateCard(r.dataset.mate); } });
  });
}

function titlePicker(current, level, after) {
  const d = modal.open(`
    <h2 id="modal-title">${T('Kies je titel', '选择你的称号')}</h2>
    <p>${T('Je collega\'s zien hem op je kaart. Sommige titels krijg je pas op een hoger level.', '同事会在你的名片上看到它。有些称号升级后才能用。')}</p>
    <div class="title-grid">${TITLES.map(([k, nl, zh, l]) => {
      const lock = l > level;
      return `<button type="button" class="title-pick${current === k ? ' is-on' : ''}" data-title="${k}" aria-pressed="${current === k}" ${lock ? 'disabled' : ''}>
        <span>${esc(T(nl, zh))}</span>${lock ? `<span class="av-lock">${LOCK_ICON}${T('Level', '等级')} ${l}</span>` : ''}</button>`;
    }).join('')}</div>
    <p class="form-error" id="tp-err"></p>
    <div class="form-actions">${current ? `<button type="button" id="title-clear">${T('Laat de app kiezen', '让 app 来选')}</button>` : ''}<button type="button" data-close>${T('Annuleren', '取消')}</button></div>`, null, { sheet: true });
  const save = (key, b) => busy(b, async () => {
    await rpc('save_my_title', { p_key: key });
    modal.close();
    toast(T('Je titel is opgeslagen.', '称号已保存。'));
    if (after) after();
  }).catch(e => { $('#tp-err', d).textContent = e.message; });
  $$('[data-title]', d).forEach(b => b.addEventListener('click', () => save(b.dataset.title, b)));
  const c = $('#title-clear', d);
  if (c) c.addEventListener('click', () => save(null, c));
}

/* ------------------------------------------------- open shift reminder */

// Who picks shifts (not fixed workers, drivers or managers) hears about open
// shifts when they open the app: right away when a colleague gave a shift
// back, otherwise once a day while shifts are still open this month (and next
// month from the 20th on). Off per device at Profiel → Herinneringen.
const REMIND_OFF = 'prikklok.remind.off';
async function maybeShiftReminder() {
  if (!S.me || !S.me.picks || store.get(REMIND_OFF) || $('#modal').open || Date.now() - (S.alertsAt || 0) < 5 * 60000) return;
  S.alertsAt = Date.now();
  let r;
  try { r = await rpc('shift_alerts'); } catch { return; }
  if (!S.me || $('#modal').open || !r.open.length) return;
  const key = `prikklok.remind.${S.me.id}`, today = toDateInput(now());
  let seen;
  try { seen = JSON.parse(store.get(key) || '{}'); } catch { seen = {}; }
  const back = r.open.filter(s => s.released).map(s => s.id);
  const fresh = back.filter(id => !(seen.back || []).includes(id));
  if (!fresh.length && seen.day === today) return;
  store.set(key, JSON.stringify({ day: today, back }));
  shiftReminder(r.open, fresh.length > 0);
}

function shiftReminder(list, urgent) {
  const back = list.filter(s => s.released);
  // the same shift with several open places is one row
  const slots = [];
  for (const s of list.filter(x => !x.released)) {
    const same = slots.find(o => o.starts_at === s.starts_at && o.ends_at === s.ends_at && o.label === s.label);
    if (same) same.count++; else slots.push({ ...s, count: 1 });
  }
  const soon = slots.slice(0, back.length ? 3 : 5);
  const months = new Map();
  for (const s of list) { const m = toDateInput(startOfMonth(new Date(s.starts_at))); months.set(m, (months.get(m) || 0) + 1); }
  const row = s => {
    const part = shiftPart(s);
    return `<div class="remind-row">
      <span class="cal-tag${partClass(part)}">${esc(partName(part))}</span>
      <div class="remind-when"><strong>${esc(fmt.dayLong(s.starts_at))}</strong><span class="time">${fmt.range(s.starts_at, s.ends_at)}${s.count > 1 ? ` <span class="muted">· ${T(`${s.count} plaatsen`, `${s.count} 个位置`)}</span>` : ''}</span>
        ${s.released ? `<span class="muted small">${T(`${esc(s.released.name)} gaf hem terug`, `${esc(s.released.name)} 退回了这个班次`)}</span>` : ''}</div>
      <button type="button" class="sm primary" data-take="${s.id}">${T('Opnemen', '认领')}</button>
    </div>`;
  };
  const d = modal.open(`
    <div class="remind-head"><span class="remind-icon" aria-hidden="true">${ICONS.shifts}</span>
      <div><h2 id="modal-title">${urgent ? T('Een collega gaf een shift terug', '有同事退回了班次') : T('Er zijn nog shiften vrij', '还有空班次')}</h2>
        <p class="muted small">${[...months].map(([m, n]) => T(`${plural(n, 'open shift', 'open shiften')} in ${fmt.monthName(new Date(m + 'T00:00'))}`,
          `${fmt.monthName(new Date(m + 'T00:00'))}有 ${n} 个空班次`)).join(' · ')}</p></div></div>
    ${back.length ? `<h3 class="remind-sub">${T('Teruggegeven en nog open', '退回的，还空着')}</h3><div class="remind-list">${back.map(row).join('')}</div>` : ''}
    ${soon.length ? `<h3 class="remind-sub">${T('De eerstvolgende open shiften', '最近的空班次')}</h3><div class="remind-list">${soon.map(row).join('')}</div>` : ''}
    <p class="muted small remind-tip">${T('Tik op Opnemen en dan op Zeker? om een shift op jouw naam te zetten.', '点“认领”，再点“确定？”，班次就是你的了。')}</p>
    <p class="form-error" id="rm-err"></p>
    <div class="form-actions"><button type="button" id="rm-cal">${T('Naar de kalender', '去看日历')}</button><button type="button" class="primary" data-close>${T('Later', '以后再说')}</button></div>`, null, { sheet: true });
  // a first tap asks "Zeker?", the second takes the shift
  $$('[data-take]', d).forEach(b => b.addEventListener('click', async () => {
    if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = T('Zeker?', '确定？'); return; }
    b.disabled = true; b.textContent = T('Bezig…', '请稍候…');
    try {
      await rpc('claim_shift', { p_shift_id: b.dataset.take });
      b.replaceWith(Object.assign(document.createElement('span'), { className: 'pill on', textContent: T('Van jou', '你的了') }));
      await refreshMe();
      if (['clock', 'shifts'].includes(S.view)) renderView();
    } catch (e) { $('#rm-err', d).textContent = e.message; b.disabled = false; b.textContent = T('Opnemen', '认领'); delete b.dataset.sure; }
  }));
  $('#rm-cal', d).addEventListener('click', () => { modal.close(); S.month = startOfMonth(now()); if (S.view === 'shifts') renderView(); else location.hash = 'shifts'; });
}

/* ------------------------------------------- on your phone: install guide */

// Prikklok sits on the home screen like an app (manifest.webmanifest). On a
// phone this guide opens by itself after signing in; again three days after
// "Later", never after "Staat er al op" or once opened from the home screen.
// Profiel, the sign-in screen and the family page open it any time.
const INSTALL_KEY = 'prikklok.install';
const device = (() => {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const app = (ua.match(/MicroMessenger|FBAN|FBAV|Instagram|Line\/|Snapchat|TikTok|musical_ly/) || [])[0];
  return {
    ios, android, phone: ios || android, samsung: /SamsungBrowser/.test(ua), iosOther: ios && /CriOS|FxiOS|EdgiOS/.test(ua),
    inApp: app ? ({ MicroMessenger: 'WeChat', FBAN: 'Facebook', FBAV: 'Facebook', 'Line/': 'LINE', musical_ly: 'TikTok' }[app] || app) : null,
  };
})();
const installed = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
let installPrompt = null; // Chrome on Android: its own install question, asked from the guide's button
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; });
window.addEventListener('appinstalled', () => { installPrompt = null; store.set(INSTALL_KEY, 'done'); });
if (installed()) store.set(INSTALL_KEY, 'done');

const IK = {
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M8 10H6v11h12V10h-2"/></svg>',
  add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/></svg>',
  dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
};
const ikey = (icon, label = '') => `<span class="ikey">${icon}${label ? `<span>${label}</span>` : ''}</span>`;

// The steps for one kind of phone.
function installSteps(kind) {
  if (kind === 'ios') return [
    device.iosOther
      ? T(`Tik rechts in de adresbalk op ${ikey(IK.share)} <strong>Deel</strong>.`, `点地址栏右边的 ${ikey(IK.share)} <strong>共享</strong>（Deel）。`)
      : T(`Tik onderaan in Safari op ${ikey(IK.share)} <strong>Deel</strong>. Zie je die knop niet, tik dan eerst op ${ikey(IK.more)}.`,
          `在 Safari 底部点 ${ikey(IK.share)} <strong>共享</strong>（Deel）。看不到这个按钮？先点 ${ikey(IK.more)}。`),
    T(`Scroll een beetje naar beneden en tik op ${ikey(IK.add, 'Zet op beginscherm')}.`, `往下滑一点，点 ${ikey(IK.add, '添加到主屏幕')}（Zet op beginscherm）。`),
    T('Tik rechtsboven op <strong>Voeg toe</strong>.', '点右上角的<strong>添加</strong>（Voeg toe）。'),
    T('Open Prikklok vanaf je beginscherm en meld je daar nog één keer aan.', '从主屏幕打开 Prikklok，再登录一次。'),
  ];
  if (device.samsung) return [
    T(`Tik onderaan op ${ikey(IK.menu)}.`, `点底部的 ${ikey(IK.menu)}。`),
    T('Tik op <strong>Pagina toevoegen aan</strong> en dan op <strong>Startscherm</strong>.', '点<strong>添加页面到</strong>，再点<strong>主屏幕</strong>。'),
    T('Tik op <strong>Toevoegen</strong>. Prikklok staat nu op je startscherm.', '点<strong>添加</strong>。Prikklok 就会出现在主屏幕上。'),
  ];
  return [
    T(`Tik in Chrome rechtsboven op ${ikey(IK.dots)}.`, `在 Chrome 右上角点 ${ikey(IK.dots)}。`),
    T('Tik op <strong>App installeren</strong> of <strong>Toevoegen aan startscherm</strong>.', '点<strong>安装应用</strong>或<strong>添加到主屏幕</strong>（App installeren / Toevoegen aan startscherm）。'),
    T('Tik op <strong>Installeren</strong>. Prikklok staat nu bij je apps.', '点<strong>安装</strong>（Installeren）。Prikklok 就会出现在你的应用里。'),
  ];
}

function installGuide({ auto = false } = {}) {
  let kind = device.android ? 'android' : 'ios';
  const app = device.inApp, browser = device.ios ? 'Safari' : 'Chrome';
  const link = location.origin + location.pathname;
  const d = modal.open(`
    <div class="install-head">
      <img class="install-icon" src="icon-180.png" alt="" width="60" height="60">
      <div><h2 id="modal-title">${T('Zet Prikklok op je telefoon', '把 Prikklok 添加到手机')}</h2>
        <p class="muted small">${T('Dan open je hem met één tik vanaf je beginscherm, zonder adresbalk, net als een gewone app.', '以后在主屏幕上点一下就能打开，没有地址栏，跟普通 app 一样。')}</p></div>
    </div>
    ${app ? `<div class="hint warn install-app">
      <p>${T(`Je opent Prikklok nu in <strong>${app}</strong>. Daar kan je hem niet op je telefoon zetten: open hem eerst in ${browser}.`,
        `你现在是在 <strong>${app}</strong> 里打开 Prikklok，这里没法添加到手机。请先用 ${browser} 打开。`)}</p>
      <ol class="install-steps">
        <li><span>${T(`Tik rechtsboven op ${ikey(IK.more)}.`, `点右上角的 ${ikey(IK.more)}。`)}</span></li>
        <li><span>${T(`Kies <strong>Openen in ${browser}</strong> of <strong>Openen in browser</strong>.`, `选<strong>在浏览器打开</strong>（或“在 ${browser} 中打开”）。`)}</span></li>
      </ol>
      <div class="copybox"><code>${esc(link)}</code><button type="button" class="sm" id="ig-copy">${T('Kopieer', '复制')}</button></div>
    </div>` : ''}
    <div class="chips install-pick" role="group" aria-label="${T('Mijn telefoon', '我的手机')}">
      <button type="button" class="chip" data-ig="ios">iPhone</button><button type="button" class="chip" data-ig="android">Android</button>
    </div>
    <div id="ig-body"></div>
    <div class="form-actions">${auto
      ? `<button type="button" id="ig-never">${T('Staat er al op', '已经添加了')}</button><button type="button" class="primary" data-close>${T('Later', '以后再说')}</button>`
      : `<button type="button" class="primary" data-close>${T('Sluiten', '关闭')}</button>`}</div>`, null, { sheet: true });
  const draw = () => {
    $$('[data-ig]', d).forEach(b => { b.classList.toggle('is-on', b.dataset.ig === kind); b.setAttribute('aria-pressed', b.dataset.ig === kind); });
    const oneTap = kind === 'android' && installPrompt && !app;
    $('#ig-body', d).innerHTML = `
      ${oneTap ? `<button type="button" class="primary big-install" id="ig-install">${IK.add}<span>${T('Zet op mijn telefoon', '添加到我的手机')}</span></button>
        <p class="muted small">${T('Of zelf, via het menu:', '或者自己从菜单添加：')}</p>` : ''}
      <ol class="install-steps">${installSteps(kind).map(x => `<li><span>${x}</span></li>`).join('')}</ol>`;
    const b = $('#ig-install', d);
    if (b) b.addEventListener('click', async () => {
      const p = installPrompt;
      installPrompt = null;
      p.prompt();
      const { outcome } = await p.userChoice;
      if (outcome === 'accepted') { store.set(INSTALL_KEY, 'done'); modal.close(); toast(T('Prikklok staat nu bij je apps.', 'Prikklok 已经添加到你的应用里。')); }
      else draw();
    });
  };
  $$('[data-ig]', d).forEach(b => b.addEventListener('click', () => { kind = b.dataset.ig; draw(); }));
  const never = $('#ig-never', d);
  if (never) never.addEventListener('click', () => { store.set(INSTALL_KEY, 'done'); modal.close(); });
  const copy = $('#ig-copy', d);
  if (copy) copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(link); toast(T('Adres gekopieerd. Plak het in je browser.', '地址已复制，粘贴到浏览器里打开。')); }
    catch { toast(link); }
  });
  draw();
}

// After a page is drawn: the guide, once, on a phone that doesn't have the app yet.
function maybeInstallGuide() {
  if (!device.phone || installed() || S.installAsked || S.installTimer || !S.me || $('#modal').open) return;
  const v = store.get(INSTALL_KEY);
  if (v === 'done' || (v && Date.now() < Number(v))) return;
  S.installTimer = setTimeout(() => {
    S.installTimer = null;
    if (!S.me || $('#modal').open || S.installAsked) return; // another overlay first; a next page asks again
    S.installAsked = true;
    store.set(INSTALL_KEY, String(Date.now() + 3 * 86400000)); // "Later": ask again in three days
    installGuide({ auto: true });
  }, 1500);
}
const installButton = (id, cls = '') => device.phone && !installed()
  ? `<button type="button" class="${cls}" id="${id}">${IK.add}<span>${T('Zet Prikklok op je telefoon', '把 Prikklok 添加到手机')}</span></button>` : '';

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
    ${installButton('login-install', 'install-link')}
    ${langSwitch()}`);

  bindLang($('#app'), () => showSignIn(message));
  const li = $('#login-install');
  if (li) li.addEventListener('click', () => installGuide());
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
  if (Tracker.entry != null) { Tracker.flush({ keepalive: true }); Tracker.stop(); }
  setToken(null);
  S.me = null; S.staff = null; S.alertsAt = 0;
  $('#toast').hidden = true;
  stopPolling();
  if (!silent && t) quiet(rpc('logout', { p_token: t }, { auth: false }));
  await showSignIn(silent ? L('Je bent afgemeld. Meld je opnieuw aan.', '你已退出登录，请重新登录。') : '');
}

// The logo from config.js, or the business name in text.
const logoHTML = cls => CFG.logo
  ? `<img class="${cls}" src="${esc(CFG.logo)}" alt="${esc(S.settings.business_name || 'Logo')}">`
  : `<span class="${cls} logo-text">${esc(S.settings.business_name)}</span>`;

async function askSignOut() {
  const t = isViewer() ? L : T;
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
    <h2 id="modal-title">${T('Meer', '更多')}</h2>
    <div class="sheet-list">
      ${more.map(([k, l]) => `<button type="button" class="sheet-item" data-sheet-tab="${k}">${ICONS[ICON_FOR[k]]}<span>${l}</span></button>`).join('')}
      <button type="button" class="sheet-item" id="sheet-signout">${ICONS.signout}<span>${T('Afmelden', '退出登录')}</span></button>
    </div>
    <div class="form-actions"><button type="button" data-close>${T('Sluiten', '关闭')}</button></div>`, null, { sheet: true });
  $$('[data-sheet-tab]', d).forEach(b => b.addEventListener('click', () => { modal.close(); location.hash = b.dataset.sheetTab; }));
  $('#sheet-signout', d).addEventListener('click', () => { modal.close(); askSignOut(); });
}

function renderShell() {
  if (isViewer()) return renderFamilyShell();
  const tabs = tabsFor(), { main, more } = bottomTabs();
  const badge = k => k === 'requests' ? '<span class="count" data-badge hidden></span>' : '';
  document.title = `${S.settings.business_name} · Prikklok`;
  document.documentElement.lang = zhUI() ? 'zh-Hans' : 'nl-BE';
  $('#app').innerHTML = `
    <header class="topbar">
      <div class="topbar-inner">
        <div class="brand">
          <button class="me-btn" id="me-btn" aria-label="${T('Mijn profiel', '我的资料')}" title="${T('Mijn profiel', '我的资料')}">${personPic(S.me, 'lg')}${S.me.avatar ? '' : '<span class="me-plus" aria-hidden="true">+</span>'}</button>
          <div class="brand-text">
            <div class="biz">${esc(S.me.name)}</div>
            <div class="who">${isManager() ? 'Verantwoordelijke' : isDriver() ? 'Chauffeur' : `${T('Level', '等级')} ${S.me.xp ? S.me.xp.level : 1} · ${esc(levelTitle(S.me.xp ? S.me.xp.level : 1))}`}</div>
          </div>
        </div>
        <a class="logo-link" href="#" aria-label="${esc(S.settings.business_name)}${T(', naar het begin', '，回到首页')}">${logoHTML('logo')}</a>
        <div class="topbar-end"><button type="button" class="icon ghost theme-btn" data-theme-btn></button><button class="ghost sm" id="signout">${T('Afmelden', '退出登录')}</button></div>
      </div>
      <nav class="tabs" aria-label="${T('Onderdelen', '页面')}"><div class="tabs-inner">
        ${tabs.map(([k, l]) => `<button class="tab" data-tab="${k}">${l}${badge(k)}</button>`).join('')}
      </div></nav>
    </header>
    <main class="view" id="view"></main>
    <nav class="bnav" aria-label="${T('Onderdelen', '页面')}">
      ${main.map(([k, l]) => `<button data-tab="${k}">${ICONS[k === 'clock' && !canClock() && !isManager() ? 'home' : ICON_FOR[k]]}<span>${l}</span>${badge(k)}</button>`).join('')}
      ${more.length ? `<button id="bnav-more" data-more="${more.map(t => t[0]).join(' ')}" aria-haspopup="dialog">${ICONS.more}<span>${T('Meer', '更多')}</span></button>` : ''}
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

// After a change that can add or remove a tab (the first driver: Ritten).
async function refreshTabs() {
  const before = tabsFor().map(t => t[0]).join();
  await refreshMe();
  if (tabsFor().map(t => t[0]).join() !== before) renderShell(); else renderView();
}

function updateBadges() {
  $$('[data-badge]').forEach(b => { b.hidden = !S.pending; b.textContent = S.pending; });
}

const VIEWS = {
  clock: (el, current) => isDriver() ? viewDriver(el, current) : viewClock(el, current), shifts: viewShifts, hours: viewHours, profile: viewProfile, ranking: viewRanking,
  today: viewToday, schedule: viewSchedule, monthly: viewMonthly, requests: viewRequests, team: viewTeam, member: viewMember,
  family: viewFamily, famstaff: viewFamilyStaff, contracts: viewContracts, routes: viewRoutes,
};

// #profile works for everyone (managers reach it through their picture);
// #team/<id> opens one team member for managers, #family and #famstaff show
// them what the family account sees.
/* --------------------------------------------------------- new versions */

// Phones keep the app open for days. When a new version is online, the app
// reloads itself at a quiet moment: back on the screen or on the next tab,
// never with a window open or while typing.
const Updates = {
  tag: null, pending: false, at: 0,
  async check() {
    if (this.pending || Date.now() - this.at < 60000) return;
    this.at = Date.now();
    try {
      const tags = await Promise.all(['app.js', 'avatar.js', 'styles.css'].map(f =>
        fetch(f, { method: 'HEAD', cache: 'no-store' }).then(r => r.ok ? r.headers.get('etag') || r.headers.get('last-modified') || '' : '')));
      if (tags.some(t => !t)) return;
      const tag = tags.join();
      if (this.tag == null) this.tag = tag; else if (tag !== this.tag) this.pending = true;
    } catch { /* offline: next time */ }
  },
  apply() {
    const typing = document.activeElement && document.activeElement.matches('input, textarea, select');
    if (!this.pending || $('#modal').open || typing) return false;
    location.reload();
    return true;
  },
};
Updates.check();
setInterval(() => { if (document.visibilityState === 'visible') Updates.check(); }, 10 * 60000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') Updates.check().then(() => Updates.apply());
});

function route() {
  if (Updates.apply()) return;
  if (!S.me) return;
  const tabs = tabsFor().map(t => t[0]);
  let v = location.hash.replace('#', ''), tab = v;
  const member = v.match(/^team\/([0-9a-f-]{36})$/);
  const ctMonth = v.match(/^contracts(?:\/(\d{4}-\d{2}))?$/);
  const rt = v.match(/^routes(?:\/([0-9a-f-]{36}))?(?:\/(\d{4}-\d{2}-\d{2}))?$/);
  if (ctMonth && isManager()) { v = 'contracts'; tab = 'schedule'; }
  if (rt && isManager()) {
    v = 'routes'; tab = 'routes';
    if (rt[1]) S.routeStaff = rt[1];
    S.routeDay = rt[2] ? new Date(rt[2] + 'T00:00') : rt[1] ? null : S.routeDay;
  }
  if (member && isManager()) { S.memberId = member[1]; v = 'member'; tab = 'team'; }
  else if ((v === 'family' || v === 'famstaff') && isManager()) tab = 'team';
  else if ((v === 'contracts' || v === 'routes') && isManager()) { /* set above */ }
  else if (!tabs.includes(v)) { v = tabs[0]; tab = v; }
  if (S.view !== v) S.month = null;
  if (ctMonth && ctMonth[1] && v === 'contracts') S.month = new Date(ctMonth[1] + '-01T00:00');
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
    el.innerHTML = `<div class="empty">${T('Laden…', '加载中…')}</div>`;
    el.dataset.view = S.view;
    el.dataset.key = key;
  }
  try {
    await VIEWS[S.view](el, () => seq === S.renderSeq);
    if (seq === S.renderSeq) { showLevelUp(); maybeShiftReminder(); maybeInstallGuide(); }
  } catch (e) {
    if (e.code === 'auth') return;
    if (seq === S.renderSeq) el.innerHTML = `<div class="card"><h2>${T('Deze pagina kon niet geladen worden', '这个页面无法加载')}</h2><p class="muted">${esc(e.message)}</p><div class="form-actions"><button class="primary" id="retry">${T('Opnieuw proberen', '重试')}</button></div></div>`;
    const r = $('#retry'); if (r) r.addEventListener('click', renderView);
  }
}

function startPolling(ms) {
  stopPolling();
  S.poll = setInterval(() => {
    const typing = document.activeElement && document.activeElement.matches('#view input, #view textarea, #view select');
    if (document.visibilityState === 'visible' && !$('#modal').open && !typing) renderView();
  }, ms);
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
      <div class="punch-status"><span class="dot"></span>${T('Ingeklokt sinds', '上班打卡于')} ${sameDay(since, t) ? fmt.time(since) : fmt.when(since)}</div>
      <div class="punch-elapsed" data-live="since" data-since="${e.clock_in}">${fmt.dur(minutesBetween(since, t))}</div>
      ${sh ? `<div class="punch-meta">${T('Shift', '班次')} ${fmt.range(sh.starts_at, sh.ends_at)}${sh.label ? ' · ' + esc(partName(sh.label)) : ''}</div>` : ''}
      ${longOpen ? `<p class="hint bad">${T(`Je bent ingeklokt sinds ${fmt.when(since)}. Vergeten uit te klokken?`, `你从${fmt.when(since)}起一直是上班状态。忘记下班打卡了？`)} <button class="link" data-act="forgot-out">${T('Vul in wanneer je vertrok', '填写你离开的时间')}</button></p>`
        : early ? `<p class="hint warn">${T(`Je shift eindigt om ${fmt.time(sh.ends_at)}. Als je nu uitklokt, telt dat als vroeger vertrokken.`, `你的班次 ${fmt.time(sh.ends_at)} 结束。现在下班打卡算提前离开。`)}</p>` : ''}
      <div class="field">
        <label for="out-note">${T('Opmerking voor je verantwoordelijke (optioneel)', '给负责人的备注（可不填）')}</label>
        <input id="out-note" maxlength="300" placeholder="${early ? T('bv. vroeger weg, afspraak bij de dokter', '例如：提前走，去看医生') : T('bv. de bar overgenomen na 17u', '例如：17点后接了吧台')}">
      </div>
      <button class="big stop" data-act="clock-out">${T('Uitklokken', '下班打卡')}</button>`;
  } else {
    const can = clockInState();
    const soon = can.from && can.from - t < 18 * 3600000;
    const from = can.from && (sameDay(can.from, t) ? fmt.time(can.from) : fmt.when(can.from)), early = S.settings.clock_in_early_minutes;
    body = `
      <div class="punch-status"><span class="dot"></span>${T('Je bent niet ingeklokt', '你还没有上班打卡')}</div>
      ${next ? `<div class="punch-meta">${new Date(next.starts_at) <= t ? T('Je shift is nu bezig', '你的班次正在进行') : T('Volgende shift', '下一个班次')}: ${fmt.when(next.starts_at)} – ${fmt.time(next.ends_at)}${next.label ? ' · ' + esc(partName(next.label)) : ''}</div>`
        : `<div class="punch-meta muted">${seesShifts() ? T('Geen shiften gepland. Neem er een op bij Shiften.', '还没有排班。去“班次”页选一个。') : T('Geen shiften gepland.', '还没有排班。')}</div>`}
      ${can.ok ? `<button class="big go" data-act="clock-in">${T('Inklokken', '上班打卡')}</button>` : `
        <button class="big go" disabled aria-describedby="in-why">${T('Inklokken', '上班打卡')}</button>
        <p class="hint info" id="in-why" ${soon ? `data-unlock-at="${can.from.toISOString()}"` : ''}>${soon
          ? T(`Je kan inklokken vanaf <strong>${from}</strong>, ${early ? `${early} minuten voor je shift begint` : 'als je shift begint'}.`,
              `你可以从 <strong>${from}</strong> 开始打卡（${early ? `班次开始前 ${early} 分钟` : '班次开始时'}）。`)
          : T('Je kan alleen inklokken tijdens een shift waarvoor je ingepland bent. Neem er een op bij Shiften.', '只有在排给你的班次期间才能打卡。去“班次”页选一个。')}
          ${T('Gewerkt zonder in te klokken?', '上班了却没打卡？')} <button class="link" data-act="forgot-in">${T('Vergeten uren toevoegen', '补登工时')}</button></p>`}`;
  }
  return `
    <section class="punch ${e ? 'is-on' : ''} ${compact ? 'compact' : ''}" aria-label="${T('In- en uitklokken', '打卡')}">
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
    toast(T(`Ingeklokt om ${fmt.time(now())}`, `${fmt.time(now())} 上班打卡成功`));
    after();
  }).catch(() => {}));
  const outBtn = $('[data-act=clock-out]', root);
  if (outBtn) outBtn.addEventListener('click', () => busy(outBtn, async () => {
    await rpc('clock_out', { p_note: ($('#out-note', root) || {}).value || '' });
    await refreshMe();
    toast(T(`Uitgeklokt om ${fmt.time(now())}`, `${fmt.time(now())} 下班打卡成功`));
    if (canClock()) after(); else renderShell(); // the clock was only there to clock out
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
    <h2 id="modal-title">${T('Wanneer ben je vertrokken?', '你几点离开的？')}</h2>
    <p>${T(`Je klokte in ${fmt.when(since)}. We klokken je nu uit en sturen het juiste uur naar je verantwoordelijke om goed te keuren.`,
      `你在${fmt.when(since)}上班打卡。现在帮你下班打卡，并把正确的时间发给负责人审核。`)}</p>
    <form id="forgot-form" novalidate>
      <div class="form-grid">
        <div class="field"><label for="f-day">${T('Dag', '日期')}</label>${dateField('f-day', guess, since, now())}</div>
        <div class="field"><label for="f-out">${T('Ik vertrok om', '我离开的时间')}</label>${timeField('f-out', toTimeInput(guess))}</div>
        <div class="field wide"><label for="f-reason">${T('Reden', '原因')}</label><input id="f-reason" maxlength="300" value="${T('Vergeten uit te klokken', '忘记下班打卡')}"></div>
      </div>
      <p class="form-error" id="f-err"></p>
      <div class="form-actions"><button type="button" data-close>${T('Annuleren', '取消')}</button><button type="submit" class="primary">${T('Uitklokken en versturen', '下班打卡并发送')}</button></div>
    </form>`, d => {
    $('#forgot-form', d).addEventListener('submit', async ev => {
      ev.preventDefault();
      const hm = parseHM($('#f-out', d).value);
      const reason = $('#f-reason', d).value.trim();
      const err = $('#f-err', d);
      if (!hm) { err.textContent = T('Vul in hoe laat je vertrok, bv. 22:30.', '请填写你离开的时间，例如 22:30。'); return; }
      const out = atTime(new Date($('#f-day', d).value + 'T00:00'), hm);
      if (out <= since || out > now()) { err.textContent = T('Kies een uur tussen je inklokken en nu.', '请选一个在上班打卡之后、现在之前的时间。'); return; }
      if (reason.length < 3) { err.textContent = T('Geef een korte reden.', '请简单写个原因。'); return; }
      const btn = $('button[type=submit]', d);
      btn.disabled = true;
      try {
        await rpc('clock_out', { p_note: 'Vergeten uit te klokken' });
        await rpc('request_time_edit', { p_entry_id: e.id, p_in: since.toISOString(), p_out: out.toISOString(), p_reason: reason });
        modal.close();
        await refreshMe();
        toast(T('Uitgeklokt. Je verantwoordelijke keurt het ingevulde uur goed.', '已下班打卡。负责人会审核你填的时间。'));
        after();
      } catch (x) { err.textContent = x.message; btn.disabled = false; }
    });
  });
}

/* ------------------------------------------------------------ staff: clock */

const hello = () => { const h = now().getHours(); return h < 12 ? T('Goedemorgen', '早上好') : h < 18 ? T('Goedemiddag', '下午好') : T('Goedenavond', '晚上好'); };
const helloHead = () => `
    <div class="view-head"><div class="hello">
      <button class="hello-pic" data-go="profile" aria-label="${T('Mijn profiel', '我的资料')}">${personPic(S.me, 'xl')}</button>
      <div><h1>${hello()}${T(', ', '，')}${esc(S.me.name.split(' ')[0])}</h1>
        <p class="lvl-line">${levelPill(S.me.xp)} <span>${esc(levelTitle(S.me.xp.level))}</span> <span class="muted">· ${S.me.xp.xp} XP</span></p></div>
    </div></div>`;
const avatarCta = () => S.me.avatar ? '' : `<section class="card avatar-cta">
          <div class="cta-pic" aria-hidden="true">${Avatar.render(Avatar.DEFAULT, { view: 'bust' })}</div>
          <div><h2>${T('Maak je avatar', '创建你的头像')}</h2><p class="muted small">${T('Kies je kapsel, je kleren en je schoenen. Met elk level krijg je nieuwe dingen om te dragen.', '选发型、衣服和鞋子。每升一级都能解锁新的装扮。')}</p>
          <button class="primary sm" id="make-avatar">${T('Maak je avatar', '创建你的头像')}</button></div></section>`;
function nextShiftsCard(mine, open) {
  return `<section class="card">
          <div class="card-head"><h2>${T('Je volgende shiften', '你接下来的班次')}</h2>${seesShifts() ? `<button class="sm" data-go="shifts">${T('Alle shiften', '所有班次')}</button>` : ''}</div>
          ${mine.length ? `<div class="rows">${mine.map(s => `
            <div class="row"><div class="row-main"><span class="row-title">${fmt.dayLong(s.starts_at)}</span>
            <span class="row-sub"><span class="time">${fmt.range(s.starts_at, s.ends_at)}</span>${s.label ? ' · ' + esc(partName(s.label)) : ''}</span></div>
            <span class="pill">${fmt.dur(minutesBetween(s.starts_at, s.ends_at))}</span></div>`).join('')}</div>`
            : `<p class="empty">${T('Nog niets gepland.', '还没有排班。')}</p>`}
          ${open.length ? `<p class="hint info" style="margin-top:12px">${T(`${plural(open.length, 'open shift', 'open shiften')} de komende twee weken.`, `未来两周有 ${open.length} 个空班次。`)} <button class="link" data-go="shifts">${T('Neem er een op', '去选一个')}</button></p>` : ''}
        </section>`;
}
function bindHome(el) {
  $$('[data-go]', el).forEach(b => b.addEventListener('click', () => { location.hash = b.dataset.go; }));
  const mk = $('#make-avatar', el);
  if (mk) mk.addEventListener('click', () => openAvatarEditor());
}

// Who doesn't clock in (Team → Instellingen) starts here: their level, the XP
// that comes in every day, and their shifts.
async function viewStart(el, current) {
  await refreshMe();
  const t = now(), wk = startOfWeek(t);
  const shifts = await rpc('list_shifts', { p_from: wk.toISOString(), p_to: addDays(wk, 14).toISOString() });
  if (!current()) return;
  const open = shifts.filter(s => !s.staff_id && new Date(s.ends_at) > t);
  const planned = shifts.filter(s => s.mine && new Date(s.starts_at) < addDays(wk, 7)).reduce((a, s) => a + minutesBetween(s.starts_at, s.ends_at), 0);
  const xp = S.me.xp, per = S.settings.daily_xp || 0;
  el.innerHTML = `${helloHead()}
    <div class="grid-2">
      <section class="card xp-card">
        <div class="card-head"><h2>${T('Jouw level', '你的等级')}</h2>${levelPill(xp)}</div>
        <p class="xp-title">${esc(levelTitle(xp.level))}</p>
        ${xpBar(xp)}
        ${per ? `<p class="hint good">${T(`Elke dag krijg je <strong>+${per} XP</strong>, gewoon omdat je bij het team bent. Kom morgen terug voor meer.`,
          `每天你都会得到 <strong>+${per} XP</strong>，因为你是团队的一员。明天再来看看。`)}</p>` : ''}
        <div class="form-actions"><button class="sm" data-go="ranking">${T('Ranglijst', '排行榜')}</button><button class="sm" data-go="profile">${T('Avatar aanpassen', '修改头像')}</button></div>
      </section>
      <div style="display:flex;flex-direction:column;gap:18px;min-width:0">
        ${avatarCta()}
        <div class="stats">
          <div class="stat"><span class="v">${fmt.dur(planned)}</span><span class="k">${T('Ingepland deze week', '本周排班')}</span></div>
          <div class="stat good"><span class="v">+${per}</span><span class="k">${T('XP per dag', '每天 XP')}</span></div>
        </div>
        ${nextShiftsCard(S.nextShifts, open)}
      </div>
    </div>`;
  bindHome(el);
}

async function viewClock(el, current) {
  if (!canClock()) return viewStart(el, current);
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
  el.innerHTML = `${helloHead()}
    <div class="grid-2">
      ${punchCard()}
      <div style="display:flex;flex-direction:column;gap:18px;min-width:0">
        ${avatarCta()}
        <div class="stats stats-3">
          <div class="stat"><span class="v">${fmt.dur(weekMins)}</span><span class="k">${T('Gewerkt deze week', '本周工时')}</span></div>
          <div class="stat good"><span class="v">${fmt.dur(mins)}</span><span class="k">${T(`Gewerkt in ${monthName}`, `${monthName}工时`)}</span></div>
          <div class="stat"><span class="v">${rate != null ? fmt.money(mins / 60 * rate) : '—'}</span><span class="k">${rate != null ? T(`Verdiend in ${monthName}`, `${monthName}收入`) : T('Je verdiensten verschijnen zodra je uurloon is ingesteld', '设置时薪后会显示你的收入')}</span></div>
        </div>
        ${nextShiftsCard(mine, open)}
      </div>
    </div>`;
  bindPunch(el, renderView);
  bindHome(el);
}

/* ------------------------------------------------------------ driver */

// A driver clocks in and out at the restaurant with his phone's location, and
// while he is clocked in the app keeps where he drives: a position every 30
// seconds or 60 metres, sent every minute. Browsers only give positions while
// the app is open on the screen, so the screen can be kept on during the round.
// Positions wait in the phone (per person) until the server has them.
const metres = m => m >= 1000 ? `${num(m / 1000, 1)} km` : `${Math.round(m)} m`;
const AWAKE_KEY = 'prikklok.awake';

function geoError(e) {
  if (e && e.code === 1) return 'Je locatie staat uit voor deze app. Sta locatie toe in de instellingen van je browser (voor deze website) en probeer opnieuw.';
  if (e && e.code === 3) return 'Je locatie zoeken duurde te lang. Probeer opnieuw, liefst buiten.';
  return 'Je locatie kon niet bepaald worden. Zet de locatie (gps) van je telefoon aan en probeer opnieuw.';
}

const fixOf = pos => ({ at: new Date(pos.timestamp + S.offset).toISOString(), lat: +pos.coords.latitude.toFixed(6),
  lng: +pos.coords.longitude.toFixed(6), accuracy: Math.round(pos.coords.accuracy) });

// Where the phone is now: the route's own position when it is a few seconds
// old, otherwise a new one.
function getPosition({ timeout = 20000 } = {}) {
  if (Tracker.last && Date.now() - Tracker.lastAt < 15000 && Tracker.last.accuracy <= 200) return Promise.resolve({ ...Tracker.last, at: now().toISOString() });
  if (!navigator.geolocation) return Promise.reject(new AppError('Deze telefoon of browser kan je locatie niet geven. Probeer een andere browser.'));
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    p => resolve(fixOf(p)), e => reject(new AppError(geoError(e))), { enableHighAccuracy: true, timeout, maximumAge: Tracker.entry == null ? 0 : 5000 }));
}

const Tracker = {
  entry: null, watch: null, timers: [], lock: null, last: null, lastAt: 0, kept: null, error: null, sending: false, sentAt: 0,
  key() { return `prikklok.route.${S.me ? S.me.id : ''}`; },
  queue() { try { return JSON.parse(store.get(this.key()) || '[]'); } catch { return []; } },
  save(q) { store.set(this.key(), q.length ? JSON.stringify(q.slice(-5000)) : null); },
  awake() { return store.get(AWAKE_KEY) !== '0'; },
  start(entryId) {
    if (this.entry === entryId) return;
    this.stop();
    this.entry = entryId;
    this.error = navigator.geolocation ? null : 'unsupported';
    if (this.error) return;
    const opts = { enableHighAccuracy: true, maximumAge: 15000, timeout: 60000 };
    this.watch = navigator.geolocation.watchPosition(p => this.fix(p), e => this.fail(e), opts);
    // standing still, a phone may stop reporting: ask now and then
    this.timers.push(setInterval(() => this.nudge(), 45000), setInterval(() => this.flush(), 60000));
    this.wake();
    this.flush();
  },
  stop() {
    if (this.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(this.watch);
    this.timers.forEach(clearInterval);
    Object.assign(this, { entry: null, watch: null, timers: [], last: null, lastAt: 0, kept: null, error: null });
    this.release();
  },
  nudge() {
    if (this.entry == null || !navigator.geolocation || Date.now() - this.lastAt < 40000) return;
    navigator.geolocation.getCurrentPosition(p => this.fix(p), e => this.fail(e), { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
  },
  fix(pos) {
    if (this.entry == null) return;
    const p = fixOf(pos);
    this.error = null; this.last = p; this.lastAt = Date.now();
    const k = this.kept, gap = k ? Date.parse(p.at) - Date.parse(k.at) : Infinity;
    if (p.accuracy <= 200 && (gap >= 30000 || (gap >= 5000 && Route.distance(k, p) >= 60))) this.push(p);
    this.paint();
  },
  push(p) {
    if (p.kind !== 'here') this.kept = p;
    const q = this.queue();
    q.push(p);
    this.save(q);
    if (q.length >= 20) this.flush();
  },
  fail(e) { this.error = e && e.code === 1 ? 'denied' : 'nofix'; this.paint(); },
  async flush({ keepalive = false } = {}) {
    const q = this.queue();
    if (this.sending || !q.length || !S.token) return;
    this.sending = true;
    const batch = q.slice(0, 500);
    try {
      await rpc('driver_track', { p_points: batch }, { keepalive });
      this.save(this.queue().slice(batch.length));
      this.sentAt = Date.now();
    } catch { /* they stay in the phone for the next try */ }
    finally { this.sending = false; this.paint(); }
  },
  // positions not on the server yet, for the driver's own screen
  pending(entryId) { return this.queue().map(p => ({ ...p, acc: p.accuracy, kind: p.kind || 'track', entry_id: entryId })); },
  async wake() {
    if (!this.awake() || this.lock || this.entry == null || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
      this.lock = await navigator.wakeLock.request('screen');
      this.lock.addEventListener('release', () => { this.lock = null; });
    } catch { /* not allowed right now (battery saver) */ }
  },
  release() { if (this.lock) { quiet(this.lock.release()); this.lock = null; } },
  status() {
    if (this.error === 'unsupported') return '<span class="pill bad">Geen locatie</span> Deze telefoon of browser kan geen locatie geven. Je rit wordt niet bijgehouden.';
    if (this.error === 'denied') return '<span class="pill bad">Locatie staat uit</span> Sta locatie toe voor deze website in je browser, anders wordt je rit niet bijgehouden.';
    const waiting = this.queue().length;
    const wait = waiting > 3 ? ` · ${plural(waiting, 'plek wacht', 'plekken wachten')} op verbinding` : '';
    if (!this.last) return `<span class="pill">Locatie zoeken…</span>${this.error === 'nofix' ? ' Zet de gps van je telefoon aan.' : ''}`;
    if (Date.now() - this.lastAt > 3 * 60000) return `<span class="pill warn">Geen locatie sinds ${fmt.time(this.last.at)}</span> Laat de app open terwijl je rijdt.${wait}`;
    return `<span class="pill on">Rit wordt bijgehouden</span> laatst ${fmt.time(this.last.at)} · tot op ${this.last.accuracy} m${wait}`;
  },
  paint() { const el = $('#track-line'); if (el) el.innerHTML = this.status(); },
};

// The GPS route only when the manager turned it on (Ritten → Gps-rit).
function syncTracker() {
  if (isDriver() && S.openEntry && S.settings.track_route) Tracker.start(S.openEntry.id);
  else if (Tracker.entry != null) { Tracker.flush(); Tracker.stop(); }
}
document.addEventListener('visibilitychange', () => {
  if (Tracker.entry == null) return;
  if (document.visibilityState === 'hidden') Tracker.flush({ keepalive: true });
  else { Tracker.wake(); Tracker.nudge(); }
});
setInterval(() => Tracker.paint(), 5000);

function driverPunch(site) {
  const e = S.openEntry, t = now(), gps = !!S.settings.track_route;
  const zone = site && site.lat != null ? `tot ${metres(site.radius_m)} ervan` : '';
  const body = e ? `
      <div class="punch-status"><span class="dot"></span>Ingeklokt sinds ${sameDay(e.clock_in, t) ? fmt.time(e.clock_in) : fmt.when(e.clock_in)}</div>
      <div class="punch-elapsed" data-live="since" data-since="${e.clock_in}">${fmt.dur(minutesBetween(e.clock_in, t))}</div>
      ${gps ? `<p class="track-line" id="track-line">${Tracker.status()}</p>
      ${'wakeLock' in navigator ? `<label class="check small"><input type="checkbox" id="tr-awake" ${Tracker.awake() ? 'checked' : ''}> Scherm aan houden tijdens de rit</label>` : ''}` : ''}
      <div class="field">
        <label for="out-note">Opmerking voor je verantwoordelijke (optioneel)</label>
        <input id="out-note" maxlength="300" placeholder="bv. automaat in de Markt was leeg">
      </div>
      <button class="big stop" data-act="drv-out">Uitklokken</button>
      <p class="muted small">Uitklokken kan alleen aan het restaurant. Al weg en vergeten uit te klokken? <button class="link" data-act="drv-forgot">Vul in wanneer je stopte</button></p>`
    : `
      <div class="punch-status"><span class="dot"></span>Je bent niet ingeklokt</div>
      <div class="punch-meta">Inklokken kan aan het restaurant${zone ? `, ${zone}` : ''}.</div>
      <button class="big go" data-act="drv-in">Inklokken</button>
      <p class="muted small">${gps ? 'De app vraagt daarvoor je locatie. Zolang je ingeklokt bent, houdt de app je rit bij; daarna niet meer. Laat de app open tijdens je ronde.'
        : 'De app vraagt daarvoor je locatie, alleen bij het in- en uitklokken. Wat je bijvult, komt vanzelf uit MATO Info.'}</p>`;
  return `
    <section class="punch ${e ? 'is-on' : ''}" aria-label="In- en uitklokken">
      <div class="punch-top">
        <span class="punch-clock" data-live="clock">${fmt.clock(t)}</span>
        <span class="punch-date">${fmt.dayLong(t)}</span>
      </div>
      ${body}
    </section>`;
}

function bindDriverPunch(root, after) {
  const inBtn = $('[data-act=drv-in]', root);
  if (inBtn) inBtn.addEventListener('click', () => busy(inBtn, async () => {
    inBtn.textContent = 'Locatie zoeken…';
    const p = await getPosition();
    inBtn.textContent = 'Bezig…';
    await rpc('driver_clock_in', { p_lat: p.lat, p_lng: p.lng, p_accuracy: p.accuracy });
    await refreshMe();
    toast(`Ingeklokt om ${fmt.time(now())}. Goede rit!`);
    after();
  }).catch(() => {}));
  const outBtn = $('[data-act=drv-out]', root);
  if (outBtn) outBtn.addEventListener('click', () => busy(outBtn, async () => {
    outBtn.textContent = 'Locatie zoeken…';
    const p = await getPosition();
    outBtn.textContent = 'Bezig…';
    await Tracker.flush();
    await rpc('driver_clock_out', { p_lat: p.lat, p_lng: p.lng, p_accuracy: p.accuracy, p_note: ($('#out-note', root) || {}).value || '' });
    await refreshMe();
    toast(`Uitgeklokt om ${fmt.time(now())}.`);
    after();
  }).catch(() => {}));
  const awake = $('#tr-awake', root);
  if (awake) awake.addEventListener('change', () => {
    store.set(AWAKE_KEY, awake.checked ? '1' : '0');
    if (awake.checked) Tracker.wake(); else Tracker.release();
  });
  const forgot = $('[data-act=drv-forgot]', root);
  if (forgot) forgot.addEventListener('click', () => driverForgotModal(after));
}

// Away from the restaurant and forgot to clock out: clocked out now, and the
// time he stopped goes to the manager to approve.
function driverForgotModal(after) {
  const e = S.openEntry;
  if (!e) return;
  const since = new Date(e.clock_in);
  const guess = now();
  modal.open(`
    <h2 id="modal-title">Wanneer stopte je?</h2>
    <p>Je klokte in ${fmt.when(since)}. We klokken je nu uit en sturen het uur waarop je stopte naar je verantwoordelijke om goed te keuren.</p>
    <form id="dforgot-form" novalidate>
      <div class="form-grid">
        <div class="field"><label for="df-day">Dag</label>${dateField('df-day', guess, since, now())}</div>
        <div class="field"><label for="df-out">Ik stopte om</label>${timeField('df-out', toTimeInput(guess))}</div>
        <div class="field wide"><label for="df-reason">Reden</label><input id="df-reason" maxlength="300" value="Vergeten uit te klokken aan het restaurant"></div>
      </div>
      <p class="form-error" id="df-err"></p>
      <div class="form-actions"><button type="button" data-close>Annuleren</button><button type="submit" class="primary">Uitklokken en versturen</button></div>
    </form>`, d => {
    $('#dforgot-form', d).addEventListener('submit', async ev => {
      ev.preventDefault();
      const hm = parseHM($('#df-out', d).value), reason = $('#df-reason', d).value.trim(), err = $('#df-err', d);
      if (!hm) { err.textContent = 'Vul in hoe laat je stopte, bv. 13:30.'; return; }
      const out = atTime(new Date($('#df-day', d).value + 'T00:00'), hm);
      if (out <= since || out > now()) { err.textContent = 'Kies een uur tussen je inklokken en nu.'; return; }
      if (reason.length < 3) { err.textContent = 'Geef een korte reden.'; return; }
      const btn = $('button[type=submit]', d);
      btn.disabled = true;
      try {
        await Tracker.flush();
        await rpc('driver_forgot_out', { p_out: out.toISOString(), p_reason: reason });
        modal.close();
        await refreshMe();
        toast('Uitgeklokt. Je verantwoordelijke keurt het uur goed.');
        after();
      } catch (x) { err.textContent = x.message; btn.disabled = false; }
    });
  });
}

async function viewDriver(el, current) {
  await refreshMe();
  const t = now(), monthStart = startOfMonth(t), wk = startOfWeek(t), day = startOfDay(t);
  const from = monthStart < wk ? monthStart : wk;
  const [hours, today] = await Promise.all([
    rpc('my_hours', { p_from: addDays(from, -1).toISOString(), p_to: addDays(t, 1).toISOString() }),
    rpc('driver_today'),
  ]);
  if (!current()) return;
  const worked = since => hours.entries.reduce((a, x) => {
    const b = x.clock_out ? new Date(x.clock_out) : now(), s = new Date(Math.max(new Date(x.clock_in), since));
    return b > s ? a + minutesBetween(s, b) : a;
  }, 0);
  const todays = hours.entries.filter(x => !x.clock_out || new Date(x.clock_out) > day);
  const a = Route.analyse({ entries: todays, points: [...today.points, ...(S.openEntry ? Tracker.pending(S.openEntry.id) : [])],
    checkpoints: today.checkpoints, site: today.site, now: now().getTime() });
  const gps = !!S.settings.track_route, visits = today.visits || [];
  const here = gps && S.openEntry && Tracker.last ? Route.placeOf({ ...Tracker.last, acc: Tracker.last.accuracy }, a.places) : null;
  const hour = t.getHours(), hello = hour < 12 ? 'Goedemorgen' : hour < 18 ? 'Goedemiddag' : 'Goedenavond';
  el.innerHTML = `
    <div class="view-head"><div class="hello">
      <button class="hello-pic" data-go="profile" aria-label="Mijn profiel">${personPic(S.me, 'xl')}</button>
      <div><h1>${hello}, ${esc(S.me.name.split(' ')[0])}</h1><p class="muted">Chauffeur</p></div>
    </div></div>
    <div class="grid-2">
      ${driverPunch(today.site)}
      <div style="display:flex;flex-direction:column;gap:18px;min-width:0">
        <div class="stats stats-3">
          <div class="stat good"><span class="v">${fmt.dur(worked(day))}</span><span class="k">Vandaag gewerkt</span></div>
          <div class="stat"><span class="v">${fmt.dur(worked(wk))}</span><span class="k">Deze week</span></div>
          <div class="stat"><span class="v">${fmt.dur(worked(monthStart))}</span><span class="k">In ${fmt.monthName(t)}</span></div>
        </div>
        <section class="card">
          <div class="card-head"><h2>Je ronde vandaag</h2>${gps && S.openEntry ? '<button class="sm primary" id="drv-here">Ik ben hier</button>' : ''}</div>
          ${visits.length ? `<div class="rows">${visits.map(v => `
            <div class="row"><div class="row-main"><span class="row-title">${esc(v.machine)}</span>
              <span class="row-sub"><span class="time">${fmt.time(v.first_at)}</span> · ${esc(visitWhat(v))}</span></div>
              <span class="pill on">✓</span></div>`).join('')}</div>`
            : `<p class="empty">${gps ? 'Nog niets bijgevuld in MATO Info.' : 'Nog niets bijgevuld vandaag. Wat je in MATO Info bijvult, verschijnt hier vanzelf, binnen 5 minuten.'}</p>`}
          ${gps && today.checkpoints.length ? `<h3 style="margin-top:14px">Plaatsen</h3><div class="rows">${today.checkpoints.map(cp => {
            const v = a.visited.get(cp.id) || [];
            return `<div class="row"><div class="row-main"><span class="row-title">${esc(cp.name)}</span>
              ${here && here.id === cp.id ? '<span class="row-sub">Je bent hier</span>' : ''}</div>
              ${v.length ? `<span class="pill on">✓ ${v.map(x => fmt.time(x.from)).join(', ')}</span>` : '<span class="pill">Nog niet</span>'}</div>`;
          }).join('')}</div>` : ''}
          ${gps && S.openEntry ? '<p class="muted small" style="margin-top:10px">Aan een automaat? Tik op <strong>Ik ben hier</strong>: zo staat het zeker op je rit, ook als je telefoon even geen locatie had.</p>' : ''}
        </section>
        <section class="card">
          <div class="card-head"><h2>Je uren</h2><button class="sm" data-go="hours">Alle uren</button></div>
          ${hours.entries.length ? `<div class="rows">${hours.entries.slice(0, 7).map(x => `
            <div class="row"><div class="row-main"><span class="row-title">${fmt.dayLong(x.clock_in)}</span>
              <span class="row-sub"><span class="time">${fmt.time(x.clock_in)} – ${x.clock_out ? fmt.time(x.clock_out) : 'nu'}</span></span></div>
              <span class="pill ${x.clock_out ? '' : 'on'}">${fmt.dur(minutesBetween(x.clock_in, x.clock_out || now()))}</span></div>`).join('')}</div>`
            : '<p class="empty">Nog geen uren. Klok in aan het restaurant om te beginnen.</p>'}
        </section>
      </div>
    </div>`;
  bindDriverPunch(el, renderView);
  $$('[data-go]', el).forEach(b => b.addEventListener('click', () => { location.hash = b.dataset.go; }));
  const hereBtn = $('#drv-here', el);
  if (hereBtn) hereBtn.addEventListener('click', () => busy(hereBtn, async () => {
    const p = await getPosition({ timeout: 15000 });
    Tracker.push({ ...p, kind: 'here' });
    await Tracker.flush();
    const at = Route.placeOf({ ...p, acc: p.accuracy }, a.places);
    toast(at ? `Aangekomen bij ${at.name} om ${fmt.time(p.at)}.` : `Je plek is bewaard (${fmt.time(p.at)}). Dit is geen plaats van de ronde.`);
    renderView();
  }).catch(() => {}));
  if (S.openEntry) startPolling(60000);
}

/* ------------------------------------------------------- shifts & schedule */

const DAY_NAMES = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const DAY_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const DAY_NAMES_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function periodBar(label, hint, prevId, nextId) {
  return `<div class="periodbar">
    <button class="icon" id="${prevId}" aria-label="${T('Vorige', '上一个')}">‹</button>
    <div class="label"><strong>${label}</strong><span>${hint}</span></div>
    <button class="icon" id="${nextId}" aria-label="${T('Volgende', '下一个')}">›</button>
  </div>`;
}

// Quick buttons for this month and the next two.
function monthChips() {
  const first = startOfMonth(now());
  return `<div class="chips" role="group" aria-label="${T('Kies een maand', '选择月份')}">${[0, 1, 2].map(i => {
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
  return m > addDays(now(), 92) ? `<p class="hint info">${T('Vaste shiften verschijnen 3 maanden op voorhand in de kalender, dus deze maand kan nog leeg lijken.', '固定班次提前 3 个月出现在日历上，所以这个月可能看起来还是空的。')}</p>` : '';
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
const partName = part => zhUI() ? ({ Middag: '午班', Avond: '晚班' }[part] || part) : part;

function calEntry(x, manager, t, day) {
  const past = new Date(x.ends_at) <= t;
  const time = `${fmt.time(x.starts_at)} – ${fmt.time(x.ends_at)}`;
  const part = shiftPart(x), name = partName(part);
  if (isGroup(x)) {
    const inner = `<span class="cal-line"><span class="cal-tag${partClass(part)}"><span class="tag-full">${esc(name)}</span><span class="tag-short" aria-hidden="true">${esc(name.charAt(0))}</span></span><span class="t">${time}</span></span>
      ${groupWho(x.people)}`;
    const title = esc(`${name}, ${time}: ${x.people.map(p => p.name).join(', ')}`);
    return `<button type="button" class="cal-shift is-group${past ? ' is-past' : ''}" data-group-day="${toDateInput(day)}" title="${title}">${inner}</button>`;
  }
  const who = x.open ? `${T('Open', '空缺')}${x.count > 1 ? ` ×${x.count}` : ''}` : esc(x.staff_name) + (x.mine && !manager ? T(' (jij)', '（你）') : '');
  const pic = x.open ? '' : x.staff_avatar ? `<span class="cal-pic">${Avatar.head(x.staff_avatar)}</span>` : `<span class="cal-pic cal-initials">${esc(initials(x.staff_name))}</span>`;
  const cls = `cal-shift${x.open ? ' is-open' : ''}${x.mine && !manager ? ' is-mine' : ''}${past ? ' is-past' : ''}`;
  const clickable = manager || (!past && (x.open || x.mine));
  const mate = !manager && !x.open && !x.mine && x.staff_id; // someone else's shift: their card
  const title = esc(`${name}, ${time}${x.open ? (manager ? ' (open)' : T(' – tik om op te nemen', ' – 点击认领')) : ''}`);
  // phones show only the first letter of the part of the day, and the number of open places
  const inner = `<span class="cal-line"><span class="cal-tag${partClass(part)}"><span class="tag-full">${esc(name)}</span><span class="tag-short" aria-hidden="true">${esc(name.charAt(0))}</span></span><span class="t">${time}</span>${x.open && x.count > 1 ? `<span class="cal-count" aria-hidden="true">×${x.count}</span>` : ''}</span>
    <span class="cal-who">${pic}<b>${who}</b></span>`;
  return clickable
    ? `<button type="button" class="${cls}" data-shift="${x.id}" title="${title}">${inner}</button>`
    : mate ? `<button type="button" class="${cls}" data-mate="${x.staff_id}" title="${title}">${inner}</button>`
    : `<span class="${cls}" title="${title}">${inner}</span>`;
}

function calendarHTML(shifts, month, { manager = false } = {}) {
  const t = now(), first = startOfMonth(month);
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const byDay = Array.from({ length: days }, (_, i) => dayEntries(shifts.filter(s => sameDay(s.starts_at, addDays(first, i))), { group: true }));
  const names = zhUI() ? DAY_NAMES_ZH.map(n => n.replace('星期', '周')) : DAY_NAMES;
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
        ${WEEK_ORDER.map(i => names[i]).map(n => `<div class="cal-head"><span class="only-wide">${n}</span><span class="only-phone" aria-hidden="true">${n.slice(0, 2)}</span></div>`).join('')}
        ${cells.join('')}
      </div>
      <div class="cal-legend only-phone">
        <span><span class="cal-tag is-day">${T('M', '午')}</span> ${T('Middag', '午班')}</span><span><span class="cal-tag is-eve">${T('A', '晚')}</span> ${T('Avond', '晚班')}</span>
        <span><span class="lg-box is-open"></span> ${T('Open', '空缺')}</span>${manager ? '' : `<span><span class="lg-box is-mine"></span> ${T('Jouw shift', '你的班次')}</span>`}
        <span class="muted">${T('Tik op een dag.', '点一天查看。')}</span>
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
      ? `<span class="day-open">${T('Open', '空缺')}${x.count > 1 ? T(` · ${x.count} plaatsen`, ` · ${x.count} 个位置`) : ''}</span>`
      : `<button type="button" class="day-mate" data-mate="${x.staff_id}">${personPic({ name: x.staff_name, avatar: x.staff_avatar })}<span>${esc(x.staff_name)}${x.mine && !manager ? T(' (jij)', '（你）') : ''}</span></button>`;
    const action = manager ? `<button type="button" class="sm" data-day-edit="${x.id}">Wijzigen</button>`
      : past ? '' : x.open ? `<button type="button" class="primary" data-day-claim="${x.id}">${T('Opnemen', '认领')}</button>`
      : x.mine ? `<button type="button" data-day-own="${x.id}">${T('Teruggeven', '退回')}</button>` : '';
    return `<div class="day-shift${x.open ? ' is-open' : ''}${x.mine && !manager ? ' is-mine' : ''}${past ? ' is-past' : ''}">
      <div class="day-main">
        <div class="day-when"><span class="cal-tag${partClass(part)}">${esc(partName(part))}</span><span class="time">${fmt.range(x.starts_at, x.ends_at)}</span></div>
        <div class="day-who">${who}</div>
        ${x.notes ? `<p class="muted small">${esc(x.notes)}</p>` : ''}
      </div>
      ${action}
    </div>`;
  };
  const d = modal.open(`
    <h2 id="modal-title">${esc(fmt.dayLong(day))}${sameDay(day, t) ? T(' · vandaag', ' · 今天') : ''}</h2>
    ${list.length ? `<div class="day-list">${list.map(row).join('')}</div>` : '<p class="empty">Nog geen shiften op deze dag.</p>'}
    <div class="form-actions">${manager ? '<button type="button" class="primary" id="day-add">+ Shift toevoegen</button>' : ''}<button type="button" data-close>${T('Sluiten', '关闭')}</button></div>`, null, { sheet: true });
  const find = id => shifts.find(s => s.id === id);
  $$('[data-day-claim]', d).forEach(b => b.addEventListener('click', () => claimShift(find(b.dataset.dayClaim))));
  $$('[data-day-own]', d).forEach(b => b.addEventListener('click', () => ownShift(find(b.dataset.dayOwn))));
  $$('[data-day-edit]', d).forEach(b => b.addEventListener('click', () => editShift(find(b.dataset.dayEdit))));
  $$('[data-mate]', d).forEach(b => b.addEventListener('click', () => mateCard(b.dataset.mate)));
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
    const mate = ev.target.closest('[data-mate]');
    if (mate) { mateCard(mate.dataset.mate); return; }
    const b = ev.target.closest('[data-shift]');
    const s = b && shifts.find(x => x.id === b.dataset.shift);
    if (!s) return;
    if (manager) editShift(s);
    else if (!s.staff_id) claimShift(s);
    else if (s.mine) ownShift(s);
  });
}

const shiftWhen = s => `${esc(fmt.dayLong(s.starts_at))}, <strong>${fmt.range(s.starts_at, s.ends_at)}</strong>${s.label ? ` (${esc(partName(s.label))})` : ''}`;

async function claimShift(s) {
  const ok = await modal.confirm({ title: T('Deze shift opnemen?', '认领这个班次？'), body: `${shiftWhen(s)}${s.notes ? `<br>${esc(s.notes)}` : ''}`, ok: T('Shift opnemen', '认领班次') });
  if (!ok) return;
  busy(null, async () => {
    await rpc('claim_shift', { p_shift_id: s.id });
    await refreshMe();
    toast(T('Shift opgenomen. Hij staat nu op jouw naam.', '已认领，这个班次现在是你的了。'));
    renderView();
  }).catch(() => {});
}

// Belgian numbers: "0486159209" reads "0486 15 92 09" and calls +32486159209.
const phoneDigits = p => String(p || '').replace(/[^\d+]/g, '').replace(/^00/, '+').replace(/^0(\d{8,9})$/, '+32$1');
const fmtPhone = p => { const d = String(p || '').replace(/\D/g, ''); return /^04\d{8}$/.test(d) ? d.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4') : p; };
const PHONE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>';

const DROP_REASONS = [['Ziek', '生病'], ['School of examen', '上学或考试'], ['Familie', '家里有事'], ['Andere afspraak', '其他安排']];

async function ownShift(s) {
  const cut = S.settings.drop_cutoff_hours;
  const canDrop = new Date(s.starts_at) - now() > cut * 3600000;
  // too late to give it back here: who to call (Team → Instellingen)
  const contact = canDrop ? null : await rpc('shift_contact').catch(() => ({}));
  const who = contact && contact.name ? esc(contact.name) : T('je verantwoordelijke', '负责人');
  const tooLate = !contact ? '' : `
      <p class="hint info">${sameDay(s.starts_at, now()) ? T('Deze shift is vandaag.', '这个班次就在今天。') : T(`Deze shift begint binnen ${cut} uur.`, `这个班次 ${cut} 小时内就开始了。`)}
        ${T('Annuleren kan dan niet meer in de app.', '已经不能在 app 里取消了。')}</p>
      ${contact.phone ? `<div class="contact-card">
        <p>${T(`Wil je hem annuleren? Neem contact op met <strong>${who}</strong> voor je aanvraag:`, `想取消？请联系 <strong>${who}</strong> 申请：`)}</p>
        <p class="contact-phone">${PHONE_ICON}<span class="mono">${esc(fmtPhone(contact.phone))}</span></p>
        <div class="toolbar">
          <a class="btn primary" href="tel:${esc(phoneDigits(contact.phone))}">${PHONE_ICON}<span>${T(`Bel ${who}`, `打给${who}`)}</span></a>
          <a class="btn" href="https://wa.me/${esc(phoneDigits(contact.phone).replace('+', ''))}" target="_blank" rel="noopener">WhatsApp</a>
        </div>
      </div>` : `<p>${T(`Vraag het aan ${who}.`, `请问${who}。`)}</p>`}
      <div class="form-actions"><button type="button" data-close>${T('Sluiten', '关闭')}</button></div>`;
  modal.open(`
    <h2 id="modal-title">${T('Jouw shift', '你的班次')}</h2>
    <p>${shiftWhen(s)}</p>
    ${canDrop ? `<p class="muted small">${T('Kan je niet? Geef hem terug, dan staat hij weer open voor iemand anders. Je verantwoordelijke ziet waarom.', '来不了？把它退回，别人就可以认领。负责人会看到原因。')}</p>
      <form id="drop-form" novalidate>
        <div class="field"><label for="drop-reason">${T('Waarom geef je hem terug?', '为什么退回？')}</label>
          <div class="chips reason-chips" role="group" aria-label="${T('Snel kiezen', '快速选择')}">${DROP_REASONS.map(r => T(...r)).map(r => `<button type="button" class="chip" data-reason="${esc(r)}">${esc(r)}</button>`).join('')}</div>
          <textarea id="drop-reason" rows="2" maxlength="300" placeholder="${T('bv. Ik heb een examen die dag.', '例如：那天我有考试。')}"></textarea></div>
        <p class="form-error" id="drop-err"></p>
        <div class="form-actions">
          <button type="button" data-close>${T('Sluiten', '关闭')}</button>
          <button type="submit" class="danger solid" id="drop-it">${T('Shift teruggeven', '退回班次')}</button>
        </div>
      </form>`
      : tooLate}`, d => {
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
      if (reason.length < 3) { err.textContent = T('Zeg kort waarom je deze shift teruggeeft.', '请简单说说为什么退回这个班次。'); box.focus(); return; }
      busy(b, async () => {
        await rpc('give_back_shift', { p_shift_id: s.id, p_reason: reason });
        modal.close();
        await refreshMe();
        toast(T('Shift teruggegeven. Hij staat weer open voor anderen.', '已退回，别人现在可以认领。'));
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
      <div><h1>${T('Shiften', '班次')}</h1><p>${T(`<span class="only-wide">Tik op een <span class="key-open">open</span> shift om hem op te nemen. Tik op een van jouw shiften om hem terug te geven.</span><span class="only-phone">Tik op een dag om de shiften te zien. Bij een <span class="key-open">open</span> shift tik je op Opnemen.</span>`,
        `<span class="only-wide">点一个<span class="key-open">空缺</span>班次来认领。点你自己的班次可以退回。</span><span class="only-phone">点一天查看班次。<span class="key-open">空缺</span>班次点“认领”。</span>`)}</p></div>
      ${periodBar(fmt.month(m), sameDay(m, startOfMonth(t)) ? T('Deze maand', '本月') : '', 'mo-prev', 'mo-next')}
    </div>
    ${monthChips()}
    <div class="stats stats-3">
      <div class="stat ${open.length ? 'accent' : ''}"><span class="v">${open.length}</span><span class="k">${T('Open om op te nemen', '可认领的空缺')}</span></div>
      <div class="stat"><span class="v">${mine.length}</span><span class="k">${T('Jouw shiften', '你的班次')}</span></div>
      <div class="stat"><span class="v">${fmt.dur(mineMins)}</span><span class="k">${T('Gepland voor jou', '你的排班时长')}</span></div>
    </div>
    <section class="card cal-card">${calendarHTML(shifts, m)}</section>
    ${horizonNote(m)}`;
  bindMonthNav(el);
  bindCalendar(el, shifts, false);
}

const nextMonth = () => addMonths(startOfMonth(now()), 1);

async function loadStaff(force = false) {
  if (!S.staff || force) S.staff = await rpc('mgr_staff_list');
  return S.staff;
}
const workers = () => (S.staff || []).filter(p => p.role !== 'viewer');
const activeStaff = () => workers().filter(p => p.active && p.role !== 'driver'); // drivers work no shifts
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
      <div class="cal-toolbar"><span class="muted small">Gebruik + op een dag voor een extra shift.</span>
        <span class="toolbar"><button class="sm" id="ct-open">Studentencontracten</button><button class="primary sm" id="add-shift">+ Shift toevoegen</button></span></div>
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
  $('#ct-open', el).addEventListener('click', () => { location.hash = `contracts/${toDateInput(m).slice(0, 7)}`; });
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
const CONTRACTS_ZH = { student: '学生', flexi: '弹性工作（Flexi-job）', extra: '临时工', vast: '固定 / 其他' };
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
    if (p.driver) continue; // a driver's hours stay out of Securex and Officient
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
    open,
    pending,
    html: `
    <section class="card" id="securex-card">
      <div class="card-head"><h2>Naar Securex</h2>
        <span class="pill ${done ? 'on' : ''}">${done ? `${monthInfo.exported_kind === 'officient' ? 'Naar Officient gestuurd' : 'Gedownload'} op ${fmt.short(done)} om ${fmt.time(done)}${monthInfo.exported_by ? ` door ${esc(monthInfo.exported_by)}` : ''}` : 'Nog niet verstuurd'}</span></div>
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
      <div class="off-compare">
        <div class="card-head"><h3>Vergelijken met Officient</h3><button class="sm" id="off-cal">Vergelijken</button></div>
        <p class="muted small">Officient geeft zijn kalender door aan Securex. Hier zie je wat Officient voor deze maand telt, per persoon en per dag, naast de geklokte uren. Vergelijken verandert niets; pas met <strong>Naar Officient sturen</strong> past de app Officient aan, na een overzicht van elke wijziging.</p>
        <div id="off-cal-out"></div>
      </div>
    </section>`,
  };
}

// Officient's calendar for the month next to the hours clocked, per person and day.
const OFF_KINDS = { time_off: 'afwezig', overtime: 'extra uren' };
const HOURLY = ['student', 'flexi', 'extra'];
const holidayLabel = date => holidaysBE(+date.slice(0, 4)).get(date) || 'Feestdag';
function officientCompare(cal, rows) {
  const name = id => ((S.staff || []).find(p => p.id === id) || rows.find(x => x.staff_id === id) || {}).name || '?';
  const app = new Map();
  for (const x of rows) {
    const day = toDateInput(x.start), per = app.get(x.staff_id) || new Map();
    per.set(day, (per.get(day) || 0) + x.minutes);
    app.set(x.staff_id, per);
  }
  const linked = new Set(cal.people.map(p => p.staff_id));
  const driver = id => ((S.staff || []).find(p => p.id === id) || {}).role === 'driver';
  const people = cal.people.filter(p => !driver(p.staff_id)).map(p => {
    const off = new Map(p.days.map(d => [d.date, d]));
    const mine = app.get(p.staff_id) || new Map();
    const days = [...new Set([...off.keys(), ...mine.keys()])].sort().map(date => {
      const d = off.get(date);
      return { date, app: mine.get(date) || 0, officient: d ? (d.net ?? Math.max(0, d.scheduled - d.off + d.extra)) : 0,
               events: d ? [...(d.holiday ? [holidayLabel(date)] : []), ...d.events] : [] };
    });
    const sum = k => days.reduce((a, d) => a + d[k], 0);
    return { id: p.staff_id, name: name(p.staff_id), days, app: sum('app'), officient: sum('officient'),
             differ: days.filter(d => Math.abs(d.app - d.officient) >= 15) };
  }).filter(p => p.app || p.officient).sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  officientCompare.people = people;
  const unlinked = [...app.keys()].filter(id => !linked.has(id)).map(name);
  const h = mins => mins ? fmt.hours2(mins) : '<span class="muted">–</span>';
  const dayName = date => fmt.day(new Date(date + 'T00:00'));
  return `
    ${people.length ? `<div class="table-wrap"><table class="off-cal-table">
      <thead><tr><th>Naam</th><th class="num">Geklokt</th><th class="num">In Officient</th><th class="num">Verschil</th><th>Dagen die verschillen</th></tr></thead>
      <tbody>${people.map(p => `<tr>
        <td><strong>${esc(p.name)}</strong></td><td class="num">${h(p.app)}</td><td class="num">${h(p.officient)}</td>
        <td class="num ${Math.abs(p.app - p.officient) >= 15 ? 'flag' : 'zero'}">${p.app === p.officient ? '0' : (p.app > p.officient ? '+' : '−') + fmt.hours2(Math.abs(p.app - p.officient))}</td>
        <td class="off-days">${p.differ.length ? `<details><summary>${plural(p.differ.length, 'dag', 'dagen')}</summary><ul class="plain-list">${p.differ.map(d =>
          `<li>${esc(dayName(d.date))}: geklokt ${fmt.hours2(d.app)} · Officient ${fmt.hours2(d.officient)}${d.events.length ? ` <span class="muted">(${esc(d.events.join(', '))})</span>` : ''}</li>`).join('')}</ul></details>`
          : '<span class="muted">Geen</span>'}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="muted small" style="margin-top:8px">Uren in decimalen. "In Officient" is per dag het rooster, min afwezigheden, plus overuren. Een feestdag telt als 0: betaald, maar niet gewerkt.</p>
    <div class="form-actions"><button class="primary sm" id="off-push">Naar Officient sturen…</button></div>`
      : '<p class="empty">Geen uren in Officient of in de app voor deze maand.</p>'}
    ${unlinked.length ? `<p class="hint warn">Geklokt, maar niet gekoppeld met Officient: ${unlinked.map(esc).join(', ')}.</p>` : ''}
    ${cal.types.length ? `<p class="muted small">Soorten in je Officient-kalender: ${cal.types.filter(t => t.active).map(t =>
      `${esc(t.name)} (${OFF_KINDS[t.interpretation] || esc(t.interpretation || '?')}${t.securex ? `, Securex-code ${esc(t.securex)}` : ''})`).join(', ')}.</p>` : ''}`;
}

// Officient's reasons for refusing a day, in Dutch where we know them.
const offReason = r => /lock/i.test(r) ? 'de maand is al verwerkt en vergrendeld'
  : /no contract is active/i.test(r) ? 'Officient kent op die dag geen tewerkstelling (met Dimona); maak die eerst aan in Officient'
  : /too much time off/i.test(r) ? 'er staat al te veel afwezigheid' : r;

// Make Officient count the month's clocked hours, the way the manager did by
// hand, after a look at every change.
function pushHoursModal(m, people, sx, again) {
  const staff = id => (S.staff || []).find(p => p.id === id) || {};
  const ym = toDateInput(m).slice(0, 7);
  const dayName = date => fmt.day(new Date(date + 'T00:00'));
  const warn = [];
  if (addMonths(m, 1) > now()) warn.push('De maand is nog niet voorbij. Je kan later opnieuw sturen; de app past dan aan wat veranderde, niets dubbel.');
  if (sx.pending) warn.push(`${plural(sx.pending, 'aanpassing wacht', 'aanpassingen wachten')} nog bij Aanvragen. Die uren gaan pas mee als je ze goedkeurt.`);
  if (sx.open) warn.push(`${plural(sx.open, 'persoon is', 'mensen zijn')} nog ingeklokt. Die shift gaat pas mee na het uitklokken.`);
  modal.open(`
    <h2 id="modal-title">Uren naar Officient · ${esc(fmt.month(m))}</h2>
    <p>Officient geeft zijn kalender door aan Securex. De app past die aan zoals jij dat nu met de hand doet, maar per dag: werkte iemand minder dan ingeroosterd, dan komt er voor de rest een <strong>Gewettigde Afwezigheid</strong>; werkte iemand meer, dan krijgt die dag meer uren. Feestdagen, verlof en ziekte blijven zoals ze zijn. Daarna verstuur jij in Officient de prestaties naar Securex, zoals nu.</p>
    ${warn.length ? `<div class="hint warn"><ul class="warn-list">${warn.map(w => `<li>${w}</li>`).join('')}</ul></div>` : ''}
    <div id="push-plan"><p class="muted">Officient wordt gelezen…</p></div>
    <p class="form-error" id="push-err"></p>
    <div class="form-actions"><button type="button" data-close>Annuleren</button><button type="button" class="primary" id="push-go" disabled>Versturen</button></div>`, async d => {
    const out = $('#push-plan', d), go = $('#push-go', d);
    let res;
    try {
      res = await officientCall({ action: 'hours', dry: true, month: ym, people: people.map(p => ({ staff_id: p.id, zero: true })) });
    } catch (e) { out.innerHTML = `<p class="hint bad">${esc(e.message)}</p>`; return; }
    const absence = res.absence || 'Gewettigde Afwezigheid';
    const before = new Map(people.map(p => [p.id, p.officient]));
    const list = res.people.filter(p => p.steps.length);
    if (!list.length) { out.innerHTML = '<p class="hint info">Officient telt al wat er geklokt werd. Er is niets te veranderen.</p>'; return; }
    const line = s => `<li>${esc(dayName(s.date))}: geklokt ${fmt.hours2(s.worked)} · Officient ${fmt.hours2(s.before)} → ${
      s.action === 'raise' ? `de dag krijgt ${fmt.hours2(s.worked)} u`
      : s.action === 'absent' ? `${fmt.hours2(s.minutes)} u ${esc(absence)}`
      : s.action === 'clear' ? `${esc(absence)} eraf`
      : `<span class="pill warn">niet aangepast</span> ${esc(s.why === 'holiday' ? holidayLabel(s.date) : s.why)}, kijk dit zelf na`}</li>`;
    const active = (p, zero) => zero ? p.steps : p.steps.filter(s => !s.unclocked);
    const summary = steps => {
      const n = a => steps.filter(s => s.action === a).length, parts = [];
      if (n('raise')) parts.push(`${plural(n('raise'), 'dag', 'dagen')} meer uren`);
      if (n('absent')) parts.push(`${plural(n('absent'), 'dag', 'dagen')} afwezig`);
      if (n('clear')) parts.push(`${plural(n('clear'), 'afwezigheid', 'afwezigheden')} eraf`);
      if (n('skip')) parts.push(`${n('skip')} niet aangepast`);
      return parts.length ? `<details><summary>${parts.join(' · ')}</summary><ul class="plain-list">${steps.map(line).join('')}</ul></details>` : '<span class="muted">Klopt al</span>';
    };
    out.innerHTML = `<div class="table-wrap"><table class="push-table">
      <thead><tr><th>Sturen</th><th>Naam</th><th class="num">Geklokt</th><th class="num">Officient nu</th><th class="num">Daarna</th></tr></thead>
      <tbody>${list.map(p => {
        const unclocked = p.steps.filter(s => s.unclocked).length;
        // the app only knows what was clocked: someone who hardly clocked would turn up absent everywhere
        const cmp = people.find(x => x.id === p.staff_id) || { days: [] };
        const clocked = cmp.days.filter(x => x.app > 0).length, planned = cmp.days.filter(x => x.officient > 0).length;
        p.none = !clocked;
        p.few = clocked && clocked < planned / 2;
        return `<tr data-push="${p.staff_id}">
        <td><input type="checkbox" class="push-on" aria-label="${esc(p.name)} sturen"></td>
        <td><strong>${esc(p.name)}</strong>${p.contract_type ? ` <span class="muted small">${CONTRACT_SHORT[p.contract_type]}</span>` : ''}
          ${p.none ? '<div class="hint warn small">Niets geklokt in de app deze maand: de app weet niet wat er gewerkt werd.</div>'
            : unclocked ? `<label class="check small"><input type="checkbox" class="push-zero" ${HOURLY.includes(p.contract_type || staff(p.staff_id).contract_type) && !p.few ? 'checked' : ''}> ${plural(unclocked, 'dag', 'dagen')} zonder inklokken: afwezig</label>
              ${p.few ? `<div class="hint warn small">Maar ${plural(clocked, 'dag', 'dagen')} geklokt, tegenover ${planned} ingeroosterd. Zet afwezig alleen aan als dat klopt.</div>` : ''}` : ''}</td>
        <td class="num" data-label="Geklokt">${fmt.hours2(people.find(x => x.id === p.staff_id)?.app || 0)}</td>
        <td class="num" data-label="Officient nu">${fmt.hours2(before.get(p.staff_id) || 0)}</td>
        <td class="num push-after" data-label="Daarna"></td></tr>
        <tr class="push-detail" data-detail="${p.staff_id}"><td colspan="5" class="push-what"></td></tr>`; }).join('')}</tbody>
    </table></div>
    <p class="muted small">Zonder inklokken: dagen waarop Officient iemand ingeroosterd heeft, zonder geklokte uren. Aan voor wie per uur werkt (die dag niet gewerkt); laat het uit als iemand vergat in te klokken.</p>`;
    const update = tr => {
      const p = list.find(x => x.staff_id === tr.dataset.push), zero = !!($('.push-zero', tr) || {}).checked;
      const steps = p.none ? [] : active(p, zero), real = steps.filter(s => s.action !== 'skip');
      $('.push-after', tr).textContent = fmt.hours2((before.get(p.staff_id) || 0) + real.reduce((a, s) => a + s.worked - s.before, 0));
      $(`tr[data-detail="${p.staff_id}"] .push-what`, d).innerHTML = summary(steps);
      const on = $('.push-on', tr);
      on.disabled = !real.length;
      if (!real.length) on.checked = false;
      return real.length;
    };
    for (const tr of $$('tr[data-push]', d)) {
      $('.push-on', tr).checked = update(tr) > 0;
      const zero = $('.push-zero', tr);
      if (zero) zero.addEventListener('change', () => { $('.push-on', tr).checked = update(tr) > 0; });
    }
    go.disabled = false;
    go.addEventListener('click', () => {
      const chosen = $$('tr[data-push]', d).filter(tr => $('.push-on', tr).checked)
        .map(tr => ({ staff_id: tr.dataset.push, zero: !!($('.push-zero', tr) || {}).checked }));
      if (!chosen.length) { $('#push-err', d).textContent = 'Duid minstens één persoon aan.'; return; }
      busy(go, async () => {
        const r = await officientCall({ action: 'hours', month: ym, people: chosen });
        const ok = r.people.filter(p => p.done), bad = r.people.filter(p => p.failed.length);
        modal.close();
        toast(ok.length ? `In Officient aangepast: ${ok.map(p => `${p.name} (${plural(p.done, 'dag', 'dagen')})`).join(', ')}.` : 'Er werd niets veranderd.');
        again(bad.length ? `<div class="hint bad"><strong>Officient weigerde</strong><ul class="warn-list">${bad.map(p => {
          const why = new Map();
          for (const f of p.failed) why.set(offReason(f.reason), [...(why.get(offReason(f.reason)) || []), f.date]);
          return `<li>${esc(p.name)}: ${[...why].map(([r, dates]) => `${esc(r)} (${dates.map(x => esc(dayName(x))).join(', ')})`).join('; ')}</li>`;
        }).join('')}</ul></div>` : '');
      }).catch(e => { $('#push-err', d).textContent = e.message; });
    });
  }, { wide: true });
}

function bindSecurex(el, m, sx) {
  const ym = `${m.getFullYear()}-${pad(m.getMonth() + 1)}`;
  const cal = $('#off-cal', el);
  const compare = async (note = '') => {
    const out = $('#off-cal-out', el);
    try {
      out.innerHTML = note + officientCompare(await officientCall({ action: 'calendar', month: ym }), sx.rows);
      const push = $('#off-push', out);
      if (push) push.addEventListener('click', () => pushHoursModal(m, officientCompare.people, sx, n => busy(cal, () => compare(n)).catch(() => {})));
    } catch (e) {
      out.innerHTML = `<p class="hint bad">${esc(e.message)}</p>`;
    }
  };
  cal.addEventListener('click', () => busy(cal, () => compare()));
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

/* ------------------------------------------------------ people into Officient */

const PERSON_LABEL = { phone: 'telefoon', email: 'e-mail', birth_date: 'geboortedatum', national_id: 'rijksregisternummer', iban: 'rekeningnummer', address: 'adres' };
const PERSON_ORDER = ['national_id', 'birth_date', 'address', 'iban', 'email', 'phone'];
// A detail as people read it, from the app or from Officient.
function personValue(key, v) {
  if (!v) return '<span class="muted">–</span>';
  if (key === 'birth_date') return esc(isoToDMY(String(v).slice(0, 10)));
  if (key === 'national_id') { const d = String(v).replace(/\D/g, ''); return esc(d.length === 11 ? `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4, 6)}-${d.slice(6, 9)}.${d.slice(9)}` : v); }
  if (key === 'iban') return esc(String(v).replace(/\s/g, '').replace(/(.{4})(?=.)/g, '$1 '));
  return esc(v);
}

// Someone's details next to Officient's; the ones ticked go to Officient.
function personOfficientModal(p) {
  modal.open(`
    <h2 id="modal-title">${esc(p.name)} · Officient</h2>
    <p>Officient is wat Securex gebruikt. Hier zie je de gegevens in de app naast die in Officient. Duid aan wat de app naar Officient stuurt.</p>
    <div id="po-list"><p class="muted">Officient wordt gelezen…</p></div>
    <p class="form-error" id="po-err"></p>
    <div class="form-actions"><button type="button" data-close>Annuleren</button><button type="button" class="primary" id="po-go" disabled>Naar Officient sturen</button></div>`, async d => {
    const out = $('#po-list', d), go = $('#po-go', d);
    let r;
    try { r = await officientCall({ action: 'person', staff: p.id, dry: true }); }
    catch (e) { out.innerHTML = `<p class="hint bad">${esc(e.message)}</p>`; return; }
    const fields = PERSON_ORDER.map(k => r.fields.find(f => f.key === k)).filter(Boolean);
    // official details Officient already has stay unticked unless they were changed in the app
    const tick = f => f.differs && f.app && (f.pending || !f.officient || f.key === 'phone' || f.key === 'email');
    out.innerHTML = `${r.officient_name && r.officient_name !== p.name ? `<p class="muted small">In Officient: ${esc(r.officient_name)}</p>` : ''}
      <div class="table-wrap"><table class="po-table">
        <thead><tr><th></th><th>Gegeven</th><th>In de app</th><th>In Officient</th></tr></thead>
        <tbody>${fields.map(f => `<tr class="${f.differs ? 'is-diff' : ''}">
          <td>${f.differs && f.app ? `<input type="checkbox" data-po="${f.key}" ${tick(f) ? 'checked' : ''} aria-label="${PERSON_LABEL[f.key]} sturen">` : ''}</td>
          <td>${PERSON_LABEL[f.key]}${f.pending ? ' <span class="pill warn">aangepast in de app</span>' : ''}</td>
          <td>${personValue(f.key, f.app)}</td><td>${f.differs ? personValue(f.key, f.officient) : '<span class="muted">hetzelfde</span>'}</td></tr>`).join('')}</tbody>
      </table></div>
      ${fields.some(f => f.differs && f.app) ? '' : '<p class="hint info">Officient heeft dezelfde gegevens. Er is niets te sturen.</p>'}`;
    go.disabled = !fields.some(f => f.differs && f.app);
    go.addEventListener('click', () => {
      const keys = $$('[data-po]', d).filter(x => x.checked).map(x => x.dataset.po);
      if (!keys.length) { $('#po-err', d).textContent = 'Duid minstens één gegeven aan.'; return; }
      busy(go, async () => {
        await officientCall({ action: 'person', staff: p.id, fields: keys });
        modal.close();
        toast(`In Officient aangepast: ${keys.map(k => PERSON_LABEL[k]).join(', ')}.`);
        renderView();
      }).catch(e => { $('#po-err', d).textContent = e.message; });
    });
  }, { wide: true });
}

// Someone in the app who isn't in Officient yet: added there with their details.
function personAddModal(p, pr) {
  const has = { email: pr.email, phone: pr.phone, birth_date: pr.birth_date, national_id: pr.national_id, iban: pr.iban, address: pr.street };
  const known = PERSON_ORDER.filter(k => has[k]), missing = PERSON_ORDER.filter(k => !has[k]);
  modal.open(`
    <h2 id="modal-title">${esc(p.name)} in Officient aanmaken</h2>
    <form id="pa-form" novalidate>
      <div class="field"><label for="pa-name">Volledige naam in Officient</label><input id="pa-name" maxlength="120" value="${esc(p.name)}">
        <span class="help">Voornaam en achternaam, zoals op de identiteitskaart.</span></div>
      <p style="margin-top:12px">${known.length ? `Gaat mee: ${known.map(k => PERSON_LABEL[k]).join(', ')}.` : 'Er staan nog geen gegevens in het profiel.'}
        ${missing.length ? `<span class="muted">Nog niet in het profiel: ${missing.map(k => PERSON_LABEL[k]).join(', ')}.</span>` : ''}</p>
      <p class="muted small">Officient maakt alleen de persoon aan. Het contract, het loon en de tewerkstelling (met de Dimona) doe je daarna in Officient.</p>
      <p class="form-error" id="pa-err"></p>
      <div class="form-actions"><button type="button" data-close>Annuleren</button><button type="submit" class="primary">In Officient aanmaken</button></div>
    </form>`, d => {
    $('#pa-form', d).addEventListener('submit', ev => {
      ev.preventDefault();
      const name = $('#pa-name', d).value.trim();
      if (name.split(/\s+/).length < 2) { $('#pa-err', d).textContent = 'Vul de voornaam en de achternaam in.'; return; }
      busy($('button[type=submit]', d), async () => {
        const r = await officientCall({ action: 'person_add', staff: p.id, name });
        modal.close();
        if (r.error) toast(`${r.name} staat in Officient, maar de rest van de gegevens nam Officient niet aan: ${r.error}`, 'error');
        else toast(`${r.name} staat nu in Officient, met de gegevens uit het profiel.`);
        renderView();
      }).catch(e => { $('#pa-err', d).textContent = e.message; });
    });
  });
}

/* ------------------------------------------------------------ student contracts */

// The employer's details on every student contract, as Securex's model asks them.
const CONTRACT_INFO = [
  ['employer', 'Werkgever (naam van de vennootschap)', 'bv. XIN SEN BV'],
  ['employer_address', 'Adres van de werkgever', 'straat, postcode en gemeente'],
  ['vat', 'Ondernemingsnummer (btw)', 'bv. BE 0472.229.850'],
  ['phone', 'Telefoon van de zaak', 'bv. 051 54 68 51'],
  ['representative', 'Vertegenwoordigd door', 'wie tekent voor de werkgever'],
  ['work_address', 'Plaats van het werk', 'adres van de zaak'],
  ['notify', 'Te verwittigen bij ziekte of ongeval', 'naam en telefoon'],
  ['first_aid', 'Eerste hulp bij ongeval door', 'naam'],
  ['first_aid_kit', 'De verbandkist bevindt zich…', 'bv. in de berging naast de keuken'],
  ['prevention', 'Dienst voor preventie en bescherming', 'naam en adres'],
  ['prevention_phone', 'Telefoon van die dienst', ''],
  ['inspection', 'Toezicht op de sociale wetten', 'adres en telefoon, op meerdere regels', true],
  ['committee', 'Paritair comité', 'bv. 302'],
  ['place', 'Contracten opgemaakt te', 'gemeente'],
];
const CONTRACT_MISSING = { birth_date: 'geboortedatum', address: 'adres', iban: 'rekeningnummer', hourly_rate: 'uurloon' };
const CONTRACT_OPTIONS = [['', 'Geen keuze'], ['vast', 'Vast uurrooster'], ['vast4', 'Vast uurrooster, minimum 4 uur per prestatie'],
  ['vast_variabel', 'Vast arbeidsregime en variabel uurrooster'], ['variabel', 'Variabel arbeidsregime en variabel uurrooster']];
const lastDay = m => addDays(addMonths(m, 1), -1);
const toBase64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

// Every student and their contract for one month: written from the planning
// on Securex's model, kept with their contracts, and put in Officient with
// the hours planned.
async function viewContracts(el, current) {
  if (!S.month) S.month = nextMonth();
  const m = S.month;
  const r = await rpc('mgr_student_contracts', { p_month: toDateInput(m) });
  if (!current()) return;
  const info = r.info || {}, ready = !!(info.employer && info.representative);
  const pills = c => [
    c.officient_sent_at ? `<span class="pill on">In Officient</span>` : '',
    c.signature_requested_at ? `<span class="pill">Ter ondertekening sinds ${fmt.short(c.signature_requested_at)}</span>` : '',
    c.officient_hours_at ? `<span class="pill on">Uren in Officient</span>` : ''].join(' ');
  const row = p => {
    const c = p.contract;
    return `<div class="row ct-row" data-student="${p.staff_id}">
      <div class="row-main">
        <span class="row-title">${miniPic(p)} ${esc(p.name)}</span>
        <span class="row-sub">${p.planned_minutes ? `${fmt.hours2(p.planned_minutes)} u gepland op ${plural(p.planned_days, 'dag', 'dagen')}` : 'Nog niets gepland'}
          ${c ? ` · contract ${fmt.short(c.starts_on)} – ${fmt.short(c.ends_on)}${c.hours != null ? `, ${num(Number(c.hours))} u` : ''}` : ''}</span>
        ${p.missing.length ? `<span class="row-sub"><span class="pill warn">Ontbreekt: ${p.missing.map(k => CONTRACT_MISSING[k]).join(', ')}</span> <a href="#team/${p.staff_id}">Aanvullen</a></span>` : ''}
        ${c ? `<span class="row-sub">${pills(c)}</span>` : ''}
        ${!p.officient_id ? `<span class="row-sub"><span class="muted small">Nog niet in Officient.</span> <a href="#team/${p.staff_id}">Aanmaken bij de persoon</a></span>` : ''}
      </div>
      <div class="row-actions">
        ${c ? `<button class="sm" data-ct-dl="${c.id}">Downloaden</button>` : ''}
        <button class="sm${c ? '' : ' primary'}" data-ct-make>${c ? 'Opnieuw maken' : 'Contract maken'}</button>
        ${c && p.officient_id ? `<button class="sm" data-ct-send>${c.officient_sent_at ? 'Laten ondertekenen' : 'Naar Officient'}…</button>
          <button class="sm" data-ct-hours>Uren in Officient…</button>` : ''}
      </div></div>`;
  };
  el.innerHTML = `
    <div class="view-head">
      <div><button class="link back" id="back">‹ Planning</button><h1>Studentencontracten</h1>
        <p>Een contract per student, op het model van Securex, met de shiften uit de planning als uurrooster. De app zet het in Officient om te laten ondertekenen, en de geplande uren in de kalender van Officient.</p></div>
      ${periodBar(fmt.month(m), plural(r.students.length, 'student', 'studenten'), 'mo-prev', 'mo-next')}
    </div>
    ${ready ? '' : '<p class="hint warn">Vul eerst onderaan de gegevens van de zaak in: die staan op elk contract.</p>'}
    <section class="card">
      ${r.students.length ? `<div class="rows">${r.students.map(row).join('')}</div>`
        : '<p class="empty">Niemand met het statuut Student. Kies het statuut bij Team → (persoon) → Werk en loon.</p>'}
      <p class="hint info" style="margin-top:12px">De tewerkstelling met de Dimona maak je nog zelf in Officient: dat kan de app niet. Zet de geplande uren in Officient nadat die er is; Officient neemt geen uren aan op dagen zonder tewerkstelling.</p>
    </section>
    <section class="card">
      <details id="ct-info" ${ready ? '' : 'open'}><summary><h2 style="display:inline">Gegevens van de zaak</h2> <span class="muted small">op elk contract</span></summary>
      <form id="ct-info-form" class="form-grid" novalidate style="margin-top:12px">
        ${CONTRACT_INFO.map(([k, label, ph, multi]) => `<div class="field${multi ? ' wide' : ''}"><label for="ci-${k}">${label}</label>
          ${multi ? `<textarea id="ci-${k}" rows="4" maxlength="400" placeholder="${esc(ph)}">${esc(info[k] || '')}</textarea>`
                  : `<input id="ci-${k}" maxlength="160" placeholder="${esc(ph)}" value="${esc(info[k] || '')}">`}</div>`).join('')}
        <p class="form-error wide" id="ci-err"></p>
        <div class="form-actions wide"><button type="submit" class="primary">Opslaan</button></div>
      </form></details>
    </section>`;
  $('#back', el).addEventListener('click', () => { S.month = m; location.hash = 'schedule'; });
  $('#mo-prev', el).addEventListener('click', () => { S.month = addMonths(m, -1); renderView(); });
  $('#mo-next', el).addEventListener('click', () => { S.month = addMonths(m, 1); renderView(); });
  const student = btn => r.students.find(p => p.staff_id === btn.closest('[data-student]').dataset.student);
  $$('[data-ct-dl]', el).forEach(b => b.addEventListener('click', () => downloadContract(b.dataset.ctDl, b)));
  $$('[data-ct-make]', el).forEach(b => b.addEventListener('click', () => {
    if (!ready) { toast('Vul eerst de gegevens van de zaak in.', 'error'); $('#ct-info', el).open = true; return; }
    contractModal(student(b), m, info);
  }));
  $$('[data-ct-send]', el).forEach(b => b.addEventListener('click', () => sendContractModal(student(b))));
  $$('[data-ct-hours]', el).forEach(b => b.addEventListener('click', () => contractHoursModal(student(b))));
  $('#ct-info-form', el).addEventListener('submit', async ev => {
    ev.preventDefault();
    const btn = $('button[type=submit]', ev.target);
    const out = Object.fromEntries(CONTRACT_INFO.map(([k]) => [k, $(`#ci-${k}`, el).value.trim()]));
    if (!out.employer || !out.representative) { $('#ci-err', el).textContent = 'Vul minstens de werkgever en wie tekent in.'; return; }
    await busy(btn, async () => {
      await rpc('mgr_save_contract_info', { p_info: out });
      toast('Gegevens opgeslagen.');
      renderView();
    }).catch(e => { $('#ci-err', el).textContent = e.message; });
  });
}

// Write one student's contract: the period, what they do and the hours come
// from the planning; a preview opens the PDF, saving keeps it with their contracts.
function contractModal(p, m, info) {
  const today = startOfDay(now());
  const from0 = m < today && today <= lastDay(m) ? today : m;
  modal.open(`
    <h2 id="modal-title">Studentencontract · ${esc(p.name)}</h2>
    <form id="ctm-form" class="form-grid ct-form" novalidate>
      <div class="field"><label for="ctm-from">Van</label><input type="date" id="ctm-from" value="${toDateInput(from0)}"></div>
      <div class="field"><label for="ctm-to">Tot en met</label><input type="date" id="ctm-to" value="${toDateInput(lastDay(m))}"></div>
      <div class="field"><label for="ctm-function">Hoedanigheid</label><input id="ctm-function" maxlength="80" placeholder="bv. Bediening"></div>
      <div class="field span2"><label for="ctm-tasks">De prestaties bestaan uit</label><input id="ctm-tasks" maxlength="300" placeholder="bv. bediening en afruimen"></div>
      <div class="field"><label for="ctm-hours">Geschat aantal uren</label><input type="number" id="ctm-hours" min="0" max="2000" step="0.25"></div>
      <div class="field"><label for="ctm-rate">Bruto uurloon (€)</label><input type="number" id="ctm-rate" min="0" max="200" step="0.01"></div>
      <div class="field"><label for="ctm-regime">Prestaties</label><select id="ctm-regime"><option value="deeltijds">Deeltijds</option><option value="voltijds">Voltijds</option></select></div>
      <div class="field span2"><label for="ctm-option">Deeltijdse optie</label><select id="ctm-option">${CONTRACT_OPTIONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
      <div class="field"><label for="ctm-weekly">Uren per week <span class="muted">(als dat moet)</span></label><input type="number" id="ctm-weekly" min="0" max="60" step="0.5"></div>
      <div class="field span2"><label for="ctm-contingent">Eerst gebruiken</label><select id="ctm-contingent"><option value="uren">Het contingent van 650 uren studentenarbeid</option><option value="dagen">Het contingent van dagen occasionele arbeid</option></select></div>
      <div class="field"><label for="ctm-place">Opgemaakt te</label><input id="ctm-place" maxlength="60" value="${esc(info.place || '')}"></div>
      <div class="field"><label for="ctm-sign">Op</label><input type="date" id="ctm-sign" value="${toDateInput(today)}"></div>
      <div class="wide" id="ctm-plan"><p class="muted">De planning wordt gelezen…</p></div>
      <p class="form-error wide" id="ctm-err"></p>
      <div class="form-actions wide"><button type="button" data-close>Annuleren</button><button type="button" id="ctm-preview">Voorbeeld</button><button type="submit" class="primary">Opslaan</button></div>
    </form>`, d => {
    let draft = null, hoursTouched = false;
    const v = id => $(`#ctm-${id}`, d).value;
    $('#ctm-hours', d).addEventListener('input', () => { hoursTouched = true; });
    const load = async () => {
      $('#ctm-err', d).textContent = '';
      try {
        draft = await rpc('mgr_student_contract_draft', { p_staff_id: p.staff_id, p_from: v('from'), p_to: v('to') });
      } catch (e) { $('#ctm-err', d).textContent = e.message; return; }
      const minutes = draft.shifts.reduce((a, x) => a + x.minutes, 0);
      if (!hoursTouched) $('#ctm-hours', d).value = Math.round(minutes / 15) / 4;
      $('#ctm-plan', d).innerHTML = `
        ${draft.missing.length ? `<p class="hint warn">Nog niet in het profiel: ${draft.missing.map(k => CONTRACT_MISSING[k]).join(', ')}. Het contract krijgt daar "…". <a href="#team/${p.staff_id}">Profiel aanvullen</a></p>` : ''}
        <details><summary>${draft.shifts.length ? `${plural(draft.shifts.length, 'shift', 'shiften')} gepland, ${fmt.hours2(minutes)} u: die komen als uurrooster in bijlage` : 'Nog geen shiften gepland in deze periode'}</summary>
          <ul class="plain-list">${draft.shifts.map(x => `<li>${esc(fmt.day(new Date(x.date + 'T00:00')))}: ${x.start} – ${x.end}${x.label ? ` · ${esc(x.label)}` : ''}</li>`).join('')}</ul></details>`;
      return draft;
    };
    load().then(dr => {
      if (!dr) return;
      const last = dr.last || {};
      $('#ctm-function', d).value = last.function || '';
      $('#ctm-tasks', d).value = last.tasks || '';
      $('#ctm-rate', d).value = dr.student.hourly_rate ?? last.rate ?? '';
      $('#ctm-regime', d).value = last.regime || 'deeltijds';
      $('#ctm-option', d).value = last.option || '';
      $('#ctm-weekly', d).value = last.weekly ?? '';
      $('#ctm-contingent', d).value = last.contingent || 'uren';
    });
    for (const id of ['from', 'to']) $(`#ctm-${id}`, d).addEventListener('change', () => { hoursTouched = false; load(); });
    const details = () => ({
      function: v('function').trim(), tasks: v('tasks').trim(), hours: v('hours') === '' ? null : Number(v('hours')),
      rate: v('rate') === '' ? null : Number(v('rate')), regime: v('regime'), option: v('option') || null,
      weekly: v('weekly') === '' ? null : Number(v('weekly')), contingent: v('contingent'), place: v('place').trim(), sign_date: v('sign'),
    });
    const pdf = async () => {
      if (!draft) throw new Error('De planning is nog niet gelezen.');
      const x = details();
      if (!x.function) throw new Error('Vul de hoedanigheid in, bv. Bediening.');
      if (!v('from') || !v('to') || v('to') < v('from')) throw new Error('De einddatum moet na de begindatum liggen.');
      if (x.sign_date > v('from')) throw new Error('Het contract wordt ondertekend vóór de eerste werkdag.');
      return StudentContract.build({ ...x, info, student: draft.student, from: v('from'), to: v('to'), shifts: draft.shifts });
    };
    // the page's security policy keeps a PDF from opening in a tab of its own, so the preview is a download
    $('#ctm-preview', d).addEventListener('click', ev => busy(ev.currentTarget, async () => {
      saveBlob(`voorbeeld-contract-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`, new Blob([await pdf()], { type: 'application/pdf' }));
    }).catch(e => { $('#ctm-err', d).textContent = e.message; }));
    $('#ctm-form', d).addEventListener('submit', ev => {
      ev.preventDefault();
      busy($('button[type=submit]', d), async () => {
        const bytes = await pdf();
        await rpc('mgr_save_student_contract', { p_staff_id: p.staff_id, p_from: v('from'), p_to: v('to'), p_details: details(),
                                                 p_data: toBase64(bytes), p_replace: p.contract ? p.contract.id : null });
        modal.close();
        toast(`Contract voor ${p.name} opgeslagen. ${p.name} kan het downloaden bij Profiel.`);
        renderView();
      }).catch(e => { $('#ctm-err', d).textContent = e.message; });
    });
  }, { wide: true });
}

// A student contract into Officient, and Officient e-mails the student to sign it.
function sendContractModal(p) {
  const c = p.contract;
  modal.open(`
    <h2 id="modal-title">Naar Officient · ${esc(p.name)}</h2>
    <p>${c.officient_sent_at ? `Het contract staat al bij ${esc(p.name)} in Officient.` : `De app zet het contract bij ${esc(p.name)} in Officient, bij de contracten.`}</p>
    <label class="check"><input type="checkbox" id="cts-sign" ${p.email || c.officient_sent_at ? 'checked' : ''}> Laten ondertekenen: Officient mailt ${esc(p.name)} om te tekenen</label>
    <p class="muted small">Officient gebruikt het e-mailadres dat het zelf van ${esc(p.name)} heeft.${c.signature_requested_at ? ` Er werd al gevraagd op ${fmt.short(c.signature_requested_at)}; opnieuw vragen stuurt een nieuwe mail.` : ''}</p>
    <p class="form-error" id="cts-err"></p>
    <div class="form-actions"><button type="button" data-close>Annuleren</button><button type="button" class="primary" id="cts-go">${c.officient_sent_at ? 'Versturen' : 'Naar Officient'}</button></div>`, d => {
    const go = $('#cts-go', d);
    go.addEventListener('click', () => busy(go, async () => {
      const sign = $('#cts-sign', d).checked;
      if (c.officient_sent_at && !sign) { modal.close(); return; }
      const res = await officientCall({ action: 'contract', contract: c.id, sign });
      modal.close();
      if (res.signature_error) toast(`In Officient gezet, maar ondertekenen lukte niet: ${res.signature_error}`, 'error');
      else toast(sign ? `In Officient gezet. ${p.name} krijgt een mail om te tekenen.` : 'In Officient gezet.');
      renderView();
    }).catch(e => { $('#cts-err', d).textContent = e.message; }));
  });
}

// The hours planned for the contract's period into Officient's calendar, after a look.
function contractHoursModal(p) {
  const c = p.contract;
  const dayName = date => fmt.day(new Date(date + 'T00:00'));
  modal.open(`
    <h2 id="modal-title">Uren in Officient · ${esc(p.name)}</h2>
    <p>De app zet per dag de geplande uren in de kalender van Officient, van ${fmt.short(c.starts_on)} tot ${fmt.short(c.ends_on)}: de uren van de shiften, en 0 op de andere dagen. Feestdagen en afwezigheden blijven zoals ze zijn. Na de maand past <strong>Naar Officient sturen</strong> (bij Overzicht) ze aan aan wat geklokt werd.</p>
    <div id="cth-plan"><p class="muted">Officient wordt gelezen…</p></div>
    <p class="form-error" id="cth-err"></p>
    <div class="form-actions"><button type="button" data-close>Annuleren</button><button type="button" class="primary" id="cth-go" disabled>In Officient zetten</button></div>`, async d => {
    const out = $('#cth-plan', d), go = $('#cth-go', d);
    let plan;
    try { plan = await officientCall({ action: 'contract_hours', contract: c.id, dry: true }); }
    catch (e) { out.innerHTML = `<p class="hint bad">${esc(e.message)}</p>`; return; }
    const sets = plan.steps.filter(x => x.action === 'set'), skips = plan.steps.filter(x => x.action === 'skip');
    if (!sets.length) {
      out.innerHTML = `<p class="hint info">Officient heeft de geplande uren al.</p>${skips.length ? `<p class="muted small">Niet aangepast: ${skips.map(x => esc(dayName(x.date))).join(', ')}.</p>` : ''}`;
      return;
    }
    out.innerHTML = `<details open><summary>${plural(sets.length, 'dag', 'dagen')} aanpassen</summary><ul class="plain-list">${plan.steps.map(x =>
      `<li>${esc(dayName(x.date))}: ${x.action === 'set' ? `${fmt.hours2(x.planned)} u <span class="muted">(nu ${fmt.hours2(x.before)})</span>`
        : `<span class="pill warn">niet aangepast</span> ${esc(x.why === 'holiday' ? holidayLabel(x.date) : x.why)}, gepland ${fmt.hours2(x.planned)} u`}</li>`).join('')}</ul></details>`;
    go.disabled = false;
    go.addEventListener('click', () => busy(go, async () => {
      const res = await officientCall({ action: 'contract_hours', contract: c.id });
      if (res.failed.length) {
        const why = new Map();
        for (const f of res.failed) why.set(offReason(f.reason), [...(why.get(offReason(f.reason)) || []), f.date]);
        out.innerHTML = `<div class="hint bad"><strong>Officient weigerde ${plural(res.failed.length, 'dag', 'dagen')}</strong><ul class="warn-list">${[...why].map(([r, dates]) =>
          `<li>${esc(r)}: ${dates.map(x => esc(dayName(x))).join(', ')}</li>`).join('')}</ul></div>${res.done ? `<p>${plural(res.done, 'dag', 'dagen')} wel aangepast.</p>` : ''}`;
        go.hidden = true;
        renderView();
        return;
      }
      modal.close();
      toast(`Geplande uren van ${p.name} in Officient gezet (${plural(res.done, 'dag', 'dagen')}).`);
      renderView();
    }).catch(e => { $('#cth-err', d).textContent = e.message; }));
  }, { wide: true });
}

/* ------------------------------------------------------------ payslips */

const fmtSize = n => n >= 1048576 ? `${num(n / 1048576, 1)} MB` : `${Math.max(1, Math.round(n / 1024))} kB`;

const downloadPayslip = (id, btn) => downloadFile('get_payslip', id, btn);
const downloadContract = (id, btn) => downloadFile('get_contract', id, btn);

// Hours as on a payslip: 56 u, 32,5 u.
const uren = h => `${Number(h).toLocaleString(loc(), { maximumFractionDigits: 2 })} ${T('u', '小时')}`;
const hasFigures = p => p && (p.hours_worked != null || p.gross_pay != null || p.net_pay != null);

// The month's documents: its payslip, and a recalculation, a correction or
// ecocheques that came with it.
function payDocs(pm) {
  const docs = pm.documents.length ? pm.documents : pm.payslip ? [{ id: pm.payslip.id, kind: 'Bezoldiging', payslip: true }] : [];
  if (pm.payslip && !docs.some(d => d.payslip)) docs.unshift({ id: pm.payslip.id, kind: 'Bezoldiging', payslip: true });
  const label = d => d.kind === 'Ecocheque' ? T('Ecocheques', '环保券')
    : docs.length > 1 && d.calculated_at ? `${T('Loonbrief', '工资单')} ${fmt.short(d.calculated_at)}` : T('Loonbrief', '工资单');
  return docs.map(d => `<button class="sm" data-payslip="${d.id}" title="${T('Downloaden', '下载')}">${esc(label(d))}</button>`).join('');
}

// What the month's payslip says, for the person themself on Mijn uren.
function payslipCard(pm) {
  if (!pm || !pm.payslip) return '';
  const p = pm.payslip, name = fmt.monthName(new Date(pm.month + 'T00:00'));
  if (!hasFigures(p)) return `
    <section class="card pay-card">
      <div class="card-head"><h2>${T(`Je loonbrief van ${name}`, `你${name}的工资单`)}</h2><div class="toolbar">${payDocs(pm)}</div></div>
    </section>`;
  const leave = Number(p.hours_leave);
  return `
    <section class="card pay-card">
      <div class="card-head"><h2>${T(`Volgens je loonbrief van ${name}`, `根据你${name}的工资单`)}</h2><div class="toolbar">${payDocs(pm)}</div></div>
      <div class="stats">
        ${p.hours_worked != null ? `<div class="stat good"><span class="v">${uren(p.hours_worked)}</span><span class="k">${T('Gewerkt', '工作')}${Number(p.days_worked) ? ` · ${T(plural(Number(p.days_worked), 'dag', 'dagen'), `${Number(p.days_worked)} 天`)}` : ''}</span></div>` : ''}
        <div class="stat"><span class="v">${fmt.money(p.gross_pay || 0)}</span><span class="k">${T('Bruto verdiend', '税前收入')}</span></div>
        <div class="stat"><span class="v">${fmt.money(p.net_pay || 0)}</span><span class="k">${T('Netto uitbetaald', '实发工资')}</span></div>
        ${leave ? `<div class="stat"><span class="v">${uren(leave)}</span><span class="k">${T('Betaald, niet gewerkt: feestdag of ziekte', '带薪未工作：节假日或病假')}</span></div>` : ''}
        ${p.ecocheques != null ? `<div class="stat"><span class="v">${fmt.money(p.ecocheques)}</span><span class="k">${T('Ecocheques', '环保券')}</span></div>` : ''}
      </div>
      ${pm.documents.length > 1 ? `<p class="muted small" style="margin-top:10px">${T('Deze maand werd meer dan eens berekend. De cijfers tellen alles samen: wat eerder al betaald werd, staat bij het netto.', '这个月的工资算了不止一次。数字是合计：之前已付的部分也算在实发里。')}</p>` : ''}
    </section>`;
}

// Per month: hours and pay from the payslips next to the hours clocked in the
// app, with a total per year: a table, and on a phone a list with the net
// first. open: the month shown above (Mijn uren).
function payMonthsTable(months, { open = null, clickable = false, clocked: showClocked = true } = {}) {
  const list = months.filter(x => x.payslip || x.clocked_minutes);
  if (!list.length) return '';
  const dash = '<span class="muted">—</span>';
  const clockedH = mins => uren(Math.round(mins / 6) / 10);
  const rows = [], items = [];
  const years = new Map();
  for (const x of list) years.set(x.month.slice(0, 4), [...(years.get(x.month.slice(0, 4)) || []), x]);
  for (const [year, ms] of years) {
    for (const x of ms) {
      const p = hasFigures(x.payslip) ? x.payslip : null;
      const v = {
        name: fmt.month(new Date(x.month + 'T00:00')), docs: x.payslip ? `<div class="pay-docs">${payDocs(x)}</div>` : '',
        hours: p && p.hours_worked != null ? uren(p.hours_worked) : null, gross: p ? fmt.money(p.gross_pay || 0) : null,
        net: p ? fmt.money(p.net_pay || 0) : null, clocked: x.clocked_minutes ? clockedH(x.clocked_minutes) : null,
      };
      const attrs = `class="${clickable ? 'clickable' : ''} ${x.month === open ? 'open' : ''}" ${clickable ? `data-pay-month="${x.month}" tabindex="0"` : ''}`;
      rows.push(`
        <tr ${attrs}>
          <td><strong>${v.name}</strong>${v.docs}</td>
          <td class="num">${v.hours || dash}</td><td class="num">${v.gross || dash}</td>
          <td class="num">${v.net || dash}</td>${showClocked ? `<td class="num">${v.clocked || dash}</td>` : ''}
        </tr>`);
      const sub = [v.hours && T(`${v.hours} gewerkt`, `工作 ${v.hours}`), v.gross && T(`bruto ${v.gross}`, `税前 ${v.gross}`),
        showClocked && v.clocked && T(`geklokt ${v.clocked}`, `打卡 ${v.clocked}`)].filter(Boolean);
      items.push(`
        <div ${attrs.replace('class="', 'class="pay-item ')}>
          <div class="pay-item-head"><strong>${v.name}</strong>${v.net ? `<span class="pay-net">${v.net}</span>` : ''}</div>
          ${sub.length ? `<div class="pay-item-sub">${sub.join(' · ')}</div>` : ''}${v.docs}
        </div>`);
    }
    const sum = k => ms.reduce((a, x) => a + (hasFigures(x.payslip) ? Number(x.payslip[k] || 0) : 0), 0);
    const clocked = ms.reduce((a, x) => a + Number(x.clocked_minutes || 0), 0);
    const total = T(`Totaal ${year}`, `${year} 年合计`);
    rows.push(`
        <tr class="pay-total"><td>${total}</td><td class="num">${uren(sum('hours_worked'))}</td>
          <td class="num">${fmt.money(sum('gross_pay'))}</td><td class="num">${fmt.money(sum('net_pay'))}</td>
          ${showClocked ? `<td class="num">${clocked ? clockedH(clocked) : dash}</td>` : ''}</tr>`);
    items.push(`
        <div class="pay-item pay-total">
          <div class="pay-item-head"><strong>${total}</strong><span class="pay-net">${fmt.money(sum('net_pay'))}</span></div>
          <div class="pay-item-sub">${T(`${uren(sum('hours_worked'))} gewerkt · bruto ${fmt.money(sum('gross_pay'))}`, `工作 ${uren(sum('hours_worked'))} · 税前 ${fmt.money(sum('gross_pay'))}`)}${showClocked && clocked ? T(` · geklokt ${clockedH(clocked)}`, ` · 打卡 ${clockedH(clocked)}`) : ''}</div>
        </div>`);
  }
  return `
    <div class="table-wrap only-wide-block"><table class="pay-table">
      <thead><tr><th>${T('Maand', '月份')}</th><th class="num">${T('Gewerkt', '工作')}</th><th class="num">${T('Bruto', '税前')}</th><th class="num">${T('Netto', '实发')}</th>${showClocked ? `<th class="num">${T('Geklokt', '打卡')}</th>` : ''}</tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table></div>
    <div class="pay-list only-phone-block">${items.join('')}</div>`;
}

function bindPayMonths(el) {
  $$('[data-payslip]', el).forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); downloadPayslip(b.dataset.payslip, b); }));
  $$('[data-pay-month]', el).forEach(tr => {
    const go = () => { S.month = new Date(tr.dataset.payMonth + 'T00:00'); renderView(); window.scrollTo(0, 0); };
    tr.addEventListener('click', go);
    tr.addEventListener('keydown', e => { if (e.target === tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go(); } });
  });
}

// Payslips uploaded by hand are read on the server; the app asks for it right after.
async function readPayslipsNow() {
  try { await officientCall({ action: 'read' }); } catch { /* the nightly run reads them too */ }
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
  if (!x.clock_out) f.push(`<span class="pill warn">${T('Nog ingeklokt', '还在上班')}</span>`);
  const sStart = x.shift ? x.shift.starts_at : x.shift_start;
  const sEnd = x.shift ? x.shift.ends_at : x.shift_end;
  if (sStart && new Date(x.clock_in) - new Date(sStart) > g) f.push(`<span class="pill bad">${T('Te laat', '迟到')}</span>`);
  if (sEnd && x.clock_out && new Date(sEnd) - new Date(x.clock_out) > g) f.push(`<span class="pill warn">${T('Vroeger vertrokken', '提前离开')}</span>`);
  if (x.pending) f.push(`<span class="pill accent">${T('Aanpassing wacht op goedkeuring', '修改等待审核')}</span>`);
  else if (x.edited) f.push(`<span class="pill">${T('Aangepast', '已修改')}</span>`);
  return f.join('');
}

function stamps(x) {
  return `<span class="stamp in"><b>${T('IN', '上')}</b>${fmt.time(x.clock_in)}</span>${x.clock_out
    ? `<span class="stamp out"><b>${T('UIT', '下')}</b>${fmt.time(x.clock_out)}${sameDay(x.clock_in, x.clock_out) ? '' : ' +1'}</span>`
    : `<span class="stamp open"><b>${T('UIT', '下')}</b>—</span>`}`;
}

async function viewHours(el, current) {
  S.month = S.month || startOfMonth(now());
  const m = S.month;
  const [data, months] = await Promise.all([
    rpc('my_hours', { p_from: m.toISOString(), p_to: addMonths(m, 1).toISOString() }),
    rpc('my_pay_months'),
  ]);
  const pm = months.find(x => x.month === toDateInput(m));
  if (!current()) return;
  const grace = S.settings.grace_minutes;
  const rate = data.hourly_rate != null ? Number(data.hourly_rate) : null;
  const done = data.entries.filter(x => x.clock_out);
  const mins = done.reduce((a, x) => a + minutesBetween(x.clock_in, x.clock_out), 0);
  const pendingReqs = data.requests.filter(r => r.status === 'pending');
  const decided = data.requests.filter(r => r.status !== 'pending');
  // who doesn't clock in sees their payslips; clocked times only if there are any
  const clocks = canClock() || data.entries.length > 0;
  el.innerHTML = `
    <div class="view-head">
      <div><h1>${T('Mijn uren', '我的工时')}</h1><p>${clocks ? T('Je urenkaart. Klopt er iets niet? Tik op <strong>Uren aanpassen</strong> en je verantwoordelijke keurt het goed.', '你的工时表。有不对的地方？点<strong>修改工时</strong>，负责人会审核。')
        : T('Wat je loonbrieven zeggen: de uren die je betaald kreeg, bruto en netto.', '你的工资单：发了工资的工时、税前和实发金额。')}</p></div>
      ${periodBar(fmt.month(m), sameDay(m, startOfMonth(now())) ? T('Deze maand', '本月') : '', 'mo-prev', 'mo-next')}
    </div>
    ${!clocks || (!data.entries.length && hasFigures(pm && pm.payslip)) ? '' : `<div class="stats">
      <div class="stat good"><span class="v">${fmt.dur(mins)}</span><span class="k">${T(`Geklokt · ${fmt.hours(mins)} uur`, `打卡 · ${fmt.hours(mins)} 小时`)}</span></div>
      <div class="stat"><span class="v">${rate != null ? fmt.money(mins / 60 * rate) : '—'}</span><span class="k">${rate != null ? T(`Verdiend (bruto) · ${fmt.money(rate)}/u`, `收入（税前）· ${fmt.money(rate)}/小时`) : T('Je verdiensten verschijnen zodra je verantwoordelijke je uurloon instelt', '负责人设置时薪后会显示你的收入')}</span></div>
      <div class="stat"><span class="v">${done.length}</span><span class="k">${isDriver() ? 'Keer gewerkt' : T('Gewerkte shiften', '上过的班次')}</span></div>
      <div class="stat ${pendingReqs.length ? 'alert' : ''}"><span class="v">${pendingReqs.length}</span><span class="k">${T('Aanpassingen in behandeling', '待审核的修改')}</span></div>
    </div>`}
    ${payslipCard(pm)}
    ${clocks ? `<section class="card">
      <div class="card-head"><h2>${T('Urenkaart', '工时表')}</h2>${canClock() ? `<button class="sm" id="add-missing">${T('+ Vergeten uren toevoegen', '+ 补登工时')}</button>` : ''}</div>
      ${data.entries.length ? `<div class="rows">${data.entries.map(x => `
        <div class="entry">
          <div class="row-main">
            <span class="entry-when">${fmt.day(x.clock_in)}</span>
            <div class="entry-io">${stamps(x)}</div>
            <div class="pills">${entryFlags(x, grace)}</div>
          </div>
          <div class="row-actions" style="flex-direction:column;align-items:flex-end">
            <span class="entry-dur">${x.clock_out ? fmt.dur(minutesBetween(x.clock_in, x.clock_out)) : '—'}</span>
            <button class="sm" data-fix="${x.id}">${T('Uren aanpassen', '修改工时')}</button>
          </div>
          ${x.note ? `<p class="entry-note">${esc(x.note)}</p>` : ''}
          ${x.pending ? `<p class="entry-note">${T('Gevraagd om aan te passen naar', '申请改为')} ${fmt.time(x.pending.proposed_in)} – ${x.pending.proposed_out ? fmt.time(x.pending.proposed_out) : T('nog bezig', '进行中')}: “${esc(x.pending.reason)}”</p>` : ''}
        </div>`).join('')}</div>`
        : `<div class="empty"><strong>${T(`Geen uren in ${fmt.month(m)}.`, `${fmt.month(m)}没有工时。`)}</strong>${T('Als je inklokt bij Klok, verschijnt het hier.', '在“打卡”页打卡后会显示在这里。')}</div>`}
    </section>` : ''}
    <section class="card">
      <h2>${T('Per maand', '每月')}</h2>
      <p class="muted small" style="margin-top:6px">${clocks ? T('Wat je loonbrieven zeggen: de uren die je betaald kreeg, bruto en netto. Daarnaast de uren die je in de app klokte. Tik op een maand om ze te openen.', '工资单上的数字：发了工资的工时、税前和实发。旁边是你在 app 里打卡的工时。点一个月份查看。')
        : T('Tik op een maand om ze te openen.', '点一个月份查看。')}</p>
      ${payMonthsTable(months, { open: toDateInput(m), clickable: true, clocked: clocks }) || `<p class="empty">${T('Je loonbrieven verschijnen hier zodra ze er zijn.', '工资单出来后会显示在这里。')}</p>`}
      ${clocks ? `<p class="muted small" style="margin-top:10px">${T('Het verdiende bedrag bovenaan is een schatting uit je geklokte uren. Je loonbrief toont wat je echt betaald krijgt.', '上面的收入是根据打卡工时估算的。实际工资以工资单为准。')}</p>` : ''}
    </section>
    ${pendingReqs.length || decided.length ? `<section class="card">
      <h2>${T('Je aanvragen', '你的申请')}</h2>
      <div class="rows">${[...pendingReqs, ...decided].map(r => `
        <div class="row">
          <div class="row-main">
            <span class="row-title">${r.entry_id ? T('Aanpassen', '修改') : T('Toevoegen', '补登')} ${fmt.day(r.proposed_in)}: <span class="time">${fmt.time(r.proposed_in)} – ${r.proposed_out ? fmt.time(r.proposed_out) : T('nog bezig', '进行中')}</span></span>
            <span class="row-sub">“${esc(r.reason)}”</span>
          </div>
          <div class="row-actions">
            ${r.status === 'pending' ? `<span class="pill accent">${T('In behandeling', '审核中')}</span><button class="sm" data-cancel="${r.id}">${T('Annuleren', '取消')}</button>`
              : r.status === 'approved' ? `<span class="pill on">${T('Goedgekeurd', '已通过')}</span>` : `<span class="pill bad">${T('Niet goedgekeurd', '未通过')}</span>`}
          </div>
        </div>`).join('')}</div>
    </section>` : ''}`;
  $('#mo-prev', el).addEventListener('click', () => { S.month = addMonths(S.month, -1); renderView(); });
  $('#mo-next', el).addEventListener('click', () => { S.month = addMonths(S.month, 1); renderView(); });
  const addMissing = $('#add-missing', el);
  if (addMissing) addMissing.addEventListener('click', () => timeFixModal(null));
  bindPayMonths(el);
  $$('[data-fix]', el).forEach(b => b.addEventListener('click', () => timeFixModal(data.entries.find(x => x.id === b.dataset.fix))));
  $$('[data-cancel]', el).forEach(b => b.addEventListener('click', () => busy(b, async () => {
    await rpc('cancel_time_edit', { p_edit_id: b.dataset.cancel });
    toast(T('Aanvraag geannuleerd.', '申请已取消。'));
    renderView();
  }).catch(() => {})));
}

function timeFixModal(entry) {
  const t = now();
  const inV = entry ? new Date(entry.clock_in) : atTime(addDays(t, -1), '17:30');
  const outV = entry ? (entry.clock_out ? new Date(entry.clock_out) : null) : atTime(addDays(t, -1), '22:30');
  const stillIn = entry && !entry.clock_out;
  modal.open(`
    <h2 id="modal-title">${entry ? T('Uren aanpassen', '修改工时') : T('Vergeten uren toevoegen', '补登工时')}</h2>
    <p>${entry ? T(`Nu: ${fmt.day(entry.clock_in)}, ${fmt.time(entry.clock_in)} – ${entry.clock_out ? fmt.time(entry.clock_out) : 'nog ingeklokt'}. `, `现在：${fmt.day(entry.clock_in)}，${fmt.time(entry.clock_in)} – ${entry.clock_out ? fmt.time(entry.clock_out) : '还在上班'}。`)
      : T('Voor een shift die je gewerkt hebt maar waarvoor je niet inklokte. ', '用于你上了班却没有打卡的班次。')}${T('Je verantwoordelijke keurt de wijziging goed voor ze meetelt.', '负责人审核通过后才会计入。')}</p>
    <form id="fix-form" novalidate>
      <div class="form-grid">
        <div class="field wide"><label for="fx-day">${T('Dag', '日期')}</label>${dateField('fx-day', inV, addDays(t, -45), t)}</div>
        <div class="field"><label for="fx-in">${T('Ingeklokt', '上班时间')}</label>${timeField('fx-in', toTimeInput(inV))}</div>
        <div class="field"><label for="fx-out">${T('Uitgeklokt', '下班时间')}</label>${timeField('fx-out', outV ? toTimeInput(outV) : '', { required: !stillIn })}
          <span class="help">${stillIn ? T('Laat leeg als je nog aan het werken bent.', '如果还在上班就留空。') : T('Vroeger dan het inklokken betekent de volgende dag.', '早于上班时间表示第二天。')}</span></div>
        <div class="field wide"><label for="fx-reason">${T('Wat is er gebeurd?', '发生了什么？')}</label><input id="fx-reason" maxlength="300" placeholder="${T('bv. vergeten uit te klokken, vertrokken om 15:30', '例如：忘记下班打卡，15:30 离开')}" required></div>
      </div>
      <p class="form-error" id="fx-err"></p>
      <div class="form-actions"><button type="button" data-close>${T('Annuleren', '取消')}</button><button type="submit" class="primary">${T('Naar verantwoordelijke sturen', '发给负责人')}</button></div>
    </form>`, d => {
    $('#fx-reason', d).focus();
    $('#fix-form', d).addEventListener('submit', async ev => {
      ev.preventDefault();
      const err = $('#fx-err', d);
      const inHM = parseHM($('#fx-in', d).value), outRaw = $('#fx-out', d).value.trim(), outHM = parseHM(outRaw);
      const reason = $('#fx-reason', d).value.trim();
      if (!inHM) { err.textContent = T('Vul in wanneer je inklokte, bv. 17:30.', '请填写上班时间，例如 17:30。'); return; }
      if (outRaw && !outHM) { err.textContent = T('Vul in wanneer je uitklokte, bv. 22:30.', '请填写下班时间，例如 22:30。'); return; }
      if (!outHM && !stillIn) { err.textContent = T('Vul in wanneer je uitklokte.', '请填写下班时间。'); return; }
      const { a, b } = spanFor($('#fx-day', d).value, inHM, outHM);
      if (a > now() || (b && b > now())) { err.textContent = T('Uren kunnen niet in de toekomst liggen.', '时间不能在将来。'); return; }
      if (reason.length < 3) { err.textContent = T('Zeg kort wat er gebeurd is.', '请简单说说发生了什么。'); return; }
      const btn = $('button[type=submit]', d);
      btn.disabled = true;
      try {
        await rpc('request_time_edit', { p_entry_id: entry ? entry.id : null, p_in: a.toISOString(), p_out: b ? b.toISOString() : null, p_reason: reason });
        modal.close();
        toast(T('Verstuurd. Je verantwoordelijke bekijkt het.', '已发送，负责人会查看。'));
        renderView();
      } catch (e) { err.textContent = e.message; btn.disabled = false; }
    });
  });
}

/* -------------------------------------------------- profile and avatar */

const LOCK_ICON = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const AV_TABS = [
  ['face', 'Gezicht', '脸', ['body', 'skin', 'eyes', 'eyeColor', 'brows', 'mouth', 'beard', 'extra']],
  ['hair', 'Haar', '头发', ['hair', 'hairColor']],
  ['clothes', 'Kleren', '衣服', ['top', 'topColor', 'outer', 'outerColor', 'bottom', 'bottomColor']],
  ['shoes', 'Schoenen', '鞋子', ['shoes', 'shoeColor']],
  ['extras', "Extra's", '配饰', ['hat', 'hatColor', 'glasses', 'neck', 'neckColor', 'earrings', 'piercing', 'aura']],
];
const AV_GROUP = {
  skin: 'Huidskleur', eyes: 'Ogen', eyeColor: 'Kleur van je ogen', brows: 'Wenkbrauwen', mouth: 'Mond', beard: 'Baard en snor',
  extra: 'Sproeten en blos', hair: 'Kapsel', hairColor: 'Haarkleur', top: 'Bovenstuk', topColor: 'Kleur', outer: 'Jas',
  outerColor: 'Kleur van je jas', bottom: 'Broek of rok', bottomColor: 'Kleur', shoes: 'Schoenen', shoeColor: 'Kleur',
  hat: 'Op je hoofd', hatColor: 'Kleur', glasses: 'Bril', earrings: 'Oorbellen', piercing: 'Op je neus',
  body: 'Figuur', neck: 'Rond je hals', neckColor: 'Kleur', aura: 'Rond je avatar',
};
const AV_GROUP_ZH = {
  skin: '肤色', eyes: '眼睛', eyeColor: '眼睛颜色', brows: '眉毛', mouth: '嘴巴', beard: '胡子',
  extra: '雀斑和腮红', hair: '发型', hairColor: '发色', top: '上衣', topColor: '颜色', outer: '外套',
  outerColor: '外套颜色', bottom: '裤子或裙子', bottomColor: '颜色', shoes: '鞋子', shoeColor: '颜色',
  hat: '头上', hatColor: '颜色', glasses: '眼镜', earrings: '耳饰', piercing: '鼻子上',
  body: '身形', neck: '脖子上', neckColor: '颜色', aura: '光环',
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
const COLOR_NAMES_ZH = {
  white: '白色', black: '黑色', navy: '藏青', maroon: '酒红', red: '红色', pink: '粉色', lilac: '淡紫', sky: '浅蓝',
  green: '绿色', olive: '橄榄绿', mustard: '芥末黄', beige: '米色', gray: '灰色', cream: '奶油色', grey: '灰色',
  blue: '蓝色', light: '浅色', indigo: '深蓝', chestnut: '栗色', dark: '深棕', brown: '棕色',
  blonde: '金色', platinum: '铂金色', auburn: '赤褐色', ginger: '姜红色', hazel: '榛色', ruby: '宝石红',
};
// Long Dutch compounds in the small tiles break at the seam: Paarden-staart.
const SOFT_HYPHENS = ['Paarden|staart', 'Konijnen|sloffen', 'Monster|sloffen', 'Draken|sloffen', 'Midden|scheiding', 'Zij|scheiding',
  'Mannen|knot', 'Vissers|hoedje', 'Hartjes|bril', 'Kop|telefoon', 'Body|warmer', 'Zonne|bril', 'Jogging|broek', 'Fantasie|kleuren', 'Gouden| sneakers'];
const hyph = label => SOFT_HYPHENS.reduce((t, w) => t.replace(w.replace('|', ''), w.replace('|', '\u00AD')), esc(label));
const colorName = (k, v) => k === 'skin' ? T(`huidskleur ${v.slice(1)}`, `肤色 ${v.slice(1)}`) : (zhUI() ? COLOR_NAMES_ZH : COLOR_NAMES)[v] || v;
const avLabel = (k, v) => Avatar.label(k, v, zhUI() ? 'zh' : 'nl');
const avShown = (k, c) => !((k === 'topColor' && ['chef', 'garden', 'clown', 'tang', 'qipao'].includes(c.top)) || (k === 'outerColor' && c.outer === 'none') ||
  (k === 'neckColor' && !['scarf', 'bowtie'].includes(c.neck)) ||
  (k === 'shoeColor' && !['sneakers', 'boots'].includes(c.shoes)) || (k === 'hatColor' && !['beanie', 'cap', 'bandana'].includes(c.hat)));

function openAvatarEditor() {
  const level = (S.me.xp || {}).level || 1;
  const saved = S.me.avatar ? Avatar.normalize(S.me.avatar) : null;
  let c = saved ? { ...saved } : { ...Avatar.DEFAULT }, tab = 'face';
  const need = (k, v) => Avatar.levelOf(k, v);
  const locked = (k, v) => need(k, v) > level && !(saved && saved[k] === v);
  const lockNote = (k, v) => locked(k, v) ? `<span class="av-lock">${LOCK_ICON}${T('Level', '等级')} ${need(k, v)}</span>` : '';
  const from = (k, v) => T(`vanaf level ${need(k, v)}`, `${need(k, v)} 级解锁`);

  function group(k) {
    if (!avShown(k, c)) return '';
    let body;
    if (k === 'extra') {
      body = `<div class="av-tiles">${[['freckles', T('Sproeten', '雀斑')], ['blush', T('Blos', '腮红')]].map(([t, l]) => `
        <button type="button" class="av-tile" data-toggle="${t}" aria-pressed="${!!c[t]}">
          <span class="av-tile-pic">${Avatar.render({ ...c, [t]: true }, { view: '56 70 88 88' })}</span><span class="av-tile-label">${l}</span></button>`).join('')}</div>`;
    } else if (Avatar.COLORS[k]) {
      body = `<div class="swatches">${Object.entries(Avatar.COLORS[k]).map(([v, hexColor]) => `
        <button type="button" class="swatch${locked(k, v) ? ' is-locked' : ''}" data-k="${k}" data-v="${v}" style="--c:${hexColor}" aria-pressed="${c[k] === v}"
          aria-label="${esc(colorName(k, v))}${locked(k, v) ? `, ${from(k, v)}` : ''}" title="${esc(colorName(k, v))}${locked(k, v) ? ` · ${from(k, v)}` : ''}" ${locked(k, v) ? 'disabled' : ''}>${locked(k, v) ? LOCK_ICON : ''}</button>`).join('')}</div>`;
    } else {
      body = `<div class="av-tiles">${Avatar.STYLES[k].map(([v]) => {
        const label = avLabel(k, v);
        const look = { ...c, [k]: v };
        if (k === 'hair') look.hat = 'none';
        if (k === 'top') look.outer = 'none';
        return `<button type="button" class="av-tile${locked(k, v) ? ' is-locked' : ''}" data-k="${k}" data-v="${v}" aria-pressed="${c[k] === v}" ${locked(k, v) ? 'disabled' : ''}
          title="${esc(label)}${locked(k, v) ? ` · ${from(k, v)}` : ''}">
          <span class="av-tile-pic">${Avatar.render(look, { view: AV_CROP[k] || 'tile' })}</span><span class="av-tile-label">${hyph(label)}</span>${lockNote(k, v)}</button>`;
      }).join('')}</div>`;
    }
    return `<div class="av-group"><h3>${(zhUI() ? AV_GROUP_ZH : AV_GROUP)[k]}</h3>${body}</div>`;
  }

  const d = modal.open(`
    <h2 id="modal-title">${saved ? T('Je avatar aanpassen', '修改你的头像') : T('Maak je avatar', '创建你的头像')}</h2>
    <p>${T(`Je bent level ${level}. Dingen met een slotje krijg je op een hoger level.`, `你现在是 ${level} 级。带锁的东西升级后才能用。`)}</p>
    <div class="av-editor">
      <div class="av-preview" id="av-preview"></div>
      <div class="av-side">
        <div class="chips av-tabs" role="tablist" aria-label="${T('Onderdelen', '部分')}">${AV_TABS.map(([k, nl, zh]) => `<button type="button" class="chip" role="tab" data-av-tab="${k}">${T(nl, zh)}</button>`).join('')}</div>
        <div class="av-groups" id="av-groups"></div>
      </div>
    </div>
    <p class="form-error" id="av-err"></p>
    <div class="form-actions av-actions">
      <button type="button" id="av-random">${T('Willekeurig', '随机')}</button>
      <span class="toolbar"><button type="button" data-close>${T('Annuleren', '取消')}</button><button type="button" class="primary" id="av-save">${T('Opslaan', '保存')}</button></span>
    </div>`, d => {
    const groups = $('#av-groups', d);
    const draw = () => {
      $('#av-preview', d).innerHTML = Avatar.render(c, { title: T('Je avatar', '你的头像') });
      const keep = groups.scrollTop;
      groups.innerHTML = AV_TABS.find(t => t[0] === tab)[3].map(group).join('');
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
      toast(T('Je avatar is opgeslagen.', '头像已保存。'));
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
      const label = k === 'hairColor' ? T('Fantasiekleuren voor je haar', '彩色头发') : avLabel(k, v);
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
      <span class="reward-lvl">${on ? '✓ ' : LOCK_ICON}${T('Level', '等级')} ${r.l}</span><span class="reward-name">${hyph(r.label)}</span></div>`;
  }).join('');
}

const fmtDate = iso => new Date(iso + 'T00:00').toLocaleDateString(loc(), { day: 'numeric', month: 'long', year: 'numeric' });
const contractPeriod = c => c.starts_on ? (c.ends_on ? `${isoToDMY(c.starts_on)} – ${isoToDMY(c.ends_on)}` : T(`vanaf ${isoToDMY(c.starts_on)}`, `${isoToDMY(c.starts_on)} 起`)) : T('zonder datum', '无日期');
function contractRows(list, manager) {
  if (!list.length) return `<p class="empty">${manager ? 'Nog geen contracten.' : T('Je verantwoordelijke heeft nog geen contract toegevoegd.', '负责人还没有上传合同。')}</p>`;
  const today = toDateInput(now());
  return `<div class="rows">${list.map(c => {
    const state = c.ends_on && c.ends_on < today ? `<span class="pill">${T('Afgelopen', '已结束')}</span>` : (!c.starts_on || c.starts_on <= today) ? `<span class="pill on">${T('Loopt', '有效')}</span>` : `<span class="pill accent">${T('Begint later', '尚未开始')}</span>`;
    return `<div class="row">
      <div class="row-main"><span class="row-title">${esc(c.title)} ${state}</span><span class="row-sub">${contractPeriod(c)} · ${esc(c.file_name)} · ${fmtSize(c.size_bytes)}</span></div>
      <div class="row-actions"><button class="sm${manager ? '' : ' primary'}" data-contract="${c.id}">${T('Downloaden', '下载')}</button>${manager ? `<button class="sm danger" data-contract-rm="${c.id}" data-title="${esc(c.title)}">Verwijderen</button>` : ''}</div>
    </div>`;
  }).join('')}</div>`;
}

// The language picker for staff (Profiel); it is kept on the server, so the
// app opens in that language on every phone.
const LANGS = [['nl', 'Nederlands', 'nl-BE'], ['zh', '中文', 'zh-Hans']];
function langCard() {
  return `<section class="card"><h2>${T('Taal', '语言')} <span class="muted small">· ${T('语言', 'Taal')}</span></h2>
    <p class="muted small" style="margin-top:6px">${T('De taal van de app op al je toestellen. Je verantwoordelijke ziet alles in het Nederlands.', 'app 在你所有设备上的语言。负责人看到的是荷兰语。')}</p>
    <div class="chips" role="group" aria-label="Taal · 语言" style="margin-top:12px">${LANGS.map(([k, l, a]) =>
      `<button type="button" class="chip${lang() === k ? ' is-on' : ''}" data-my-lang="${k}" lang="${a}" aria-pressed="${lang() === k}">${l}</button>`).join('')}</div>
  </section>`;
}
function bindLangCard(el) {
  $$('[data-my-lang]', el).forEach(b => b.addEventListener('click', () => busy(b, async () => {
    await rpc('save_my_language', { p_lang: b.dataset.myLang });
    store.set(LANG_KEY, b.dataset.myLang);
    S.me.lang = b.dataset.myLang;
    renderShell();
  }).catch(() => {})));
}

// How XP comes in, in words: by working for who clocks in, by the day for the rest.
function xpHow(xp) {
  const per = S.settings.daily_xp || 0;
  const bonus = T('Je verantwoordelijke kan je ook bonus-XP geven.', '负责人也可以给你奖励 XP。');
  return canClock()
    ? `<ul><li>${T('<strong>10 XP</strong> per uur dat je werkt', '每工作一小时 <strong>10 XP</strong>')}</li><li>${T('<strong>+5 XP</strong> als je op tijd begint aan je shift', '准时开始班次 <strong>+5 XP</strong>')}</li><li>${T('<strong>+5 XP</strong> als je blijft tot je shift gedaan is', '待到班次结束 <strong>+5 XP</strong>')}</li></ul>
      <p class="muted small">${T('XP komt uit je urenkaart. Een aanpassing telt mee zodra je verantwoordelijke ze goedkeurt.', 'XP 来自你的工时表。修改经负责人审核通过后才计入。')} ${bonus}</p>`
    : `<ul><li>${T(`<strong>+${per} XP</strong> elke dag, gewoon omdat je bij het team bent`, `每天 <strong>+${per} XP</strong>，因为你是团队的一员`)}</li></ul>
      <p class="muted small">${bonus}${xp && xp.daily ? ` ${T(`Tot nu toe ${xp.daily} XP van de dagen.`, `目前每日 XP 共 ${xp.daily}。`)}` : ''}</p>`;
}

async function viewProfile(el, current) {
  const r = await rpc('my_profile');
  if (!current()) return;
  const xp = r.xp, lvl = xp.level, w = r.work;
  S.me.avatar = r.avatar; S.me.xp = xp;
  const next = Avatar.rewardsAt(lvl + 1, zhUI() ? 'zh' : 'nl');
  const per = S.settings.daily_xp || 0;
  const staffLang = !isManager() && !isDriver();
  const stats = canClock() || isManager() ? `
          <div class="stat"><span class="v">${fmt.hours(xp.minutes)}</span><span class="k">${T('Uren gewerkt', '工作小时')}</span></div>
          <div class="stat"><span class="v">${xp.entries}</span><span class="k">${T('Keer gewerkt', '上班次数')}</span></div>
          <div class="stat"><span class="v">${xp.entries ? Math.round(xp.on_time / xp.entries * 100) + '%' : '—'}</span><span class="k">${T('Op tijd begonnen', '准时开始')}</span></div>` : `
          <div class="stat good"><span class="v">+${per}</span><span class="k">${T('XP per dag', '每天 XP')}</span></div>
          <div class="stat"><span class="v">${num(xp.daily || 0, 0)}</span><span class="k">${T('XP van de dagen', '每日 XP 合计')}</span></div>
          <div class="stat"><span class="v">${num(xp.bonus || 0, 0)}</span><span class="k">${T('Bonus-XP', '奖励 XP')}</span></div>`;
  el.innerHTML = `
    <div class="view-head"><div><h1>${T('Mijn profiel', '我的资料')}</h1><p>${T('Je avatar, je level, je gegevens en je contracten.', '你的头像、等级、个人信息和合同。')}</p></div></div>
    <section class="card profile-hero">
      <button type="button" class="hero-pic" id="edit-avatar-pic" aria-label="${r.avatar ? T('Avatar aanpassen', '修改头像') : T('Maak je avatar', '创建你的头像')}">
        ${r.avatar ? Avatar.render(r.avatar, { title: T('Je avatar', '你的头像') }) : `<span class="hero-empty">${Avatar.render(Avatar.DEFAULT)}</span><span class="hero-make">${T('Maak je avatar', '创建你的头像')}</span>`}</button>
      <div class="hero-main">
        <p class="section-label">${esc(S.me.name)}</p>
        <h2 class="hero-level">${T('Level', '等级')} ${lvl} <span>· ${esc(levelTitle(lvl))}</span></h2>
        <p class="mate-title">“${esc(funTitle({ id: S.me.id, title: r.title }))}”${r.title ? '' : ` <span class="muted small">${T('(gekozen door de app)', '（app 选的）')}</span>`}</p>
        ${xpBar(xp)}
        ${xp.bonus && (canClock() || isManager()) ? `<p class="muted small">${T(`Waarvan ${num(xp.bonus, 0)} bonus-XP van je verantwoordelijke.`, `其中 ${num(xp.bonus, 0)} 是负责人给的奖励 XP。`)}</p>` : ''}
        ${next.length ? `<p class="small">${T(`Op level ${lvl + 1} krijg je:`, `升到 ${lvl + 1} 级可以得到：`)} <strong>${next.map(esc).join(T(', ', '、'))}</strong></p>` : ''}
        <div class="stats stats-3">${stats}
        </div>
        <div class="toolbar"><button class="primary" id="edit-avatar">${r.avatar ? T('Avatar aanpassen', '修改头像') : T('Maak je avatar', '创建你的头像')}</button>
          <button id="pf-title">${T('Titel kiezen', '选择称号')}</button><button id="pf-card">${T('Zo zien collega\'s je', '同事看到的你')}</button></div>
        <details class="xp-how"><summary>${T('Hoe verdien je XP?', '怎么获得 XP？')}</summary>${xpHow(xp)}</details>
      </div>
    </section>
    <section class="card"><div class="card-head"><h2>${T('Beloningen', '奖励')}</h2><span class="muted small">${T('Nieuwe dingen voor je avatar, per level', '每升一级，头像就有新东西')}</span></div>
      <div class="rewards">${rewardTiles(r.avatar, lvl)}</div></section>
    <div class="grid-2">
      <section class="card"><h2>${T('Mijn gegevens', '我的信息')}</h2>
        <p class="muted small" style="margin-top:6px">${T('Alleen jij en je verantwoordelijke zien dit. Ze zijn nodig voor je contract en je loonfiche.', '只有你和负责人能看到。合同和工资单需要这些信息。')}</p>
        <form id="pf-form" novalidate><div class="form-grid" style="margin-top:12px">${profileFields('pf', r.profile)}</div>
          <p class="form-error" id="pf-err"></p><div class="form-actions"><button type="submit" class="primary">${T('Gegevens opslaan', '保存信息')}</button></div></form>
      </section>
      <div class="stack">
        ${staffLang ? langCard() : ''}
        <section class="card"><h2>${T('Werk', '工作')}</h2>
          <dl class="kv">
            <dt>${T('Rol', '角色')}</dt><dd>${w.role === 'manager' ? 'Verantwoordelijke' : w.role === 'driver' ? 'Chauffeur' : T('Medewerker', '员工')}</dd>
            <dt>${T('Statuut', '身份')}</dt><dd>${w.contract_type ? T(CONTRACTS[w.contract_type], CONTRACTS_ZH[w.contract_type]) : '—'}</dd>
            <dt>${T('Uurloon', '时薪')}</dt><dd>${w.hourly_rate != null ? fmt.money(w.hourly_rate) : '—'}</dd>
            <dt>${T('In dienst sinds', '入职日期')}</dt><dd>${w.start_date ? fmtDate(w.start_date) : '—'}</dd>
            <dt>${T('Werknemersnummer', '员工编号')}</dt><dd>${w.payroll_id ? esc(w.payroll_id) : '—'}</dd>
            ${w.role === 'staff' ? `<dt>${T('Inklokken', '打卡')}</dt><dd>${w.can_clock ? T('Ja, bij Klok', '是，在“打卡”页') : T('Nee, je krijgt XP per dag', '不用，每天自动得 XP')}</dd>` : ''}
          </dl>
          <p class="muted small" style="margin-top:10px">${T('Klopt hier iets niet? Vraag het aan je verantwoordelijke.', '有不对的地方？请问负责人。')}</p></section>
        <section class="card"><h2>${T('Contracten', '合同')}</h2>${contractRows(r.contracts, false)}</section>
        <section class="card"><h2>${T('Pincode wijzigen', '修改密码')}</h2>
          <form id="pin-form" novalidate><div class="form-grid" style="margin-top:12px">
            <div class="field"><label for="pin-old">${T('Huidige pincode', '当前密码')}</label><input id="pin-old" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="current-password"></div>
            <div class="field"><label for="pin-new">${T('Nieuwe pincode', '新密码')}</label><input id="pin-new" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password"></div>
            <div class="field"><label for="pin-new2">${T('Herhaal de nieuwe', '再输一次新密码')}</label><input id="pin-new2" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password"></div>
          </div><p class="form-error" id="pin-err"></p><div class="form-actions"><button type="submit" class="primary">${T('Pincode wijzigen', '修改密码')}</button></div></form>
        </section>
        ${S.me.picks ? `<section class="card"><h2>${T('Herinneringen', '提醒')}</h2>
          <label class="check" style="margin-top:12px"><input type="checkbox" id="pf-remind" ${store.get(REMIND_OFF) ? '' : 'checked'}> ${T('Herinner me aan open shiften', '提醒我还有空班次')}</label>
          <p class="muted small" style="margin-top:6px">${T('Als je de app opent: meteen als iemand een shift teruggeeft, en één keer per dag als er nog shiften open staan. Alleen op dit toestel.', '打开 app 时：有人退回班次时马上提醒；还有空班次时每天提醒一次。只在这台设备上。')}</p>
        </section>` : ''}
        <section class="card"><h2>${T('Weergave', '显示')}</h2>
          <p class="muted small" style="margin-top:6px">${T('Alleen op dit toestel.', '只在这台设备上。')}</p>
          <div class="chips" role="group" aria-label="${T('Thema', '主题')}" style="margin-top:12px">${THEMES.map(([k, nl, zh]) => `<button type="button" class="chip" data-theme-pick="${k}">${T(nl, zh)}</button>`).join('')}</div>
        </section>
        ${installButton('pf-install', 'signout-wide install-wide')}
        <button type="button" class="signout-wide" id="pf-signout">${ICONS.signout}<span>${T('Afmelden', '退出登录')}</span></button>
      </div>
    </div>`;
  $('#edit-avatar', el).addEventListener('click', () => openAvatarEditor());
  $('#edit-avatar-pic', el).addEventListener('click', () => openAvatarEditor());
  $('#pf-signout', el).addEventListener('click', askSignOut);
  const pfi = $('#pf-install', el);
  if (pfi) pfi.addEventListener('click', () => installGuide());
  $('#pf-title', el).addEventListener('click', () => titlePicker(r.title, lvl, renderView));
  $('#pf-card', el).addEventListener('click', () => mateCard(S.me.id));
  const rem = $('#pf-remind', el);
  if (rem) rem.addEventListener('change', () => {
    store.set(REMIND_OFF, rem.checked ? null : '1');
    toast(rem.checked ? T('Je krijgt weer herinneringen voor open shiften.', '会再提醒你空班次。') : T('Geen herinneringen meer op dit toestel.', '这台设备不再提醒。'));
  });
  $$('[data-theme-pick]', el).forEach(b => b.addEventListener('click', () => setTheme(b.dataset.themePick)));
  applyTheme();
  bindLangCard(el);
  $$('[data-contract]', el).forEach(b => b.addEventListener('click', () => downloadContract(b.dataset.contract, b)));
  const pf = $('#pf-form', el);
  pf.addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('#pf-err', el); err.textContent = '';
    const r2 = readProfile(pf);
    if (r2.error) { err.textContent = r2.error; r2.field.focus(); return; }
    await busy($('button[type=submit]', pf), async () => {
      await rpc('save_my_profile', { p_profile: r2.values });
      toast(T('Je gegevens zijn opgeslagen.', '信息已保存。'));
      renderView();
    }).catch(e => { err.textContent = e.message; });
  });
  const pin = $('#pin-form', el);
  pin.addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('#pin-err', el); err.textContent = '';
    const old = $('#pin-old', pin).value.trim(), nw = $('#pin-new', pin).value.trim();
    if (!old) { err.textContent = T('Vul je huidige pincode in.', '请输入当前密码。'); return; }
    if (!/^\d{4,8}$/.test(nw)) { err.textContent = T('De nieuwe pincode moet 4 tot 8 cijfers hebben.', '新密码必须是 4 到 8 位数字。'); return; }
    if (nw !== $('#pin-new2', pin).value.trim()) { err.textContent = T('De twee nieuwe pincodes zijn niet gelijk.', '两次输入的新密码不一样。'); return; }
    await busy($('button[type=submit]', pin), async () => {
      await rpc('change_my_pin', { p_old: old, p_new: nw });
      pin.reset();
      toast(T('Je pincode is gewijzigd. Andere toestellen zijn afgemeld.', '密码已修改。其他设备已退出登录。'));
    }).catch(e => { err.textContent = e.message; });
  });
}

/* ------------------------------------------------------------- ranking */

async function viewRanking(el, current) {
  const list = await rpc('leaderboard');
  if (!current()) return;
  const mode = S.rankMode || 'all', key = mode === 'month' ? 'month_xp' : 'xp';
  const ranked = [...list].sort((a, b) => b[key] - a[key] || b.xp - a.xp || a.name.localeCompare(b.name, 'nl'));
  const you = T('jij', '你');
  let rank = 0, prev = null;
  ranked.forEach((p, i) => { if (p[key] !== prev) { rank = i + 1; prev = p[key]; } p.rank = rank; });
  const me = ranked.find(p => p.me), month = fmt.monthName(now());
  const above = me && ranked[ranked.indexOf(me) - 1];
  const anyXp = ranked.some(p => p[key] > 0);
  const figure = p => p.avatar ? Avatar.render(p.avatar, { title: p.name }) : `<span class="hero-empty">${Avatar.render(Avatar.DEFAULT)}</span>`;
  const spot = (p, place) => p ? `
    <div class="podium-spot place-${place}${p.me ? ' is-me' : ''}" data-mate="${p.id}" role="button" tabindex="0" aria-label="${esc(p.name)}">
      <div class="podium-pic">${figure(p)}</div>
      <div class="podium-name">${esc(p.name)}${p.me ? ` <span class="pill accent">${you}</span>` : ''}</div>
      <div class="podium-meta">${levelPill(p)} <span class="mono">${p[key]} XP</span></div>
      <div class="podium-step"><span>${p.rank}</span></div>
    </div>` : '<div class="podium-spot is-empty"></div>';
  el.innerHTML = `
    <div class="view-head">
      <div><h1>${T('Ranglijst', '排行榜')}</h1><p>${T(`Wie van het team heeft het hoogste level? XP verdien je met werken: 10 per uur, +5 als je op tijd begint en +5 als je blijft tot het einde. Wie niet inklokt, krijgt ${S.settings.daily_xp || 0} XP per dag. Tik op iemand om de kaart te zien.`,
        `团队里谁的等级最高？工作就能得 XP：每小时 10，准时开始 +5，待到结束 +5。不用打卡的人每天得 ${S.settings.daily_xp || 0} XP。点一个人可以看名片。`)}</p></div>
      <div class="chips" role="group" aria-label="${T('Periode', '时间')}">
        <button type="button" class="chip${mode === 'all' ? ' is-on' : ''}" data-rank-mode="all" aria-pressed="${mode === 'all'}">${T('Altijd', '全部')}</button>
        <button type="button" class="chip${mode === 'month' ? ' is-on' : ''}" data-rank-mode="month" aria-pressed="${mode === 'month'}">${T('Deze maand', '本月')}</button>
      </div>
    </div>
    ${me ? `<p class="hint info">${T(`Jij staat <strong>${me.rank}e</strong> van ${ranked.length}${mode === 'month' ? ` in ${month}` : ''}, met ${me[key]} XP.`, `你${mode === 'month' ? `在${month}` : ''}排第 <strong>${me.rank}</strong>（共 ${ranked.length} 人），有 ${me[key]} XP。`)}${above && above[key] > me[key] ? T(` Nog ${above[key] - me[key] + 1} XP om ${esc(above.name)} in te halen.`, `再得 ${above[key] - me[key] + 1} XP 就能超过 ${esc(above.name)}。`) : ''}</p>` : ''}
    ${anyXp ? `<section class="card podium" aria-label="${T('Top drie', '前三名')}">${spot(ranked[1], 2)}${spot(ranked[0], 1)}${spot(ranked[2], 3)}</section>`
      : `<p class="empty">${mode === 'month' ? T(`Nog niemand heeft XP in ${month}. Wie als eerste werkt, staat bovenaan.`, `${month}还没有人有 XP。先上班的人排第一。`) : T('Nog niemand heeft XP. Wie als eerste werkt, staat bovenaan.', '还没有人有 XP。先上班的人排第一。')}</p>`}
    <section class="card">
      <div class="card-head"><h2>${mode === 'month' ? T(`XP in ${month}`, `${month}的 XP`) : T('Iedereen', '所有人')}</h2><span class="muted small">${T(plural(ranked.length, 'persoon', 'personen'), `${ranked.length} 人`)}</span></div>
      <div class="rows rank-rows">${ranked.map(p => `
        <div class="row rank-row${p.me ? ' mine' : ''}" data-mate="${p.id}" role="button" tabindex="0">
          <div class="person"><span class="rank-num">${p.rank}</span>${personPic(p, 'lg')}
            <div class="row-main"><span class="row-title">${esc(p.name)}${p.me ? ` <span class="pill accent">${you}</span>` : ''}${p.family ? ` <span class="pill">${T('Familie', '家人')}</span>` : ''}</span>
              <span class="row-sub">${levelPill(p)} <span class="rank-fun">“${esc(funTitle(p))}”</span></span></div></div>
          <span class="rank-xp mono">${p[key]} XP</span>
        </div>`).join('')}</div>
    </section>`;
  $$('[data-rank-mode]', el).forEach(b => b.addEventListener('click', () => { S.rankMode = b.dataset.rankMode; renderView(); }));
  bindMates(el);
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
            const driver = ((S.staff || []).find(p => p.id === w.staff_id) || {}).role === 'driver';
            return `<div class="row">
              <div class="person">${picFor(w.staff_id, w.name, 'on')}
                <div class="row-main"><span class="row-title">${esc(w.name)}</span>
                <span class="row-sub">${driver ? 'Chauffeur, onderweg sinds' : 'Binnen'} ${sameDay(w.clock_in, t) ? fmt.time(w.clock_in) : fmt.when(w.clock_in)} · <span data-live="since" data-since="${w.clock_in}">${fmt.dur(minutesBetween(w.clock_in, t))}</span>${driver ? '' : w.shift ? ` · shift eindigt om ${fmt.time(w.shift.ends_at)}` : ' · geen shift'}</span>
                ${long ? '<span class="pill bad">Meer dan 14u, waarschijnlijk vergeten uit te klokken</span>' : ''}</div></div>
              <div class="row-actions">${driver ? `<button class="sm" data-route="${w.staff_id}">Rit volgen</button>` : ''}<button class="sm" data-checkout="${w.entry_id}" data-name="${esc(w.name)}">Uitklokken</button></div>
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
  $$('[data-route]', el).forEach(b => b.addEventListener('click', () => { location.hash = `routes/${b.dataset.route}`; }));
  $$('[data-checkout]', el).forEach(b => b.addEventListener('click', async () => {
    const ok = await modal.confirm({ title: `${b.dataset.name} uitklokken?`, body: 'Het uitkloktijdstip wordt nu. Vertrok die persoon eerder, pas het uur dan aan in Overzicht.', ok: 'Uitklokken' });
    if (!ok) return;
    busy(null, async () => { await rpc('mgr_check_out', { p_entry_id: b.dataset.checkout }); toast(`${b.dataset.name} is uitgeklokt.`); renderView(); }).catch(() => {});
  }));
  startPolling(60000);
}

/* ------------------------------------------------------ manager: routes */

// Leaflet and the map tiles of OpenStreetMap, only loaded on these pages.
// Leaflet is window.L: in this file L is the language helper.
let leafletLoading = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletLoading) leafletLoading = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'vendor/leaflet/leaflet.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = 'vendor/leaflet/leaflet.js';
    s.onload = () => resolve(window.L);
    s.onerror = () => { leafletLoading = null; reject(new AppError('De kaart kon niet geladen worden. Controleer je verbinding.')); };
    document.head.appendChild(s);
  });
  return leafletLoading;
}
const cssVar = k => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
function makeMap(box) {
  const map = window.L.map(box, { scrollWheelZoom: false });
  // the site sends no referrer; OpenStreetMap's tile servers ask for one
  window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(map);
  return map;
}
const placeLabel = (layer, text) => layer.bindTooltip(esc(text), { permanent: true, direction: 'top', className: 'map-label', offset: [0, -4] });

// The restaurant, the places of the round, the route of each clocked time,
// stops outside the places, and where he is now.
function drawRoute(map, a, data) {
  const accent = cssVar('--accent') || '#8E1B24', brand = cssVar('--brand') || '#6E141A', on = cssVar('--on') || '#008B3C', warn = cssVar('--warn') || '#8F5B00';
  const bounds = [];
  if (data.site && data.site.lat != null) {
    window.L.circle([data.site.lat, data.site.lng], { radius: data.site.radius_m, color: brand, weight: 1, fillOpacity: 0.08 }).addTo(map);
    placeLabel(window.L.circleMarker([data.site.lat, data.site.lng], { radius: 6, color: brand, fillColor: brand, fillOpacity: 1, weight: 2 }).addTo(map), 'Restaurant');
    bounds.push([data.site.lat, data.site.lng]);
  }
  for (const cp of data.checkpoints) {
    const seen = a.visited.has(cp.id);
    window.L.circle([cp.lat, cp.lng], { radius: cp.radius_m, color: seen ? on : warn, weight: 1, fillOpacity: 0.12 }).addTo(map);
    placeLabel(window.L.circleMarker([cp.lat, cp.lng], { radius: 5, color: seen ? on : warn, fillColor: seen ? on : warn, fillOpacity: 1, weight: 2 }).addTo(map), cp.name);
    bounds.push([cp.lat, cp.lng]);
  }
  for (const s of a.sessions) {
    const line = s.points.map(p => [p.lat, p.lng]);
    if (line.length > 1) window.L.polyline(line, { color: accent, weight: 4, opacity: 0.8 }).addTo(map);
    bounds.push(...line);
    for (const it of s.items) if (it.type === 'stop') {
      window.L.circleMarker([it.lat, it.lng], { radius: 6, color: warn, fillColor: '#fff', fillOpacity: 1, weight: 3 }).addTo(map)
        .bindTooltip(`Stop ${fmt.time(it.from)} – ${fmt.time(it.to)}`);
    }
    if (s.open && s.last) {
      window.L.circleMarker([s.last.lat, s.last.lng], { radius: 9, color: '#fff', fillColor: accent, fillOpacity: 1, weight: 3, className: 'map-now' }).addTo(map)
        .bindTooltip(`Nu · laatst gezien ${fmt.time(s.last.at)}`, { permanent: true, direction: 'right', className: 'map-label now' });
    }
  }
  if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
  else if (bounds.length) map.setView(bounds[0], 14);
  else map.setView([50.85, 4.35], 8);
}

// The day as a list: clocked in, each place or stop with the drive in
// between, the times without a position, clocked out.
function routeTimeline(a) {
  if (!a.sessions.length) return '<p class="empty">Niet ingeklokt op deze dag.</p>';
  const gapNote = (s, from, to, used) => s.gaps.filter(g => !used.has(g) && g.from < to && g.to > from).map(g => {
    used.add(g);
    return `<span class="pill warn">Geen locatie ${fmt.time(g.from)} – ${fmt.time(g.to)}</span>`;
  }).join(' ');
  return a.sessions.map(s => {
    const used = new Set(), rows = [];
    const first = s.items[0], lastItem = s.items[s.items.length - 1];
    rows.push(`<li class="tl-in"><span class="tl-time">${fmt.time(s.start)}</span><span class="tl-what"><strong>Ingeklokt</strong>
      ${gapNote(s, s.start, first ? first.from : s.end, used)}</span></li>`);
    s.items.forEach((it, i) => {
      const mins = (it.to - it.from) / 60000;
      rows.push(it.type === 'visit'
        ? `<li class="tl-visit ${it.place.site ? 'is-site' : ''}"><span class="tl-time">${fmt.time(it.from)}</span><span class="tl-what"><strong>${esc(it.place.name)}</strong>
            <span class="muted small">${fmt.time(it.from)} – ${fmt.time(it.to)} · ${fmt.dur(mins)} ter plaatse</span> ${gapNote(s, it.from, it.to, used)}</span></li>`
        : `<li class="tl-stop"><span class="tl-time">${fmt.time(it.from)}</span><span class="tl-what"><strong>Stop, geen plaats van de ronde</strong>
            <span class="muted small">${fmt.time(it.from)} – ${fmt.time(it.to)} · ${fmt.dur(mins)}${it.gap ? ' · deels zonder locatie' : ''}</span>
            <button class="link small" data-stop="${it.lat.toFixed(6)},${it.lng.toFixed(6)}">Als plaats bewaren</button> ${gapNote(s, it.from, it.to, used)}</span></li>`);
      const leg = s.legs[i];
      if (leg) rows.push(`<li class="tl-leg"><span class="tl-time"></span><span class="tl-what">↓ ${fmt.dur(leg.minutes)} rijden · ${num(leg.km, 1)} km ${gapNote(s, leg.from, leg.to, used)}</span></li>`);
    });
    rows.push(s.open
      ? `<li class="tl-out is-open"><span class="tl-time">nu</span><span class="tl-what"><strong>Nog ingeklokt</strong>
          ${s.last ? `<span class="muted small">laatst gezien ${fmt.time(s.last.at)}</span>` : ''} ${gapNote(s, lastItem ? lastItem.to : s.start, s.end, used)}</span></li>`
      : `<li class="tl-out"><span class="tl-time">${fmt.time(s.end)}</span><span class="tl-what"><strong>Uitgeklokt</strong>
          ${s.entry.pending ? '<span class="pill accent">Uur wacht op goedkeuring</span>' : s.entry.edited ? '<span class="pill">Aangepast</span>' : ''}
          ${s.entry.note ? `<span class="muted small">“${esc(s.entry.note)}”</span>` : ''} ${gapNote(s, lastItem ? lastItem.to : s.start, s.end, used)}</span></li>`);
    return `<ol class="timeline">${rows.join('')}</ol>`;
  }).join('');
}

// A machine visit from MATO Info: what went in and out, and how.
function visitWhat(v) {
  const parts = [];
  if (v.added) parts.push(`${v.added} ${v.added === 1 ? 'stuk' : 'stuks'} erin`);
  if (v.removed) parts.push(`${v.removed} eruit`);
  return parts.join(' · ') || 'nagekeken';
}
const visitHow = v => v.round_no != null ? `ronde ${v.round_no}${v.round_done ? '' : ', nog bezig'}` : v.via_adjust ? 'via Voorraad aanpassen' : 'bijgevuld';
const visitSpan = v => new Date(v.last_at) - new Date(v.first_at) >= 120000 ? ` · ${fmt.time(v.first_at)} – ${fmt.time(v.last_at)}` : '';

// The day from MATO Info: clocked in, each machine he filled with the time in
// between, clocked out. Visits more than 15 minutes outside a clocked time are
// returned apart.
function matoTimeline(entries, visits, nowMs) {
  const t = x => new Date(x).getTime();
  const sessions = [...entries].sort((x, y) => t(x.clock_in) - t(y.clock_in))
    .map(e => ({ e, start: t(e.clock_in), end: e.clock_out ? t(e.clock_out) : nowMs, visits: [] }));
  const outside = [];
  for (const v of visits) {
    const at = t(v.first_at), s = sessions.find(x => at >= x.start - 15 * 60000 && at <= x.end + 15 * 60000);
    (s ? s.visits : outside).push(v);
  }
  const row = (time, what, cls) => `<li class="${cls}"><span class="tl-time">${time}</span><span class="tl-what">${what}</span></li>`;
  const leg = (mins, text) => row('', `↓ ${fmt.dur(mins)} ${text}`, 'tl-leg');
  const html = sessions.map(s => {
    const rows = [row(fmt.time(s.start), '<strong>Ingeklokt</strong>', 'tl-in')];
    let prev = s.start;
    s.visits.forEach((v, i) => {
      const gap = (t(v.first_at) - prev) / 60000;
      if (gap >= 1) rows.push(leg(gap, i ? 'tot de volgende automaat' : 'tot de eerste automaat'));
      rows.push(row(fmt.time(v.first_at), `<strong>${esc(v.machine)}</strong>
        <span class="muted small">${esc(visitWhat(v))} · ${esc(visitHow(v))}${visitSpan(v)}</span>`, 'tl-visit'));
      prev = Math.max(prev, t(v.last_at));
    });
    if (!s.visits.length) rows.push(row('', '<span class="muted small">Nog niets bijgevuld in MATO Info.</span>', 'tl-leg'));
    else if ((s.end - prev) / 60000 >= 1) rows.push(leg((s.end - prev) / 60000, s.e.clock_out ? 'tot het uitklokken' : 'sinds de laatste automaat'));
    rows.push(s.e.clock_out
      ? row(fmt.time(s.end), `<strong>Uitgeklokt</strong>
          ${s.e.pending ? '<span class="pill accent">Uur wacht op goedkeuring</span>' : s.e.edited ? '<span class="pill">Aangepast</span>' : ''}
          ${s.e.note ? `<span class="muted small">“${esc(s.e.note)}”</span>` : ''}`, 'tl-out')
      : row('nu', '<strong>Nog ingeklokt</strong>', 'tl-out is-open'));
    return `<ol class="timeline">${rows.join('')}</ol>`;
  }).join('');
  return { html, outside };
}

const visitRows = list => `<ol class="timeline">${list.map(v => `<li class="tl-visit"><span class="tl-time">${fmt.time(v.first_at)}</span>
  <span class="tl-what"><strong>${esc(v.machine)}</strong><span class="muted small">${esc(visitWhat(v))} · ${esc(visitHow(v))}${visitSpan(v)}</span></span></li>`).join('')}</ol>`;

async function viewRoutes(el, current) {
  const day = S.routeDay || startOfDay(now());
  S.routeDay = day;
  const gps = !!S.settings.track_route;
  const [data] = await Promise.all([
    rpc('mgr_routes', { p_staff_id: S.routeStaff || null, p_from: day.toISOString(), p_to: addDays(day, 1).toISOString() }),
    gps ? loadLeaflet().catch(e => e) : null,
  ]);
  if (!current()) return;
  S.routeStaff = data.staff_id;
  const driver = data.drivers.find(d => d.id === data.staff_id);
  const a = Route.analyse({ entries: data.entries, points: data.points, checkpoints: data.checkpoints, site: data.site, now: now().getTime() });
  const visits = data.visits || [];
  const mt = matoTimeline(data.entries, visits, now().getTime());
  const isToday = sameDay(day, now());
  const go = (id, d) => { location.hash = `routes/${id}/${toDateInput(d)}`; };
  const working = a.sessions.some(s => s.open);
  const first = driver ? esc(driver.name.split(' ')[0]) : '';
  const m = data.mato;
  const matoCard = `<section class="card">
      <div class="card-head"><h2>MATO Info</h2>${m ? '<button class="sm" id="mato-now">Nu ophalen</button>' : ''}</div>
      ${m ? `<p class="muted small" style="margin-top:6px">Wat ${driver ? `<strong>${esc(data.mato_name)}</strong>` : 'de chauffeur'} in MATO Info bijvult, komt hier elke 5 minuten vanzelf binnen, met de automaat, het uur en het aantal stuks.${m.last_sync_at ? ` Laatst opgehaald ${esc(fmt.when(m.last_sync_at))}.` : ''}</p>
        ${m.last_error ? `<p class="hint bad">De laatste keer lukte het niet: ${esc(tr(m.last_error))}</p>` : ''}
        ${driver ? `<p class="muted small">Heet hij anders in MATO Info? Pas het aan bij <a href="#team/${driver.id}">Team</a>.</p>` : ''}`
        : '<p class="muted small" style="margin-top:6px">MATO Info is nog niet gekoppeld.</p>'}
    </section>`;
  const zoneCard = `<section class="card">
      <div class="card-head"><h2>Inklokzone</h2><button class="sm" id="site-edit">Aanpassen</button></div>
      <p class="muted small" style="margin-top:6px">${data.site.lat != null
        ? `De chauffeur kan alleen in- en uitklokken binnen <strong>${metres(data.site.radius_m)}</strong> van het restaurant. Hoe nauwkeurig zijn telefoon is, telt in zijn voordeel: binnen staat een telefoon vaak 30 tot 100 m naast.`
        : 'Duid aan waar het restaurant is. Zonder die plaats kan de chauffeur niet inklokken.'}</p>
    </section>`;
  const gpsCard = `<section class="card">
      <h2>Gps-rit</h2>
      <label class="check" style="margin-top:10px"><input type="checkbox" id="rt-gps" ${gps ? 'checked' : ''}> Ook de gereden weg met gps bijhouden</label>
      <p class="muted small" style="margin-top:6px">Dan zie je de rit op een kaart, met plaatsen die je zelf aanduidt. De app moet daarvoor open blijven op zijn telefoon tijdens de ronde. Uit: de ronde komt alleen uit MATO Info, en zijn locatie wordt enkel bij het in- en uitklokken gevraagd.</p>
    </section>`;
  const outsideNote = mt.outside.length ? `<div class="hint warn" style="margin-top:12px"><strong>Bijgevuld terwijl hij niet ingeklokt was</strong>${visitRows(mt.outside)}</div>` : '';
  const added = visits.reduce((x, v) => x + v.added, 0);
  el.innerHTML = `
    <div class="view-head">
      <div><h1>Ritten</h1><p>Wanneer de chauffeur bij elke automaat was, wat hij bijvulde en hoe lang hij erover deed.</p></div>
      ${periodBar(fmt.dayLong(day), isToday ? 'Vandaag' : '', 'rt-prev', 'rt-next')}
    </div>
    ${data.drivers.length > 1 ? `<div class="chips">${data.drivers.map(d => `<button class="chip ${d.id === data.staff_id ? 'is-on' : ''}" data-driver="${d.id}">${esc(d.name)}${d.working ? ' ●' : ''}</button>`).join('')}</div>` : ''}
    ${driver ? '' : '<p class="hint info">Nog geen chauffeur. Geef iemand bij Team de rol <strong>Chauffeur</strong>.</p>'}
    ${driver ? `<div class="stats">
      <div class="stat good"><span class="v">${fmt.dur(a.minutes)}</span><span class="k">${first} gewerkt${working ? ' (bezig)' : ''}</span></div>
      <div class="stat"><span class="v">${visits.length}</span><span class="k">${visits.length === 1 ? 'Automaat bijgevuld' : 'Automaten bijgevuld'}</span></div>
      <div class="stat"><span class="v">${added}</span><span class="k">Stuks erin</span></div>
      ${gps ? `<div class="stat"><span class="v">${num(a.km, 1)} km</span><span class="k">Gereden (gps)</span></div>`
        : `<div class="stat ${mt.outside.length ? 'alert' : ''}"><span class="v">${mt.outside.length}</span><span class="k">Buiten de geklokte uren</span></div>`}
    </div>` : ''}
    <div class="route-grid">
      ${gps ? `<section class="card route-map-card"><div class="route-map" id="rt-map" role="img" aria-label="Kaart met de rit"></div>
        <p class="muted small" style="margin-top:8px">Rode lijn: de rit. Groen: plaats bezocht, oranje: nog niet. Witte bolletjes: stops buiten de plaatsen.</p></section>` : ''}
      <section class="card">
        <div class="card-head"><h2>Verloop</h2>${working ? '<span class="pill on">Onderweg</span>' : ''}</div>
        ${!driver ? '<p class="empty">Nog geen ritten.</p>'
          : gps ? `${routeTimeline(a)}${a.sessions.some(s => s.gaps.length) ? '<p class="muted small" style="margin-top:10px">Geen locatie: de app was dicht, het scherm stond uit of de telefoon had geen bereik. De uren tellen wel.</p>' : ''}
              ${visits.length ? `<h3 style="margin-top:16px">Bijgevuld volgens MATO Info</h3>${visitRows(visits)}` : ''}`
          : data.entries.length ? mt.html : `<p class="empty">Niet ingeklokt op deze dag.</p>`}
        ${driver ? outsideNote : ''}
        ${driver && !gps && data.entries.length ? '<p class="muted small" style="margin-top:10px">De tijd tussen twee automaten is rijden én klaarzetten: MATO Info noteert wanneer hij een automaat bijvult, niet wanneer hij aankomt.</p>' : ''}
      </section>
      ${gps ? '' : `<div class="stack">${matoCard}${zoneCard}${gpsCard}</div>`}
    </div>
    ${gps ? `<div class="grid-2">
      <section class="card">
        <div class="card-head"><h2>Plaatsen van de ronde</h2><button class="sm primary" id="cp-add">+ Plaats toevoegen</button></div>
        <p class="muted small" style="margin-top:6px">Plaatsen waar de chauffeur langs moet, voor de gps-rit. Komt hij binnen de zone, dan telt hij als aangekomen.</p>
        ${data.checkpoints.length ? `<div class="rows">${data.checkpoints.map(cp => {
          const v = a.visited.get(cp.id) || [];
          return `<div class="row"><div class="row-main"><span class="row-title">${esc(cp.name)}</span>
            <span class="row-sub">Zone ${metres(cp.radius_m)}${v.length ? ` · ${isToday ? 'vandaag' : 'die dag'} om ${v.map(x => fmt.time(x.from)).join(', ')}` : ''}</span></div>
            <div class="row-actions"><button class="sm" data-cp="${cp.id}">Wijzigen</button></div></div>`;
        }).join('')}</div>` : '<p class="empty">Nog geen plaatsen. Voeg ze toe met een adres, door op de kaart te tikken, of bewaar een stop uit het verloop.</p>'}
      </section>
      <div class="stack">${matoCard}${zoneCard}${gpsCard}</div>
    </div>` : ''}`;

  const box = $('#rt-map', el);
  if (box) {
    if (window.L) drawRoute(makeMap(box), a, data);
    else box.innerHTML = '<p class="empty">De kaart kon niet geladen worden. Het verloop hiernaast klopt wel.</p>';
  }
  $('#rt-prev', el).addEventListener('click', () => go(data.staff_id, addDays(day, -1)));
  $('#rt-next', el).addEventListener('click', () => go(data.staff_id, addDays(day, 1)));
  $$('[data-driver]', el).forEach(b => b.addEventListener('click', () => go(b.dataset.driver, day)));
  const cpAdd = $('#cp-add', el);
  if (cpAdd) cpAdd.addEventListener('click', () => placeModal({ center: data.site }));
  $$('[data-cp]', el).forEach(b => b.addEventListener('click', () => placeModal({ place: data.checkpoints.find(c => c.id === b.dataset.cp), center: data.site })));
  $$('[data-stop]', el).forEach(b => b.addEventListener('click', () => {
    const [lat, lng] = b.dataset.stop.split(',').map(Number);
    placeModal({ place: { lat, lng, radius_m: 75 }, center: data.site });
  }));
  $('#site-edit', el).addEventListener('click', () => placeModal({ site: data.site }));
  const now_ = $('#mato-now', el);
  if (now_) now_.addEventListener('click', () => busy(now_, async () => {
    const r = await rpc('mato', { token: S.token }, { auth: false, path: '/functions/v1/mato' });
    toast(r.report.new || r.report.updated ? `Opgehaald uit MATO Info: ${plural(r.report.new, 'nieuwe bijvulling', 'nieuwe bijvullingen')}${r.report.updated ? `, ${r.report.updated} bijgewerkt` : ''}.` : 'Opgehaald uit MATO Info. Niets nieuws.');
    renderView();
  }).catch(() => renderView()));
  const gpsBox = $('#rt-gps', el);
  gpsBox.addEventListener('change', async () => {
    const on = gpsBox.checked;
    if (on && !(await modal.confirm({ title: 'Gps-rit aanzetten?', body: 'De app vraagt dan de hele ronde de locatie van de chauffeur en moet daarvoor open blijven op zijn telefoon. Vertel hem dat op voorhand.', ok: 'Aanzetten' }))) { gpsBox.checked = false; return; }
    busy(null, async () => {
      await rpc('mgr_save_track_route', { p_on: on });
      await refreshMe();
      toast(on ? 'De gps-rit staat aan.' : 'De gps-rit staat uit. De ronde komt uit MATO Info.');
      renderView();
    }).catch(() => { gpsBox.checked = !on; });
  });
  if (isToday) startPolling(working ? 60000 : 300000);
}

// Add or change a place of the round, or the restaurant's zone (site): tap the
// map, use this phone's location, or look up an address.
function placeModal({ place = null, site = null, center = null }) {
  const isSite = !!site, cur = isSite ? site : place || {};
  let pos = cur.lat != null ? { lat: cur.lat, lng: cur.lng } : null;
  const radii = isSite ? [50, 75, 100, 150, 200, 300, 500] : [30, 50, 75, 100, 150, 200, 300];
  const radius = cur.radius_m || (isSite ? 150 : 75);
  const d = modal.open(`
    <h2 id="modal-title">${isSite ? 'Inklokzone van het restaurant' : place && place.id ? 'Plaats wijzigen' : 'Plaats toevoegen'}</h2>
    <form id="pl-form" novalidate>
      <div class="form-grid">
        ${isSite ? '' : `<div class="field wide"><label for="pl-name">Naam</label><input id="pl-name" maxlength="80" value="${esc(cur.name || '')}" placeholder="bv. Automaat station Torhout"></div>`}
        <div class="field"><label for="pl-radius">Zone</label><select id="pl-radius">${[...new Set([...radii, radius])].sort((x, y) => x - y)
          .map(r => `<option value="${r}" ${r === radius ? 'selected' : ''}>${metres(r)} rondom</option>`).join('')}</select></div>
        <div class="field"><label>&nbsp;</label><button type="button" id="pl-here">Mijn locatie nu</button></div>
        <div class="field wide"><label for="pl-q">Adres zoeken</label>
          <div class="copybox"><input id="pl-q" maxlength="120" placeholder="Straat en nummer, gemeente"><button type="button" class="sm" id="pl-find">Zoeken</button></div>
          <div id="pl-results" class="pl-results"></div></div>
      </div>
      <div class="pl-map" id="pl-map" role="img" aria-label="Tik op de kaart om de plaats aan te duiden"></div>
      <p class="muted small" id="pl-pos" style="margin-top:6px"></p>
      <p class="form-error" id="pl-err"></p>
      <div class="form-actions">
        ${place && place.id ? '<button type="button" class="danger" id="pl-rm">Verwijderen</button>' : ''}
        <button type="button" data-close>Annuleren</button><button type="submit" class="primary">Opslaan</button>
      </div>
    </form>`, null, { wide: true });
  const err = $('#pl-err', d), info = $('#pl-pos', d);
  let map = null, pin = null, ring = null;
  const show = () => {
    info.textContent = pos ? `Aangeduid: ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}` : 'Tik op de kaart, zoek een adres of gebruik je locatie.';
    if (!map || !pos) return;
    const r = Number($('#pl-radius', d).value);
    if (!pin) {
      pin = window.L.marker([pos.lat, pos.lng], { draggable: true, icon: window.L.divIcon({ className: 'map-pin', iconSize: [18, 18] }) }).addTo(map);
      pin.on('dragend', () => { const ll = pin.getLatLng(); pos = { lat: ll.lat, lng: ll.lng }; show(); });
      ring = window.L.circle([pos.lat, pos.lng], { radius: r, color: cssVar('--accent'), weight: 1, fillOpacity: 0.12 }).addTo(map);
    }
    pin.setLatLng([pos.lat, pos.lng]);
    ring.setLatLng([pos.lat, pos.lng]).setRadius(r);
  };
  const moveTo = (p, zoom = 17) => { pos = p; show(); if (map) map.setView([p.lat, p.lng], Math.max(map.getZoom(), zoom)); };
  loadLeaflet().then(() => {
    if (!d.open) return;
    map = makeMap($('#pl-map', d));
    const c = pos || (center && center.lat != null ? center : null);
    map.setView(c ? [c.lat, c.lng] : [51.03, 3.1], pos ? 17 : c ? 13 : 10);
    map.on('click', ev => { pos = { lat: ev.latlng.lat, lng: ev.latlng.lng }; show(); });
    setTimeout(() => map.invalidateSize(), 50);
    show();
  }).catch(e => { $('#pl-map', d).innerHTML = `<p class="empty">${esc(e.message)} Gebruik je locatie of zoek een adres.</p>`; });
  show();
  $('#pl-radius', d).addEventListener('change', show);
  $('#pl-here', d).addEventListener('click', ev => busy(ev.currentTarget, async () => moveTo(await getPosition())).catch(() => {}));
  const find = async () => {
    const q = $('#pl-q', d).value.trim(), out = $('#pl-results', d);
    if (q.length < 3) { out.innerHTML = '<p class="muted small">Typ een straat en een gemeente.</p>'; return; }
    out.innerHTML = '<p class="muted small">Zoeken…</p>';
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=be,fr,nl&q=${encodeURIComponent(q)}`,
        { referrerPolicy: 'strict-origin-when-cross-origin', headers: { 'Accept-Language': 'nl' } });
      const list = res.ok ? await res.json() : [];
      out.innerHTML = list.length ? list.map((x, i) => `<button type="button" class="pl-hit" data-hit="${i}">${esc(x.display_name)}</button>`).join('')
        : '<p class="muted small">Niets gevonden. Probeer het met minder woorden, of tik op de kaart.</p>';
      $$('[data-hit]', out).forEach(b => b.addEventListener('click', () => { const x = list[+b.dataset.hit]; moveTo({ lat: +x.lat, lng: +x.lon }); out.innerHTML = ''; }));
    } catch { out.innerHTML = '<p class="muted small">Zoeken lukte niet. Tik op de kaart of gebruik je locatie.</p>'; }
  };
  $('#pl-find', d).addEventListener('click', find);
  $('#pl-q', d).addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); find(); } });
  const rm = $('#pl-rm', d);
  if (rm) rm.addEventListener('click', () => busy(rm, async () => {
    await rpc('mgr_archive_checkpoint', { p_id: place.id });
    modal.close();
    toast(`${place.name} verwijderd.`);
    renderView();
  }).catch(() => {}));
  $('#pl-form', d).addEventListener('submit', async ev => {
    ev.preventDefault();
    err.textContent = '';
    const name = isSite ? '' : $('#pl-name', d).value.trim(), r = Number($('#pl-radius', d).value);
    if (!isSite && !name) { err.textContent = 'Geef de plaats een naam.'; return; }
    if (!pos) { err.textContent = 'Duid aan waar het is: tik op de kaart, zoek een adres of gebruik je locatie.'; return; }
    await busy($('button[type=submit]', d), async () => {
      if (isSite) await rpc('mgr_save_site', { p_lat: pos.lat, p_lng: pos.lng, p_radius: r });
      else await rpc('mgr_save_checkpoint', { p_id: (place && place.id) || null, p_name: name, p_lat: pos.lat, p_lng: pos.lng, p_radius: r });
      modal.close();
      if (isSite) await refreshMe();
      toast(isSite ? 'Inklokzone opgeslagen.' : `${name} opgeslagen.`);
      renderView();
    }).catch(x => { err.textContent = x.message; });
  });
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

const ROLE_NL = { staff: 'Medewerker', manager: 'Verantwoordelijke', viewer: 'Familie · alleen overzicht', driver: 'Chauffeur' };
const roleOptions = sel => Object.entries({ staff: 'Medewerker', manager: 'Verantwoordelijke (ziet alles)', viewer: 'Familie (alleen het maandoverzicht)', driver: 'Chauffeur (geen planning, klokt in aan het restaurant)' })
  .map(([k, l]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${l}</option>`).join('');
const payOptions = sel => `<option value="">Niet ingevuld</option>${Object.entries(PAY)
  .map(([k, [l]]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${l}</option>`).join('')}`;

async function viewTeam(el, current) {
  const [staff, off, contact] = await Promise.all([loadStaff(true), rpc('mgr_officient_status'), rpc('shift_contact')]);
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
              <span class="help" id="ap-role-help" hidden>Een familie-account ziet alleen het maandoverzicht: wie wanneer werkt, de open shiften, de uren, het uurloon en cash of ingeschreven. In het Nederlands of het Chinees. Het kan niet inklokken en geen shiften opnemen.</span>
              <span class="help" id="ap-driver-help" hidden>Een chauffeur ziet geen planning. Hij klokt in en uit aan het restaurant, met de locatie van zijn telefoon, en ziet zijn uren per dag. Terwijl hij ingeklokt is, houdt de app zijn rit bij: dat zie je bij Ritten. Zijn uren gaan niet naar Officient.</span></div>
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
          <div class="field wide"><label id="st-who-label">Wie klokt in</label>
            <div class="days" role="group" aria-labelledby="st-who-label">${Object.entries(CONTRACT_SHORT).map(([k, l]) => `<label><input type="checkbox" data-clock-type="${k}" ${(st.clock_types || []).includes(k) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
            <span class="help">Wie aangevinkt is, ziet de klok. De anderen niet: zij krijgen elke dag XP. Verantwoordelijken, chauffeurs en wie nog geen statuut heeft, klokken altijd in.</span></div>
          <div class="field"><label for="st-dxp">XP per dag voor wie niet inklokt</label><input id="st-dxp" type="number" inputmode="numeric" min="0" max="500" step="5" value="${st.daily_xp ?? 50}"></div>
          <div class="field"><label for="st-cname">Annuleren op de dag zelf: contactpersoon</label><input id="st-cname" maxlength="60" value="${esc(contact.name || '')}" placeholder="bv. Xin Chen"></div>
          <div class="field"><label for="st-cphone">Telefoon van de contactpersoon</label><input id="st-cphone" type="tel" maxlength="30" value="${esc(contact.phone || '')}" placeholder="bv. 0486 15 92 09">
            <span class="help">Wie een shift wil annuleren die vandaag (of binnen de termijn) begint, ziet deze naam met een knop om te bellen of te WhatsAppen.</span></div>
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
      refreshTabs();
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
    $('#ap-driver-help', ap).hidden = apRole.value !== 'driver';
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
      await rpc('mgr_save_clock_who', { p_types: $$('[data-clock-type]', sf).filter(b => b.checked).map(b => b.dataset.clockType),
        p_daily_xp: Number($('#st-dxp', sf).value) });
      await rpc('mgr_save_contact', { p_name: $('#st-cname', sf).value, p_phone: $('#st-cphone', sf).value });
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
            <div class="field wide"><label class="check"><input type="checkbox" id="pm-rank" ${p.in_ranking ? 'checked' : ''}> Toon in de ranglijst</label>
              <span class="help">Met avatar, level en titel, en collega's kunnen de kaart openen. Het account zelf blijft alleen het maandoverzicht zien.</span></div>
            <div class="field"><label for="pm-bonus">Bonus-XP</label><input id="pm-bonus" type="number" min="0" max="100000" step="1" inputmode="numeric" value="${p.xp_bonus || 0}">
              <span class="help">Level 20 = ${num(xpForLevel(20), 0)} XP, level 25 = ${num(xpForLevel(25), 0)} XP.</span></div>
            <div class="field"><label for="pm-title">Grappige titel</label><input id="pm-title" list="pm-titles" maxlength="40" autocomplete="off"
              value="${esc(p.fun_title ? (TITLE_BY[p.fun_title] ? TITLE_BY[p.fun_title][1] : p.fun_title) : '')}" placeholder="${esc(funTitle({ id: p.id }))} (gekozen door de app)">
              <datalist id="pm-titles">${TITLES.map(t => `<option value="${esc(t[1])}">`).join('')}</datalist></div>
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
    const bonus = Number($('#pm-bonus', pm).value || 0);
    if (!Number.isInteger(bonus) || bonus < 0 || bonus > 100000) { err.textContent = 'Bonus-XP moet een getal tussen 0 en 100.000 zijn.'; return; }
    await busy($('button[type=submit]', pm), async () => {
      await rpc('mgr_save_staff', {
        p_id: p.id, p_name: $('#pm-name', pm).value, p_pin: pin || null, p_role: $('#pm-role', pm).value,
        p_hourly_rate: null, p_active: $('#pm-active', pm).checked,
      });
      const rank = $('#pm-rank', pm).checked;
      if (rank !== !!p.in_ranking) await rpc('mgr_set_in_ranking', { p_id: p.id, p_on: rank });
      if (bonus !== (p.xp_bonus || 0)) await rpc('mgr_set_xp_bonus', { p_id: p.id, p_bonus: bonus });
      const typed = $('#pm-title', pm).value.trim(), key = (TITLES.find(t => t[1].toLowerCase() === typed.toLowerCase()) || [])[0];
      const title = key || typed || null;
      if (title !== (p.fun_title || null)) await rpc('mgr_set_title', { p_id: p.id, p_title: title });
      toast(pin ? `Opgeslagen. Nieuwe pincode: ${pin}` : 'Opgeslagen.');
      await loadStaff(true);
      renderView();
    }).catch(e => { err.textContent = e.message; });
  });
}

async function viewMember(el, current) {
  const id = S.memberId;
  const [r, templates, months] = await Promise.all([rpc('mgr_get_staff', { p_id: id }), rpc('mgr_templates'),
    rpc('mgr_pay_months', { p_staff_id: id }), loadStaff()]);
  if (!current()) return;
  const p = r.person, pr = r.profile, xp = r.xp, self = p.id === S.me.id, first = p.name.split(' ')[0];
  const mine = templates.filter(tp => tp.staff_id === p.id);
  if (p.role === 'viewer') return familyMember(el, r);
  const driver = p.role === 'driver';
  el.innerHTML = `
    <div class="view-head"><div class="hello">
      ${personPic(p, 'xl')}
      <div><button class="link back" id="back">‹ Team</button><h1>${esc(p.name)}</h1>
        <p class="lvl-line">${levelPill(xp)} <span>${esc(levelTitle(xp.level))}</span> <span class="muted">· ${ROLE_NL[p.role]}${p.active ? '' : ' · Inactief'}</span> ${payPill(p.pay_method)}${p.officient_id ? ' <span class="pill">Officient</span>' : ''}</p></div>
    </div>${driver ? `<button class="sm" id="see-routes">${ICONS.route} Ritten bekijken</button>` : ''}</div>
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
            <div class="field"><label for="pm-type">Statuut</label><select id="pm-type">${contractOptions(p.contract_type)}</select>
              ${driver ? '' : `<span class="help">${p.can_clock ? `${esc(first)} klokt in.` : `${esc(first)} klokt niet in en krijgt ${S.settings.daily_xp || 0} XP per dag.`} Wie inklokt, kies je bij <a href="#team">Team → Instellingen</a>.</span>`}</div>
            <div class="field"><label for="pm-pid">Werknemersnummer (Securex)</label><input id="pm-pid" maxlength="30" autocomplete="off" value="${esc(p.payroll_id || '')}"></div>
            <div class="field"><label for="pm-start">In dienst sinds</label><input id="pm-start" data-k="start_date" inputmode="numeric" placeholder="dd/mm/jjjj" maxlength="10" value="${esc(isoToDMY(pr.start_date))}"></div>
            <div class="field"><label for="pm-role">Rol</label><select id="pm-role">${roleOptions(p.role)}</select></div>
            ${driver ? '' : `<div class="field"><label for="pm-title">Grappige titel</label><input id="pm-title" list="pm-titles" maxlength="40" autocomplete="off"
              value="${esc(p.fun_title ? (TITLE_BY[p.fun_title] ? TITLE_BY[p.fun_title][1] : p.fun_title) : '')}" placeholder="${esc(funTitle({ id: p.id }))} (gekozen door de app)">
              <datalist id="pm-titles">${TITLES.map(t => `<option value="${esc(t[1])}">`).join('')}</datalist>
              <span class="help">Kies er een of typ je eigen titel. Collega's zien hem op ${esc(first)}'s kaart.</span></div>`}
            <div class="field"><label for="pm-lang">Taal van de app</label><select id="pm-lang">${[['', 'Zoals de telefoon'], ['nl', 'Nederlands'], ['zh', '中文 (Chinees)']].map(([k, l]) =>
              `<option value="${k}" ${(p.lang || '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
              <span class="help">Wat ${esc(first)} ziet: klok, shiften, uren, profiel. Jouw schermen blijven Nederlands.</span></div>
            <div class="field"><label for="pm-bonus">Bonus-XP</label><input id="pm-bonus" type="number" min="0" max="100000" step="1" inputmode="numeric" value="${p.xp_bonus || 0}">
              <span class="help">XP die jij geeft, bovenop het werk. Telt voor het level, niet voor de uren of het loon. Level 20 = ${num(xpForLevel(20), 0)} XP.</span></div>
            ${driver || p.role === 'manager' ? '' : `<div class="field wide"><label class="check"><input type="checkbox" id="pm-noshifts" ${p.shifts_hidden ? 'checked' : ''}> Shiften verbergen voor ${esc(first)}</label>
              <span class="help">Voorlopig geen kalender, geen open shiften en geen herinneringen. Shiften die jij aan ${esc(first)} geeft, ziet ${esc(first)} wel.</span></div>`}
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
    ${driver ? `<section class="card"><h2>Chauffeur</h2><p class="muted small" style="margin-top:6px">${esc(first)} heeft geen planning. ${esc(first)} klokt in en uit aan het restaurant en ziet de eigen uren per dag. Wat ${esc(first)} in MATO Info bijvult, staat bij <a href="#routes/${p.id}">Ritten</a>. Deze uren gaan niet naar Officient.</p>
      <form id="mato-form" novalidate><div class="form-grid" style="margin-top:12px">
        <div class="field"><label for="pm-mato">Naam in MATO Info</label><input id="pm-mato" maxlength="60" value="${esc(p.mato_name_own || '')}" placeholder="${esc(first)}">
          <span class="help">De naam waarop ${esc(first)} in MATO Info bijvult. Leeg = ${esc(first)}.</span></div>
        <div class="field"><label>&nbsp;</label><button type="submit" class="sm">Opslaan</button></div>
      </div><p class="form-error" id="mato-err"></p></form></section>` : `<section class="card">
      <div class="card-head"><h2>Vaste uren</h2>${p.active ? '<button class="sm" id="add-fixed">+ Vaste uren toevoegen</button>' : ''}</div>
      <p class="muted small" style="margin-top:6px">Werkt ${esc(first)} elke week op dezelfde momenten? Dan kan ${esc(first)} tijdens die uren inklokken. Vaste uren staan niet in de kalender: die is voor studenten en deeltijdsen.</p>
      ${p.contract_minutes && contractText(p.contract_minutes) ? `<p class="small" style="margin-top:6px">Contracturen volgens Officient: <strong>${esc(contractText(p.contract_minutes))}</strong></p>` : ''}
      ${mine.length ? `<div class="rows">${mine.map(tp => `
        <div class="row"><div class="row-main"><span class="row-title">${esc(tp.label || 'Shift')}</span>
          <span class="row-sub">${daysText(tp.weekdays)} · <span class="time">${tp.start_time} – ${tp.end_time}</span></span></div>
          <div class="row-actions"><button class="sm" data-template="${tp.id}">Wijzigen</button></div></div>`).join('')}</div>`
        : '<p class="empty">Geen vaste uren. Shiften neemt die persoon zelf op of krijgt ze van jou.</p>'}
    </section>`}
    <section class="card">
      <div class="card-head"><h2>Persoonlijke gegevens</h2><button class="sm" id="from-slip">Invullen vanuit een loonfiche</button></div>
      <p class="muted small" style="margin-top:6px">${esc(first)} kan deze gegevens ook zelf invullen bij Profiel. Alleen die persoon en de verantwoordelijken zien ze.</p>
      ${p.officient_connected ? `<div class="off-person">${p.officient_id
        ? `${p.officient_pending.length ? `<span class="pill warn">Nog niet in Officient: ${p.officient_pending.map(k => PERSON_LABEL[k]).join(', ')}</span>` : '<span class="muted small">Gekoppeld met Officient.</span>'}
           <button type="button" class="sm" id="pf-off">Vergelijken met Officient…</button>`
        : `<span class="muted small">Nog niet in Officient.</span> <button type="button" class="sm" id="pf-off-add">In Officient aanmaken…</button>`}</div>` : ''}
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
        <div class="card-head"><h2>Loonbrieven per maand</h2><button class="sm primary" id="slip-up">Loonfiche uploaden</button></div>
        ${payMonthsTable(months) || '<p class="empty">Nog geen loonfiches.</p>'}
        <p class="muted small" style="margin-top:10px">Gewerkt, bruto en netto komen uit de loonbrieven; geklokt uit de app. ${esc(first)} ziet hetzelfde bij Mijn uren.</p>
      </section>
    </div>
    <input type="file" id="slip-file" accept="application/pdf,image/png,image/jpeg" hidden>`;

  $('#back', el).addEventListener('click', () => { location.hash = 'team'; });
  const seeRoutes = $('#see-routes', el);
  if (seeRoutes) seeRoutes.addEventListener('click', () => { location.hash = `routes/${p.id}`; });
  const matoForm = $('#mato-form', el);
  if (matoForm) matoForm.addEventListener('submit', ev => {
    ev.preventDefault();
    busy($('button[type=submit]', matoForm), async () => {
      const r = await rpc('mgr_set_mato_name', { p_id: p.id, p_name: $('#pm-mato', matoForm).value });
      toast(`Opgeslagen. Bijvullingen van “${r.mato_name}” in MATO Info komen bij ${first}.`);
      renderView();
    }).catch(e => { $('#mato-err', matoForm).textContent = e.message; });
  });
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
      const hide = $('#pm-noshifts', pm);
      if (hide && hide.checked !== !!p.shifts_hidden) await rpc('mgr_set_shifts_hidden', { p_id: p.id, p_hidden: hide.checked });
      const lng = $('#pm-lang', pm).value || null;
      if (lng !== (p.lang || null)) await rpc('mgr_set_language', { p_id: p.id, p_lang: lng });
      const ti = $('#pm-title', pm);
      if (ti) {
        const typed = ti.value.trim(), key = (TITLES.find(t => t[1].toLowerCase() === typed.toLowerCase()) || [])[0];
        const title = key || typed || null; // a title from the list is kept by its key, so it reads in Chinese too
        if (title !== (p.fun_title || null)) await rpc('mgr_set_title', { p_id: p.id, p_title: title });
      }
      toast(pin ? `Opgeslagen. Nieuwe pincode: ${pin}` : 'Opgeslagen.');
      await loadStaff(true);
      if (self) { await refreshMe(); renderShell(); } else refreshTabs();
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

  const pfOff = $('#pf-off', el), pfAdd = $('#pf-off-add', el);
  if (pfOff) pfOff.addEventListener('click', () => personOfficientModal(p));
  if (pfAdd) pfAdd.addEventListener('click', () => personAddModal(p, pr));

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
  bindPayMonths(el);
}

const fileType = f => f ? (f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : '')).replace(/^image\/jpg$/, 'image/jpeg') : '';
const okFileType = t => ['application/pdf', 'image/png', 'image/jpeg'].includes(t);

/* ------------------------------------------------------ Exact Officient */

// The link with Exact Officient runs as a Supabase Edge Function: it signs in
// at Officient with the manager's own API app, and every night fetches the
// staff's details, wages, contract hours and new payslips.
const officientCall = body => rpc('officient', { token: S.token, ...body }, { auth: false, path: '/functions/v1/officient' });
const OFFICIENT_RETURN = 'prikklok.officient';
const OFFICIENT_STATE = 'prikklok.officient.state';
const OFFICIENT_SCOPES = ['basics:read', 'personal.info:read', 'wages:read', 'weekly.schedules:read', 'contracts:read', 'documents.read',
  'calendar:read', 'calendar:write', 'contracts.write', 'personal.info:write', 'basics:write'];

// Officient sends the manager back to the app with ?code=…&state=… (or an
// error); keep it until the app has signed in, and clean up the address. If
// Officient leaves out the state, the one saved before leaving is used.
(function catchOfficientReturn() {
  const q = new URLSearchParams(location.search);
  const h = new URLSearchParams(location.hash.includes('=') ? location.hash.slice(1) : '');
  const get = k => q.get(k) || h.get(k);
  const code = get('code'), error = get('error_description') || get('error');
  if (!code && !error) return;
  store.set(OFFICIENT_RETURN, JSON.stringify({ code, state: get('state') || store.get(OFFICIENT_STATE), error }));
  store.set(OFFICIENT_STATE, null);
  history.replaceState(null, '', location.pathname + '#team');
})();

async function finishOfficient() {
  const raw = store.get(OFFICIENT_RETURN);
  if (!raw || !isManager()) return;
  store.set(OFFICIENT_RETURN, null);
  let back;
  try { back = JSON.parse(raw); } catch { return; }
  if (back.error || !back.code) {
    toast(back.error ? `Officient koppelde niet: ${back.error}` : 'Koppelen met Officient geannuleerd.', 'error');
    return;
  }
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

const OFFICIENT_DOC_TYPES = { SalarySlip: 'Loonbrieven', BelcotaxSheets: 'Belcotax-fiches', IndividualAccount: 'Individuele rekeningen' };

function officientReport(r) {
  if (!r || typeof r !== 'object') return '';
  const types = Object.entries(r.document_types || {});
  const slips = new Map();
  for (const x of r.payslips) slips.set(x.name, [...new Set([...(slips.get(x.name) || []), x.month])]);
  return `
    <ul class="plain-list off-report">
      <li><strong>${r.matched}</strong> van de ${plural(r.people, 'persoon', 'mensen')} in Officient gevonden in de app${r.linked ? `, waarvan ${r.linked} nieuw gekoppeld` : ''}.</li>
      ${r.updated.length ? `<li>Bijgewerkt: ${r.updated.map(u => `${esc(u.name)} <span class="muted">(${esc(u.changed.join(', '))})</span>`).join(', ')}.</li>` : '<li>Geen gegevens gewijzigd.</li>'}
      ${slips.size ? `<li>Nieuwe loonbrieven: ${[...slips].map(([name, months]) => `${esc(name)} <span class="muted">(${months.sort().map(m => esc(fmt.month(new Date(m + 'T00:00')))).join(', ')})</span>`).join('; ')}.</li>` : '<li>Geen nieuwe loonbrieven.</li>'}
      ${r.already ? `<li>${plural(r.already, 'loonbrief stond', 'loonbrieven stonden')} er al (zelf geüpload).</li>` : ''}
      ${r.no_month ? `<li>${plural(r.no_month, 'loonbrief', 'loonbrieven')} zonder maand in de bestandsnaam overgeslagen.</li>` : ''}
      ${r.read ? `<li>${plural(r.read, 'loonbrief', 'loonbrieven')} gelezen: de uren en bedragen staan nu bij elke maand.</li>` : ''}
      ${r.more ? '<li>Er zijn nog meer loonbrieven; die komen bij de volgende ophaling.</li>' : ''}
      ${r.unmatched.length ? `<li class="off-unmatched">In Officient, maar niet in de app: <strong>${r.unmatched.map(esc).join(', ')}</strong>. Voeg ze toe bij <em>Persoon toevoegen</em> met dezelfde naam; de volgende ophaling vult hun gegevens aan.</li>` : ''}
      <li class="muted">Documenten in Officient: ${types.length ? types.map(([k, n]) => `${esc(OFFICIENT_DOC_TYPES[k] || k)} (${n})`).join(', ') : 'geen'}.</li>
    </ul>`;
}

function officientCard(o, link) {
  const callback = link, host = o.host || 'app.officient.io';
  const hostField = id => `<div class="field wide"><label for="${id}">Je Officient-adres</label>
    <input id="${id}" maxlength="120" autocomplete="off" spellcheck="false" placeholder="jouwzaak.officient.io" value="${esc(o.host || '')}">
    <span class="help">Het adres waarop je Officient opent, bv. jouwzaak.officient.io. Daar meld je je aan om te koppelen.</span></div>`;
  const appForm = `
    <form id="off-form" novalidate>
      <ol class="plain-list off-steps">
        <li>Meld je aan in Officient als beheerder. Klik rechtsboven op je avatar en dan op <a href="https://${esc(host)}/developer" target="_blank" rel="noopener">Developers</a>.</li>
        <li>Maak een <strong>client app</strong>, bv. “Prikklok”. Geef deze rechten: <code>${OFFICIENT_SCOPES.join('</code>, <code>')}</code>. De rechten die eindigen op <code>write</code> laten de app iets in Officient zetten: uren in de kalender, studentencontracten, gegevens van je personeel en nieuwe mensen. Dat gebeurt alleen als jij erop klikt.</li>
        <li>Vul als <strong>callback-URL</strong> in: <span class="copybox off-callback"><code id="off-cb">${esc(callback)}</code><button type="button" class="sm" id="off-copy">Kopiëren</button></span></li>
        <li>Kopieer de <strong>client ID</strong> en de <strong>client secret</strong> van die app hieronder.</li>
      </ol>
      <div class="form-grid" style="margin-top:12px">
        ${hostField('off-host')}
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
    <div class="form-grid off-connect-host">${hostField('off-host-connect')}</div>
    <div class="form-actions" style="justify-content:space-between"><button type="button" class="link" id="off-edit">Andere app-gegevens</button><button type="button" class="primary" id="off-connect">Koppelen met Officient</button></div>
    <div id="off-edit-box" hidden>${appForm}</div>`;
  else body = `
    <p>Elke nacht haalt de app de gegevens van je personeel uit Officient (adres, rekeningnummer, uurloon, contracturen) en de nieuwe loonbrieven.
      ${o.last_sync_at ? `Laatst opgehaald: <strong>${esc(fmt.when(o.last_sync_at))}</strong>.` : 'Nog niet opgehaald.'}</p>
    ${o.last_error ? `<p class="hint bad">Het laatste ophalen lukte niet: ${esc(tr(o.last_error))}</p>` : ''}
    ${officientReport(o.last_report)}
    ${(o.pending || []).length ? `<p class="hint warn">Gegevens aangepast in de app, nog niet in Officient: ${o.pending.map(x =>
      `<a href="#team/${x.id}">${esc(x.name)}</a> (${x.fields.map(k => PERSON_LABEL[k]).join(', ')})`).join('; ')}. Open de persoon en klik op Vergelijken met Officient.</p>` : ''}
    ${(o.unlinked || []).length ? `<p class="muted small">Niet in Officient: ${o.unlinked.map(x => `<a href="#team/${x.id}">${esc(x.name)}</a>`).join(', ')}. Wie er moet komen, maak je aan bij de persoon: In Officient aanmaken.</p>` : ''}
    <div class="form-actions" style="justify-content:space-between"><span class="toolbar"><button type="button" class="danger" id="off-disconnect">Ontkoppelen</button>
        <button type="button" id="off-connect" title="Na het aanpassen van de rechten van de app in Officient">Opnieuw koppelen</button></span>
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
        await rpc('mgr_officient_save_host', { p_host: $('#off-host', form).value });
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
    const hostInput = $('#off-host-connect', card);
    if (hostInput && hostInput.value.trim() !== (o.host || '')) await rpc('mgr_officient_save_host', { p_host: hostInput.value });
    const a = await rpc('mgr_officient_authorize');
    store.set(OFFICIENT_STATE, a.state);
    location.href = `https://${a.host}/authorize?client_id=${encodeURIComponent(a.client_id)}&state=${encodeURIComponent(a.state)}`;
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
// paid in cash or registered. It reads in Dutch or Chinese, like the staff screens.
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
  const fi = $('#fam-install', el);
  if (fi) fi.addEventListener('click', () => installGuide());
  const so = $('#fam-signout', el);
  if (so) so.addEventListener('click', askSignOut);
  startPolling(5 * 60000);
}
const famSignOut = () => isViewer() ? `${installButton('fam-install', 'signout-wide install-wide')}<button type="button" class="signout-wide" id="fam-signout">${ICONS.signout}<span>${L('Afmelden', '退出登录')}</span></button>` : '';

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

// Today in the family view: per shift who came and when, who is late, who is
// not there yet, and open places; fixed workers too.
function famTodayHTML(d) {
  const t = now(), grace = (d.grace_minutes || 0) * 60000;
  const rows = d.shifts.map(sh => {
    const a = new Date(sh.starts_at), b = new Date(sh.ends_at);
    if (!sh.staff_id) return { sh, cls: 'bad', text: L('Open, nog niemand', '空缺，还没人') };
    const mine = d.entries.filter(e => e.staff_id === sh.staff_id);
    const e = mine.find(x => new Date(x.clock_in) < b && (!x.clock_out || new Date(x.clock_out) > a)) || null;
    if (e && e.clock_out) return { sh, cls: 'done', text: L(`Gewerkt ${fmt.time(e.clock_in)} – ${fmt.time(e.clock_out)}`, `已上班 ${fmt.time(e.clock_in)} – ${fmt.time(e.clock_out)}`) };
    if (e) return new Date(e.clock_in) - a > grace
      ? { sh, cls: 'warn', text: L(`Te laat: binnen sinds ${fmt.time(e.clock_in)}`, `迟到：${fmt.time(e.clock_in)}到`) }
      : { sh, cls: 'good', text: L(`Binnen sinds ${fmt.time(e.clock_in)}`, `${fmt.time(e.clock_in)}已到`) };
    if (t < a) return { sh, cls: 'wait', text: L(`Begint om ${fmt.time(a)}`, `${fmt.time(a)}开始`) };
    return { sh, cls: 'bad', text: t < b ? L('Nog niet ingeklokt', '还没打卡') : L('Niet ingeklokt', '没有打卡') };
  });
  const planned = new Set(d.shifts.map(x => x.staff_id));
  const extra = d.entries.filter(e => !planned.has(e.staff_id) && !e.driver);
  const drivers = d.entries.filter(e => e.driver);
  return `
    <section class="card fam-today" lang="${langAttr()}">
      <h2>${L('Vandaag', '今天')} · ${esc(fam.day(t))}</h2>
      ${rows.length ? `<div class="fam-today-list">${rows.map(r => `
        <div class="fam-today-row is-${r.cls}">
          <span class="fam-today-time">${fmt.range(r.sh.starts_at, r.sh.ends_at)}</span>
          <span class="fam-today-name">${r.sh.staff_id ? esc(r.sh.staff_name) : '—'}${r.sh.fixed ? ` <span class="muted small">${L('vast', '固定')}</span>` : ''}</span>
          <span class="fam-today-state">${esc(r.text)}</span>
        </div>`).join('')}</div>` : `<p class="empty">${L('Vandaag geen shiften.', '今天没有班次。')}</p>`}
      ${extra.length ? `<p class="small" style="margin-top:8px">${L('Ook ingeklokt zonder shift', '没有排班也打了卡')}: ${extra.map(e => `${esc(e.staff_name)} (${fmt.time(e.clock_in)})`).join(', ')}</p>` : ''}
      ${drivers.length ? `<p class="small" style="margin-top:8px">${L('Chauffeur', '司机')}: ${drivers.map(e => `${esc(e.staff_name)} (${fmt.time(e.clock_in)} – ${e.clock_out ? fmt.time(e.clock_out) : L('onderweg', '在路上')})`).join(', ')}</p>` : ''}
    </section>`;
}

async function viewFamily(el, current) {
  const [{ m, r }, today] = await Promise.all([familyData(), rpc('family_today')]);
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
    ${famTodayHTML(today)}
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
  const role = p => p.role === 'manager' ? L('Verantwoordelijke', '负责人') : p.role === 'driver' ? L('Chauffeur', '司机') : L('Medewerker', '员工');
  const fixed = p => p.role === 'driver' ? L('Chauffeur, rijdt de ronde', '司机，跑路线') : p.fixed ? esc(fixedText(p.fixed, L)) : `<span class="muted">${L('Volgens de kalender', '按排班')}</span>`;
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
          <td class="num">${age(p)}</td><td class="fam-fixed">${fixed(p)}</td><td class="num">${rate(p)}</td>
          <td class="num">${fam.dur(p.worked_minutes)}</td><td class="num fam-total">${total(p)}</td>
          <td>${payPill(p.pay_method, L)}</td></tr>`).join('')}</tbody>
      </table></div>
      <div class="fam-people only-phone-block">${team.map(p => `
        <div class="fam-person${p.pay_method === 'cash' ? ' is-cash' : ''}">
          <div class="fam-person-head">${personPic(p, 'lg')}<strong>${esc(p.name)}</strong>${payPill(p.pay_method, L)}</div>
          <dl class="fam-kv">
            <dt>${L('Leeftijd', '年龄')}</dt><dd>${age(p)}</dd>
            <dt>${L('Vaste uren', '固定时间')}</dt><dd>${fixed(p)}</dd>
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
    await Promise.all([loadStaff(true), readPayslipsNow()]);
    renderView();
  });
}

boot();
