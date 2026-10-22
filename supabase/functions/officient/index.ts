// The app's link with Exact Officient, and the reader of payslip PDFs. Called
// by the app (a manager: connect, "Nu ophalen", after uploading payslips,
// comparing a month with Officient's calendar or making it count the hours)
// and every night by pg_cron with its own secret. It does its own checks: the
// app's session token, or the nightly secret.
import postgres from 'npm:postgres@3.4.5';
import { getDocumentProxy } from 'npm:unpdf@1.8.1';
import { makeOfficient } from './sync.js';
import { pdfLines, readSecurex } from './payslip.js';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 });
const officient = makeOfficient({
  db: async (text: string, params: unknown[]) => (await sql.unsafe(text, params as never[]))[0]?.r,
  fetch,
  readPayslip: async (bytes: Uint8Array) => readSecurex(await pdfLines(await getDocumentProxy(bytes, { verbosity: 0 }))),
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { message: 'Use POST.' });
  let body: Record<string, string>;
  try { body = await req.json(); } catch { return reply(400, { message: 'Send JSON.' }); }
  try {
    const out = await officient.run({
      action: ['connect', 'read', 'calendar', 'hours'].includes(body.action) ? body.action : 'sync',
      token: body.token, code: body.code, state: body.state, month: body.month,
      people: (body as unknown as { people?: unknown }).people, dry: (body as unknown as { dry?: boolean }).dry === true,
      cron: req.headers.get('x-cron-secret') || undefined,
    });
    return reply(200, out);
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return reply(err.code === '28000' ? 401 : 400, { code: err.code, message: err.message || String(e) });
  }
});
