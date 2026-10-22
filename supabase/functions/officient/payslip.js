// Reads a Securex payslip ("Loonbrief") into numbers the app can show: the
// month, the kind of calculation, hours and days worked, paid hours not worked,
// gross and net pay. Used by the Edge Function (index.ts) and the local tests.

// The text of each page as lines, top to bottom. pdf is a pdf.js document.
export async function pdfLines(pdf) {
  const lines = [];
  for (let n = 1; n <= Math.min(pdf.numPages, 10); n++) {
    const page = await pdf.getPage(n);
    const { items } = await page.getTextContent();
    const rows = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || 8;
      let row = rows.find(r => Math.abs(r.y - y) < Math.max(1.5, Math.min(r.h, h) * 0.45));
      if (!row) rows.push(row = { y, h, items: [] });
      row.items.push({ x, s: it.str.trim() });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) lines.push(r.items.sort((a, b) => a.x - b.x).map(i => i.s).join(' ').replace(/\s+/g, ' '));
    page.cleanup();
  }
  return lines;
}

const amount = s => Number(s.replace(/\./g, '').replace(',', '.'));
const round2 = n => Math.round(n * 100) / 100;

// A pay line: code, days, hours or count, rate or coefficient, amount, description.
// "000 25 140,00 16,9831 2.377,63 Bezoldiging", "564 4 12,0000 48,00 Premie ...",
// "35F -40,00 1,2028 -48,12 Vakantiegeld ...", "012 -983,94 Overdracht vorige betaling"
const PAY_LINE = /^([0-9A-Z]{2,3}) (?:(-?\d{1,3}) )?(?:(-?\d{1,3},\d{2}) )?(?:(-?\d{1,4},\d{4}) )?([+-]?\d{1,3}(?:\.\d{3})*,\d{2}) (\D.*)$/;
// A total: "2.425,63 ** Totaal bruto onderworpen aan RSZ", "120 1.171,33 *** Netto te betalen"
const TOTAL_LINE = /^(?:[0-9A-Z]{2,3} )?([+-]?\d{1,3}(?:\.\d{3})*,\d{2}) (\*{1,3}) (.+)$/;

const WORKED = /^bezoldiging/i;                                   // also "Bezoldiging student", "... flexi-job"
const PAID_LEAVE = /feestdag|ziekte|gew\.? ?maandloon|gewaarborgd|klein verlet|verlof|vakantie(?!geld)/i;

// lines: from pdfLines. Null when this is not a Securex payslip.
export function readSecurex(lines) {
  const at = re => { for (const l of lines) { const m = l.match(re); if (m) return m; } return null; };
  const period = at(/Loonperiode (\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{2})\.(\d{2})\.(\d{4})/);
  if (!period || !lines.some(l => /^Loon\b/.test(l) || /Netto te betalen|Totaal bedrag ecocheques/.test(l))) return null;
  const kind = (at(/^Soort ([A-Za-zÀ-ÿ-]+)/) || [])[1] || 'Bezoldiging';
  const calc = at(/Laatste berekening (\d{2})\.(\d{2})\.(\d{4})-(\d{2})\.(\d{2})\.(\d{2})/);
  const rate = at(/^Basisloon (\d{1,3}(?:\.\d{3})*,\d{2,4})\b/);
  const out = {
    kind,
    month: `${period[3]}-${period[2]}-01`,
    calculated_at: calc ? `${calc[3]}-${calc[2]}-${calc[1]}T${calc[4]}:${calc[5]}:${calc[6]}` : null,
    base_rate: rate ? amount(rate[1]) : null,
    days_worked: 0, hours_worked: 0, hours_leave: 0,
    gross_pay: null, net_paid: null, previous_payment: null, ecocheques: null,
  };
  let gross = null, flexiGross = null;
  for (const l of lines) {
    const t = l.match(TOTAL_LINE);
    if (t) {
      const v = amount(t[1]), what = t[3];
      if (/^Totaal bruto/i.test(what)) gross = round2((gross || 0) + v);
      else if (/^Netto met RSZ/i.test(what)) flexiGross = round2((flexiGross || 0) + v);
      else if (/^Netto te betalen/i.test(what) && t[2] === '***') out.net_paid = round2((out.net_paid || 0) + v);
      continue;
    }
    const m = l.match(PAY_LINE);
    if (!m) continue;
    const [, , days, hours, , value, desc] = m;
    const v = amount(value);
    if (/overdracht vorige betaling/i.test(desc)) { out.previous_payment = round2((out.previous_payment || 0) - v); continue; }
    if (/totaal bedrag ecocheques/i.test(desc)) { out.ecocheques = round2((out.ecocheques || 0) + v); continue; }
    if (!hours || /vakantiegeld|premie/i.test(desc)) continue;
    if (WORKED.test(desc)) {
      out.hours_worked += amount(hours);
      if (days) out.days_worked += Number(days);
    } else if (PAID_LEAVE.test(desc) && v !== 0) {
      out.hours_leave += amount(hours);
    }
  }
  // a month without pay (only an absence) earned nothing; an ecocheque slip has no wage at all
  if (kind === 'Ecocheque') out.net_paid = null;
  else {
    out.gross_pay = gross ?? flexiGross ?? 0;
    out.net_paid = out.net_paid ?? 0;
  }
  out.hours_worked = round2(out.hours_worked);
  out.hours_leave = round2(out.hours_leave);
  return out;
}
