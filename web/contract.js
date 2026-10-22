'use strict';

/* Writes a student's employment contract as a PDF, in the browser, on
   Securex's model "Arbeidsovereenkomst voor studenten" (11 N 0117), filled in
   with the employer's details (Planning → Studentencontracten), the student's
   profile, the period, the hours planned and the schedule as an annex.
   Securex's model may only be used within the company it was given to.
   pdf-lib (web/vendor/pdf-lib) is only loaded the first time it is needed. */

const StudentContract = (() => {
  let lib = null;
  const load = async () => lib || (lib = await import('./vendor/pdf-lib/pdf-lib.esm.min.js'));

  const MODEL = '11 N 0117 – 1/2026';
  const OPTIONS = {
    vast: ['vast uurrooster (toepassing van de wekelijkse minimumgrens van het 1/10-stelsel behalve bij afwijking).',
      w => `De wekelijkse arbeidsduur van de student bedraagt ${w} uren verdeeld volgens het uurrooster opgenomen in artikel 7.`],
    vast4: ['vast uurrooster minimum 4 uur per prestatie (afwijking op de wekelijkse minimumgrens van het 1/10-stelsel).',
      w => `De wekelijkse arbeidsduur van de student bedraagt ${w} uren verdeeld volgens het uurrooster opgenomen in artikel 7.`,
      'In dit geval zijn alleen bijkomende prestaties die onmiddellijk volgen op of voorafgaan aan de in deze overeenkomst voorziene prestaties toegelaten.',
      'Deze bijkomende prestaties geven aanleiding tot de betaling van een overloon berekend overeenkomstig artikel 29 van de arbeidswet van 16 maart 1971.'],
    vast_variabel: ['vast arbeidsregime en variabel uurrooster',
      w => `De wekelijkse arbeidsduur van de student bedraagt ${w} uren.`,
      'Het toepasselijke uurrooster wordt opgesteld binnen het kader zoals voorzien in het arbeidsreglement. Het uurrooster wordt ten minste 7 werkdagen vooraf aan de student meegedeeld. Deze kennisgeving gebeurt op de wijze voorzien in het arbeidsreglement.'],
    variabel: ['variabel arbeidsregime en variabel uurrooster',
      w => `De gemiddelde wekelijkse arbeidsduur van de student bedraagt ${w} uren te eerbiedigen over een periode van één kwartaal.`,
      'Het toepasselijke uurrooster wordt opgesteld binnen het kader zoals voorzien in het arbeidsreglement. Het uurrooster wordt ten minste 7 werkdagen op voorhand aan de student meegedeeld. Deze kennisgeving gebeurt op de wijze voorzien in het arbeidsreglement.'],
  };
  const DISCLAIMER = 'De VZW Sociaal Secretariaat Securex en de juridische entiteiten die de economische entiteit vormen gekend onder de benaming Groep Securex kunnen op geen enkel moment verantwoordelijk gesteld worden met betrekking tot de inhoud van de gegevens in dit document, ook niet wanneer de klant de modelzinnen heeft gewijzigd. Het document mag enkel intern in uw onderneming gebruikt worden. U mag het noch gratis, noch tegen betaling aan een derde overmaken zonder uitdrukkelijke toestemming van de Groep Securex. De Groep Securex is en blijft exclusief eigenaar van alle rechten, waaronder de intellectuele rechten, op dit document. Er wordt u enkel een gebruiksrecht op dit document gegeven.';

  // The built-in Helvetica only has the Windows-1252 characters: others lose
  // their accent, or become a question mark.
  const CP1252 = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  const fits = ch => { const c = ch.charCodeAt(0); return ch === '\n' || (c >= 32 && c < 127) || (c >= 160 && c <= 255) || CP1252.includes(ch); };
  const safe = s => [...String(s ?? '')].map(ch => fits(ch) ? ch : ((ch.normalize('NFD').replace(/[̀-ͯ]/g, '')) || '?'))
    .map(ch => [...ch].every(fits) ? ch : '?').join('');
  const dmy = iso => iso ? iso.split('-').reverse().join('/') : '…';
  const num = n => (Math.round(n * 100) / 100).toLocaleString('nl-BE', { maximumFractionDigits: 2 });
  const money = n => n == null ? '…' : Number(n).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // c: { info: employer's details, student: profile, from, to, function, tasks, hours, regime ('deeltijds' | 'voltijds'),
  //      option, weekly, rate, contingent ('uren' | 'dagen'), place, sign_date, shifts: [{ date, start, end, minutes }] }
  async function build(c) {
    const { PDFDocument, StandardFonts, rgb } = await load();
    const doc = await PDFDocument.create();
    doc.setTitle(safe(`Arbeidsovereenkomst voor studenten – ${c.student.name}`));
    doc.setCreator('Prikklok');
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const W = 595.28, H = 841.89, L = 62, R = W - 62, TOP = H - 62, BOTTOM = 70, SIZE = 10.5, LEAD = 14.2;
    const ink = rgb(0, 0, 0);
    const info = c.info || {};
    let page, y;
    const newPage = () => { page = doc.addPage([W, H]); y = TOP; };
    const room = h => { if (y - h < BOTTOM) newPage(); };
    const width = (s, f = font, size = SIZE) => f.widthOfTextAtSize(s, size);
    const wrap = (text, w, f = font, size = SIZE) => {
      const out = [];
      for (const para of safe(text).split('\n')) {
        let line = '';
        for (const word of para.split(/\s+/).filter(Boolean)) {
          const next = line ? `${line} ${word}` : word;
          if (line && width(next, f, size) > w) { out.push(line); line = word; } else line = next;
        }
        out.push(line);
      }
      return out;
    };
    // a paragraph at an indent, wrapped; keepWith: lines that must stay on the same page
    const text = (s, { x = L, f = font, size = SIZE, after = 0, keep = 1 } = {}) => {
      const lines = wrap(s, R - x, f, size);
      room(LEAD * Math.min(keep, lines.length));
      for (const line of lines) {
        room(LEAD);
        page.drawText(line, { x, y: y - size, size, font: f, color: ink });
        y -= LEAD;
      }
      y -= after;
    };
    const gap = (h = LEAD * 0.6) => { y -= h; };
    const box = (x, on) => {
      page.drawRectangle({ x, y: y - SIZE + 0.5, width: 9, height: 9, borderColor: ink, borderWidth: 0.7 });
      if (on) {
        page.drawLine({ start: { x: x + 1.5, y: y - SIZE + 2 }, end: { x: x + 7.5, y: y - SIZE + 8 }, thickness: 0.9, color: ink });
        page.drawLine({ start: { x: x + 1.5, y: y - SIZE + 8 }, end: { x: x + 7.5, y: y - SIZE + 2 }, thickness: 0.9, color: ink });
      }
    };
    const N = 24; // where an article's text starts
    const article = (n, lines, { keep = 2 } = {}) => {
      room(LEAD * keep);
      page.drawText(`${n}.`, { x: L, y: y - SIZE, size: SIZE, font, color: ink });
      lines.forEach((l, i) => typeof l === 'function' ? l() : text(l, { x: L + N, keep: i === 0 ? keep : 1 }));
      gap();
    };
    const rightOnLine = s => page.drawText(s, { x: R - width(s), y: y + LEAD - SIZE, size: SIZE, font, color: ink });
    const checked = (on, s, x = L + N) => { room(LEAD); box(x, on); text(s, { x: x + 15 }); };

    const st = c.student;
    const address = [st.street, [st.postcode, st.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '…';
    const weekly = c.weekly ? num(Number(c.weekly)) : '…';
    const option = c.regime === 'deeltijds' ? c.option : null;

    newPage();
    const title = 'Arbeidsovereenkomst voor studenten';
    page.drawText(title, { x: (W - width(title, bold, 14)) / 2, y: y - 14, size: 14, font: bold, color: ink });
    y -= 40;
    text('Tussen de ondergetekenden:', { f: bold, after: 6 });
    text(`de werkgever: ${info.employer || '…'}`); rightOnLine('enerzijds');
    text(`adres: ${info.employer_address || '…'}`);
    text(`vertegenwoordigd door: ${info.representative || '…'}`, { after: 8 });
    text(`en de student: ${st.name}`); rightOnLine('anderzijds');
    text(`geboren op: ${dmy(st.birth_date)}`);
    text(`adres: ${address}`, { after: 8 });
    text('Wordt het volgende overeengekomen:', { f: bold, after: 6 });

    article(1, [`De werkgever werft de student aan in de hoedanigheid van ${c.function || '…'}`,
      'De prestaties van de student bestaan uit:', c.tasks || c.function || '…']);
    article(2, [`Deze overeenkomst is gesloten voor een bepaalde tijd van ${dmy(c.from)} tot en met ${dmy(c.to)}. Het aantal te presteren uren wordt geschat op ${c.hours != null ? num(Number(c.hours)) : '…'}.`]);
    article(3, ['De plaats waar het werk uitgevoerd zal worden, is gelegen op het volgende adres:', info.work_address || '…',
      () => gap(), 'De modaliteiten die van toepassing zijn als er geen vaste plaats van tewerkstelling is, worden vermeld in het arbeidsreglement.']);
    article(4, [() => checked(c.regime === 'voltijds', `De student is aangeworven voor VOLTIJDSE PRESTATIES. De wekelijkse arbeidsduur van de student bedraagt ${c.regime === 'voltijds' ? weekly : '…'} uren, verdeeld volgens het uurrooster vermeld onder artikel 7.`)]);
    article(5, [() => checked(c.regime === 'deeltijds', 'De student is aangeworven voor DEELTIJDSE PRESTATIES overeenkomstig de volgende optie'),
      () => { for (const [key, [head, hours, ...rest]] of Object.entries(OPTIONS)) {
        gap(4);
        checked(option === key, head, L + N + 14);
        text(hours(option === key ? weekly : '…'), { x: L + N + 29 });
        for (const r of rest) text(r, { x: L + N + 29 });
      } }], { keep: 3 });
    article(6, ['Bovenvermelde prestaties worden volgens het hierna volgende uurrooster verdeeld:', 'Zie het uurrooster in bijlage.',
      () => gap(), 'De algemene informatie over de uurroosters is in het arbeidsreglement opgenomen.']);
    article(7, [`De bruto bezoldiging is vastgesteld op ${money(c.rate)} euro per uur`, () => gap(),
      'Wanneer een gedeelte van het loon in natura uitbetaald wordt, omvat dit gedeelte volgende bestanddelen die als volgt geraamd worden: /']);
    article(8, ['De student verklaart zich akkoord met de betaling van zijn loon op de financiële rekening:',
      `IBAN ${st.iban || '…'}, op datum vastgesteld door het arbeidsreglement of door elk ander van kracht zijnde document.`]);
    article(9, ['De wet van 12 april 1965 betreffende de bescherming van het loon van de werknemers is van toepassing.']);
    article(10, ['De plaats van huisvesting van de student is gelegen op het volgende adres:', address]);
    article(11, ['In geval van ziekte of ongeval zal de volgende persoon verwittigd worden:', info.notify || '…',
      `De eerste hulp bij ongeval wordt verleend door ${info.first_aid || '…'}`, '(naam en manier waarop deze persoon bereikt kan worden)']);
    article(12, [`De verbandkist bevindt zich ${info.first_aid_kit || '…'}.`]);
    article(13, [`De interne / externe dienst voor preventie en bescherming op het werk bevindt zich ${info.prevention || '…'}`,
      '(adres en telefoonnummer)', info.prevention_phone || '']);
    article(14, ['Het Toezicht op de sociale wetten van het district waarin de student tewerkgesteld is, bevindt zich',
      info.inspection || '…', '(adres en telefoonnummer)'], { keep: 3 });
    article(15, ['De werknemersvertegenwoordigers in de Ondernemingsraad zijn', '/', '(naam en manier om hen te bereiken)', () => gap(),
      'De vertegenwoordigers van de werknemers in het Comité voor preventie en bescherming op het werk zijn', '/', '(naam en manier om hen te bereiken)', () => gap(),
      'De leden van de vakbondsafvaardiging zijn', '/', '(naam en manier om hen te bereiken)'], { keep: 3 });
    article(16, [`De werkgever behoort tot paritair comité nr. ${info.committee || '…'}.`]);
    article(17, ['Deze overeenkomst neemt automatisch een einde bij het verstrijken van de termijn. Vóór de einddatum kan elk der partijen een einde aan de overeenkomst stellen mits een opzeg aan de andere partij overeenkomstig artikel 130 van de wet van 3 juli 1978 betekend wordt. Tot het verstrijken van de proefperiode kan elke partij deze overeenkomst verbreken zonder opzeg of vergoeding.',
      'Deze overeenkomst kan eveneens verbroken worden vóór de einddatum wegens een dringende reden of wegens overmacht, zonder vergoeding of opzegtermijn.']);
    article(18, ['De student verklaart een exemplaar van deze overeenkomst alsook een afschrift van het arbeidsreglement, in werking in de onderneming, ontvangen te hebben.']);
    article(19, ['De verwerking van deze persoonsgegevens in het kader van onderhavige overeenkomst is onderworpen aan de Verordening 2016/679 van 27 april 2016 betreffende de bescherming van natuurlijke personen in verband met de verwerking van persoonsgegevens en betreffende het vrije verkeer van die gegevens en aan de wet van 30 juli 2018 betreffende de bescherming van natuurlijke personen met betrekking tot de verwerking van persoonsgegevens.']);
    article(21, ['Facultatief in geval van occasionele arbeid:',
      'Aangezien er naast het contingent van 650 uren studentenarbeid met verlaagd tarief ook nog een contingent van dagen occasionele arbeid beschikbaar is, kiezen de partijen ervoor om:',
      () => checked(c.contingent !== 'dagen', 'eerst het contingent van uren studentenarbeid te gebruiken', L + N + 14),
      () => checked(c.contingent === 'dagen', 'eerst het contingent van dagen occasionele arbeid te gebruiken', L + N + 14),
      () => checked(false, 'de volgende verdeling te maken: …', L + N + 14)], { keep: 4 });

    // place, date and the signatures stay together
    room(LEAD * 8);
    gap(LEAD);
    text(`Opgemaakt in tweevoud te ${c.place || info.place || '…'}, op ${dmy(c.sign_date)}`);
    y -= LEAD * 3;
    const col = (R - L) / 2;
    const signer = safe((info.representative || '').toUpperCase());
    page.drawText(signer, { x: L + col + 20, y: y + 4, size: SIZE, font, color: ink });
    for (const x of [L + 10, L + col + 10]) page.drawLine({ start: { x, y }, end: { x: x + col - 40, y }, thickness: 0.6, color: ink });
    y -= LEAD;
    page.drawText('Handtekening van de student', { x: L + 14, y: y + 2, size: SIZE, font, color: ink });
    page.drawText('Handtekening van de werkgever', { x: L + col + 14, y: y + 2, size: SIZE, font, color: ink });

    // annex: the schedule
    newPage();
    text('Bijlage: uurrooster', { f: bold, size: 13, after: 4 });
    text(`bij de arbeidsovereenkomst voor studenten tussen ${info.employer || '…'} en ${st.name}, van ${dmy(c.from)} tot en met ${dmy(c.to)}.`, { after: 10 });
    const shifts = c.shifts || [];
    if (!shifts.length) text('Er zijn nog geen shiften gepland in deze periode.');
    else {
      const cols = [L, L + 190, L + 260, L + 330];
      const row = (cells, f = font) => {
        room(LEAD);
        cells.forEach((s, i) => page.drawText(safe(s), { x: i === 3 ? cols[3] + 50 - width(safe(s), f) : cols[i], y: y - SIZE, size: SIZE, font: f, color: ink }));
        y -= LEAD;
      };
      row(['Dag', 'Van', 'Tot', 'Uren'], bold);
      page.drawLine({ start: { x: L, y: y - 1 }, end: { x: cols[3] + 50, y: y - 1 }, thickness: 0.5, color: ink });
      y -= 5;
      for (const s of shifts) {
        const d = new Date(`${s.date}T12:00:00`);
        row([`${d.toLocaleDateString('nl-BE', { weekday: 'long' })} ${dmy(s.date)}`, s.start, s.end, num(s.minutes / 60)]);
      }
      page.drawLine({ start: { x: L, y: y - 1 }, end: { x: cols[3] + 50, y: y - 1 }, thickness: 0.5, color: ink });
      y -= 5;
      const total = shifts.reduce((a, s) => a + s.minutes, 0) / 60;
      row([`Totaal: ${shifts.length} ${shifts.length === 1 ? 'shift' : 'shiften'}`, '', '', num(total)], bold);
    }

    // the model's notice at the end, and on every page its number and the page
    const notice = wrap(DISCLAIMER + ' VZW Sociaal Secretariaat Securex, Tervurenlaan 43, 1040 Brussel, BTW BE 0401.086.981 - RPR Brussel.', R - L, font, 7);
    room(notice.length * 9 + 20);
    y = Math.min(y - 20, BOTTOM + notice.length * 9 + 4);
    for (const line of notice) { page.drawText(line, { x: L, y, size: 7, font, color: ink }); y -= 9; }
    const pages = doc.getPages();
    pages.forEach((p, i) => {
      p.drawText(MODEL, { x: L, y: 40, size: 8, font, color: ink });
      const n = `${i + 1}/${pages.length}`;
      p.drawText(n, { x: R - width(n, font, 8), y: 40, size: 8, font, color: ink });
    });
    return doc.save();
  }

  return { build };
})();
