'use strict';

/* Reads a payslip PDF in the browser and picks out what the app can use:
   who it is for, the month, gross and net pay, and personal details
   (national register number, IBAN, address, employee number, ...).
   Nothing is sent anywhere; the manager checks the result before saving.
   pdf.js (web/vendor/pdfjs) is only loaded the first time it is needed. */

const Loonfiche = (() => {
  let lib = null;
  async function pdfjs() {
    if (!lib) {
      lib = await import('./vendor/pdfjs/pdf.min.mjs');
      lib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', document.baseURI).href;
    }
    return lib;
  }

  // Each page as lines from top to bottom; a line is a list of cells, split
  // where the text has a wide gap (columns on the same height).
  async function readPages(file) {
    const { getDocument } = await pdfjs();
    const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, disableFontFace: true }).promise;
    const pages = [];
    try {
      for (let n = 1; n <= Math.min(pdf.numPages, 30); n++) {
        const page = await pdf.getPage(n);
        const { items } = await page.getTextContent();
        const rows = [];
        for (const it of items) {
          if (!it.str || !it.str.trim()) continue;
          const x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || Math.abs(it.transform[0]) || 8;
          let row = rows.find(r => Math.abs(r.y - y) < Math.max(1.5, Math.min(r.h, h) * 0.45));
          if (!row) rows.push(row = { y, h, items: [] });
          row.items.push({ x, end: x + (it.width || 0), s: it.str });
        }
        rows.sort((a, b) => b.y - a.y);
        pages.push(rows.map(r => {
          r.items.sort((a, b) => a.x - b.x);
          const cells = [];
          let cur = '', end = null;
          for (const i of r.items) {
            const gap = end == null ? 0 : i.x - end;
            if (end != null && gap > r.h * 2.2) { cells.push(cur); cur = ''; }
            else if (end != null && gap > r.h * 0.18 && !cur.endsWith(' ') && !i.s.startsWith(' ')) cur += ' ';
            cur += i.s;
            end = Math.max(end ?? 0, i.end);
          }
          cells.push(cur);
          return cells.map(c => c.replace(/\s+/g, ' ').trim()).filter(Boolean);
        }));
        page.cleanup();
      }
    } finally {
      await pdf.destroy();
    }
    return pages;
  }

  /* ------------------------------------------------------------ patterns */

  const plain = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const AMOUNT = /(?<![\d.,])-?\d{1,3}(?:[.  ]\d{3})*,\d{2}(?![\d,])/g;
  const toAmount = s => Number(s.replace(/[.  ]/g, '').replace(',', '.'));
  const amountsIn = s => (s.match(AMOUNT) || []).map(toAmount).filter(n => Number.isFinite(n));

  function validNationalId(d) {
    if (!/^\d{11}$/.test(d)) return null;
    const base = d.slice(0, 9), check = Number(d.slice(9));
    if (97 - (Number(base) % 97) === check) return 1900;
    if (97 - (Number('2' + base) % 97) === check) return 2000;
    return null;
  }
  function validIban(s) {
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(s)) return false;
    const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
    let m = 0;
    for (const ch of r) m = (m * 10 + Number(ch)) % 97;
    return m === 1;
  }
  const isoDate = (y, m, d) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
      ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
  };

  const MONTHS = {
    januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6, juli: 7, augustus: 8, september: 9, oktober: 10, november: 11, december: 12,
    janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, decembre: 12,
    january: 1, february: 2, march: 3, may: 5, june: 6, july: 7, august: 8, october: 10,
  };

  // The month the payslip is for: periods and month names on lines that say
  // "periode" or "maand" count three times.
  function findMonth(lines) {
    const votes = new Map();
    const vote = (y, m, w) => {
      if (y < 2000 || y > 2100 || m < 1 || m > 12) return;
      const k = `${y}-${String(m).padStart(2, '0')}-01`;
      votes.set(k, (votes.get(k) || 0) + w);
    };
    for (const line of lines) {
      const t = plain(line);
      const w = /period|maand|mois|month|loonbrief|afrekening/.test(t) ? 3 : 1;
      for (const m of t.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*(?:-|–|tot|t\/m|au|a|to)\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g)) {
        if (m[2] === m[5] && m[3] === m[6]) vote(+m[3], +m[2], w + 2);
      }
      for (const m of t.matchAll(/\b([a-z]{3,9})\s+(\d{4})\b/g)) if (MONTHS[m[1]]) vote(+m[2], MONTHS[m[1]], w);
      for (const m of t.matchAll(/(?<![\d/.-])(\d{1,2})[/.-](\d{4})\b/g)) vote(+m[2], +m[1], w);
      for (const m of t.matchAll(/\b(\d{4})[/.-](\d{1,2})(?![\d/.-])/g)) vote(+m[1], +m[2], w);
    }
    let best = null;
    for (const [k, n] of votes) if (!best || n > best[1]) best = [k, n];
    return best ? best[0] : null;
  }

  // The amount on a line that names it, or on the line below.
  function amountFor(lines, re, { not = null, last = true, min = 0, max = 100000 } = {}) {
    const hits = [];
    lines.forEach((line, i) => {
      const t = plain(line);
      if (!re.test(t) || (not && not.test(t))) return;
      let list = amountsIn(line);
      // a code or count can stand in front of the label: prefer amounts after it
      const at = t.search(re);
      const after = amountsIn(line.slice(at));
      if (after.length) list = after;
      if (!list.length && lines[i + 1]) list = amountsIn(lines[i + 1]);
      const ok = list.filter(n => n >= min && n <= max);
      if (ok.length) hits.push(last ? ok[ok.length - 1] : ok[0]);
    });
    return hits;
  }

  function tokens(name) {
    return plain(name).split(/[\s\-']+/).filter(p => p.length >= 2 && !/^\w\.$/.test(p)).map(p => p.replace(/\.$/, ''));
  }

  /* -------------------------------------------------------------- extract */

  // pages: from readPages. staff: [{id, name, payroll_id, national_id}]
  function extract(pages, staff = []) {
    const lines = pages.flat().map(cells => cells.join('  '));
    const text = lines.join('\n');
    const words = ' ' + plain(text).replace(/[^a-z0-9]+/g, ' ') + ' ';
    const out = { text_found: text.replace(/\s/g, '').length > 40, pages: pages.length };

    // national register number, with the birth date it holds
    const nids = [];
    for (const m of text.matchAll(/(?<!\d)(\d{2})[. ]?(\d{2})[. ]?(\d{2})[-. ]?(\d{3})[. ]?(\d{2})(?!\d)/g)) {
      const d = m.slice(1).join(''), century = validNationalId(d);
      if (century && !nids.some(x => x.value === d)) nids.push({ value: d, century });
    }
    if (nids.length) {
      const { value, century } = nids[0];
      out.national_id = value;
      let mm = Number(value.slice(2, 4)); if (mm > 40) mm -= 40; else if (mm > 20) mm -= 20;
      const birth = isoDate(century + Number(value.slice(0, 2)), mm, Number(value.slice(4, 6)));
      if (birth) out.birth_date = birth;
    }

    // IBAN: prefer one on a line about the payment or the account
    const ibans = [];
    lines.forEach(line => {
      for (const m of line.toUpperCase().matchAll(/\b([A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?)\b/g)) {
        const v = m[1].replace(/ /g, '');
        if (!validIban(v) || ibans.some(x => x.value === v)) continue;
        const t = plain(line);
        const score = (/iban|rekening|overschrijving|betaal|betaling|virement|compte|uitbetaald/.test(t) ? 2 : 0) - (/werkgever|employeur|onderneming/.test(t) ? 2 : 0);
        ibans.push({ value: v, score });
      }
    });
    ibans.sort((a, b) => b.score - a.score);
    if (ibans.length) out.iban = ibans[0].value;
    if (ibans.length > 1) out.other_ibans = ibans.slice(1).map(x => x.value);

    out.month = findMonth(lines);

    const net = amountFor(lines, /netto\s*(te|uit\s*te)?\s*betalen|te\s*betalen\s*(bedrag|netto)?|net\s*a\s*payer|nettoloon|netto\s*bedrag|uitbetaald/, { not: /belastbaar|imposable/ });
    if (net.length) out.net_pay = net[net.length - 1];
    let gross = amountFor(lines, /totaal\s*bruto|bruto\s*(loon|totaal|bezoldiging)|brutoloon|salaire\s*brut|total\s*brut/, { not: /belastbaar|imposable|niet\s*onderworpen/ });
    if (!gross.length) gross = amountFor(lines, /\bbruto\b|\bbrut\b/, { not: /belastbaar|imposable|niet\s*onderworpen|uurloon|per\s*uur/ });
    if (gross.length) out.gross_pay = Math.max(...gross);
    const hourly = amountFor(lines, /uurloon|loon\s*per\s*uur|uurtarief|taux\s*horaire|salaire\s*horaire|uurbedrag/, { min: 3, max: 200, last: false });
    if (hourly.length) out.hourly_rate = hourly[0];

    for (const line of lines) {
      const m = plain(line).match(/(?:werknemers?\s*(?:nummer|nr\.?|n°)|personeels?\s*(?:nummer|nr\.?)|pers\.?\s*nr\.?|stamnummer|matricule|n°\s*travailleur|numero\s*de\s*travailleur)\s*[:.]?\s*([a-z0-9][a-z0-9\-/.]{0,29})/);
      if (m && /\d/.test(m[1])) { out.payroll_id = m[1].replace(/[.]$/, '').toUpperCase(); break; }
    }
    for (const line of lines) {
      const m = plain(line).match(/(?:in\s*dienst(?:\s*sinds|treding)?|indiensttreding|datum\s*in\s*dienst|date\s*d'?entree|entree\s*en\s*service)\s*[:.]?\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
      if (m) { const d = isoDate(+m[3], +m[2], +m[1]); if (d) { out.start_date = d; break; } }
    }
    const t = plain(text);
    if (/flexi/.test(t)) out.contract_type = 'flexi';
    else if (/\bstudent|etudiant|studentenarbeid/.test(t)) out.contract_type = 'student';
    else if (/gelegenheidswerknemer|travailleur\s*occasionnel/.test(t)) out.contract_type = 'extra';

    // who it is for: national number, then employee number, then name
    let who = null;
    if (out.national_id) who = staff.find(p => p.national_id && p.national_id === out.national_id);
    if (!who && out.payroll_id) who = staff.find(p => p.payroll_id && plain(p.payroll_id) === plain(out.payroll_id));
    if (!who) {
      let best = 0;
      for (const p of staff) {
        const tk = tokens(p.name);
        if (!tk.length || !tk.every(x => words.includes(` ${x} `))) continue;
        if (tk.length > best) { best = tk.length; who = p; }
      }
    }
    if (who) out.staff_id = who.id;

    // the address: the first postcode line in the four lines under the name
    if (who) {
      const tk = tokens(who.name);
      const flat = pages.flat();
      const at = flat.findIndex(cells => cells.some(c => tk.every(x => (' ' + plain(c).replace(/[^a-z0-9]+/g, ' ') + ' ').includes(` ${x} `))));
      if (at >= 0) {
        const col = flat[at].findIndex(c => tk.every(x => (' ' + plain(c).replace(/[^a-z0-9]+/g, ' ') + ' ').includes(` ${x} `)));
        for (let i = at + 1; i <= at + 4 && i < flat.length; i++) {
          const cell = flat[i][col] ?? flat[i][0];
          const m = cell && cell.match(/^(?:B-?\s?)?([1-9]\d{3})\s+([A-Za-zÀ-ÿ'’. -]{2,40})$/);
          if (!m) continue;
          out.postcode = m[1];
          out.city = m[2].trim().replace(/\b\w/g, c => c.toUpperCase()).replace(/\B\w+/g, w => w.toLowerCase());
          const prev = i - 1 > at ? (flat[i - 1][col] ?? flat[i - 1][0]) : null;
          if (prev && /[a-zA-Z]/.test(prev) && /\d/.test(prev) && prev.length <= 120) out.street = prev;
          break;
        }
      }
    }
    return out;
  }

  async function read(file, staff) {
    if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) return { text_found: false, pages: 0 };
    try { return extract(await readPages(file), staff); }
    catch (e) { console.warn('payslip not readable', e); return { text_found: false, pages: 0, failed: true }; }
  }

  return { read, extract, readPages, validIban, validNationalId };
})();
