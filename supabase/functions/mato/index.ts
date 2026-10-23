// The driver's refills from MATO Info into Prikklok (see sync.js). Called every
// 5 minutes by pg_cron with its own secret (supabase/mato-sync.sql), and by the
// app when a manager taps "Nu ophalen" on Ritten.
import postgres from 'npm:postgres@3.4.5';
import { makeMato } from './sync.js';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 });
const mato = makeMato({
  db: async (text: string, params: unknown[]) => (await sql.unsafe(text, params as never[]))[0]?.r,
  fetch,
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
    return reply(200, await mato.run({ token: body.token, cron: req.headers.get('x-cron-secret') || undefined }));
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return reply(err.code === '28000' ? 401 : 400, { code: err.code, message: err.message || String(e) });
  }
});
