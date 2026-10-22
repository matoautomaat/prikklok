// Reads Exact Officient (the HR platform behind Securex) for the Prikklok app:
// people, their wage and contract hours, and payslip PDFs. Shared by the
// Edge Function (index.ts) and the local tests, so it only needs fetch and a
// db(text, params) that returns the first row's "r" column.

export const OFFICIENT_API = 'https://api.officient.io/1.0';
// Officient marks payslips with the document type SalarySlip; files without a
// type are judged by their name. Belcotax fiches and individual accounts are not payslips.
const PAYSLIP_TYPE = /salary ?slip|pay ?slip|loonbrie|loonfiche|fiche de paie|bulletin de paie/i;
const PAYSLIP_NAME = /loonbrie|loonfiche|payslip|pay slip|fiche de paie|bulletin de paie/i;
const MAX_DOWNLOADS = 60; // per run; the next night picks up the rest

export function makeOfficient({ db: query, fetch, api = OFFICIENT_API, wait = ms => new Promise(r => setTimeout(r, ms)) }) {
  // json from the database may come back as text, depending on the driver
  const db = async (text, params) => {
    const r = await query(text, params);
    if (typeof r === 'string' && /^[[{]/.test(r)) { try { return JSON.parse(r); } catch { /* plain text */ } }
    return r;
  };
  async function token(cfg, body) {
    const res = await fetch(`${api}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: cfg.client_id, client_secret: cfg.client_secret, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      throw new Error(res.status >= 400 && res.status < 500
        ? 'Officient refused the connection. Connect again under Team.'
        : `Officient answered ${res.status}.`);
    }
    return data;
  }

  // Officient allows 30 calls every 5 seconds.
  let calls = [];
  async function get(access, path) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const t = Date.now();
      calls = calls.filter(x => t - x < 5000);
      if (calls.length >= 25) await wait(5000 - (t - calls[0]) + 50);
      calls.push(Date.now());
      const res = await fetch(api + path, { headers: { Authorization: `Bearer ${access}` } });
      if (res.status === 429) { await wait(5000); continue; }
      if (res.status === 400 || res.status === 404) return null;
      if (!res.ok) throw new Error(`Officient answered ${res.status} for ${path.split('?')[0]}.`);
      const body = await res.json().catch(() => null);
      return body ? body.data : null;
    }
    throw new Error('Officient is busy. Try again later.');
  }
  async function pages(access, path) {
    const out = [];
    for (let page = 0; page < 50; page++) {
      const data = await get(access, `${path}?page=${page}`);
      if (!Array.isArray(data) || !data.length) break;
      out.push(...data);
      if (data.length < 30) break;
    }
    return out;
  }

  async function sync(access) {
    const report = { at: new Date().toISOString(), people: 0, matched: 0, linked: 0, updated: [], unmatched: [],
                     payslips: [], already: 0, no_month: 0, document_types: {}, more: false, skipped: 0, fields: {} };
    let downloads = 0;
    // current records before archived ones, so a person's earlier employment
    // never takes the link or the details from the current one
    const people = (await pages(access, '/people/list')).sort((a, b) => Number(!!a.archived) - Number(!!b.archived));
    const handled = [];
    report.people = people.length;
    // which fields Officient sends (names only), to see what to expect
    if (people[0]) report.fields.list = Object.keys(people[0]).slice(0, 40);
    for (const p of people) {
      const id = p.id ?? p.person_id ?? p.people_id ?? p.employee_id;
      if (id == null) { report.skipped++; continue; }
      const detail = (await get(access, `/people/${id}/detail`)) || p;
      const wage = await get(access, `/wages/${id}/current`);
      if (!report.fields.detail && detail !== p) report.fields.detail = Object.keys(detail).slice(0, 60);
      if (!report.fields.wage && wage) report.fields.wage = Object.keys(wage).slice(0, 40);
      const r = await db('select app_private.officient_apply_person($1::text::jsonb) as r', [JSON.stringify({ ...p, ...detail, id, wage, handled })]);
      if (r && r.status === 'unmatched') { report.unmatched.push(r.name); continue; }
      if (!r || r.status !== 'matched') { report.skipped++; continue; }
      report.matched++;
      if (!handled.includes(r.staff_id)) handled.push(r.staff_id);
      if (r.new_link) report.linked++;
      if (r.changed.length) report.updated.push({ name: r.name, changed: r.changed });
      for (const d of await pages(access, `/documents/employee/${id}/list`)) {
        const type = d.document_type || '—';
        report.document_types[type] = (report.document_types[type] || 0) + 1;
        if (!report.fields.document) report.fields.document = Object.keys(d).slice(0, 30);
        const slip = d.document_type ? PAYSLIP_TYPE.test(d.document_type) : PAYSLIP_NAME.test(d.filename || '');
        if (!slip || !/\.pdf$/i.test(d.filename || '')) continue;
        const ref = `officient:${d.id}`, month = monthOf(d);
        if (!month) { report.no_month++; continue; }
        const known = await db('select app_private.officient_payslip_known($1, $2::uuid, $3::date) as r', [ref, r.staff_id, month]);
        if (known === 'already') report.already++;
        if (known) continue;
        if (downloads >= MAX_DOWNLOADS) { report.more = true; continue; }
        downloads++;
        const dl = await get(access, `/documents/${d.id}/download`);
        if (!dl || !dl.download_url) continue;
        const file = await fetch(dl.download_url);
        if (!file.ok) continue;
        const data = toBase64(new Uint8Array(await file.arrayBuffer()));
        const res = await db('select app_private.officient_add_payslip($1::uuid, $2::date, $3, $4, $5) as r',
          [r.staff_id, month, d.filename, data, ref]);
        if (res === 'added') report.payslips.push({ name: r.name, month, file: d.filename });
        else if (res === 'already') report.already++;
      }
    }
    return report;
  }

  // action 'connect': right after the manager signed in at Officient (code, state);
  // action 'sync': a manager pressing "Nu ophalen", or the nightly job (cron).
  async function run({ action, token: appToken, code, state, cron }) {
    const connect = action === 'connect';
    const cfg = await db('select app_private.officient_begin($1, $2, $3) as r',
      [cron ? null : appToken || '', cron || null, connect ? state || '' : null]);
    if (cfg.skip) return { skipped: true };
    try {
      let t;
      if (connect) {
        if (!code) throw new Error('Officient sent no code back. Connect again.');
        t = await token(cfg, { grant_type: 'authorization_code', code });
        if (!t.refresh_token) throw new Error('Officient gave no lasting access. Connect again.');
        await db('select app_private.officient_save_token($1, true) as r', [t.refresh_token]);
      } else {
        t = await token(cfg, { grant_type: 'refresh_token', refresh_token: cfg.refresh_token });
        if (t.refresh_token && t.refresh_token !== cfg.refresh_token) {
          await db('select app_private.officient_save_token($1, false) as r', [t.refresh_token]);
        }
      }
      const report = await sync(t.access_token);
      await db('select app_private.officient_finish($1::text::jsonb, null) as r', [JSON.stringify(report)]);
      return { ok: true, report };
    } catch (e) {
      await db('select app_private.officient_finish(null, $1) as r', [String(e.message || e)]);
      throw e;
    }
  }

  return { run, sync };
}

const MONTHS = ['januari january janvier', 'februari february fevrier', 'maart march mars', 'april avril', 'mei may mai',
  'juni june juin', 'juli july juillet', 'augustus august aout', 'september septembre', 'oktober october octobre',
  'november novembre', 'december decembre'].map(m => m.split(' '));

// The pay month, from the file name: Officient's "Loonbrief juli 2026.pdf" or
// Securex's "Loonbrief - 01-09-2026 - 30-09-2026 - NAME.pdf". The upload date
// says nothing reliable (a payslip can come the same month or months later),
// so a file without a month in its name is left out.
export function monthOf(doc) {
  const name = String(doc.filename || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const m = name.match(/(\d{2})[-._](\d{2})[-._](\d{4})/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[3]}-${m[2]}-01`;
  for (const [, word, year] of name.matchAll(/([a-z]+)[\s._-]+(\d{4})/g)) {
    const i = MONTHS.findIndex(names => names.includes(word));
    if (i >= 0) return `${year}-${String(i + 1).padStart(2, '0')}-01`;
  }
  return null;
}

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
