// The app's link with Exact Officient. Called by the app (a manager: connect
// or "Nu ophalen") and every night by pg_cron with its own secret. It does its
// own checks: the app's session token, or the nightly secret.
import postgres from 'npm:postgres@3.4.5';
import { makeOfficient } from './sync.js';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 });
const officient = makeOfficient({
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
    const out = await officient.run({
      action: body.action === 'connect' ? 'connect' : 'sync',
      token: body.token, code: body.code, state: body.state,
      cron: req.headers.get('x-cron-secret') || undefined,
    });
    return reply(200, out);
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return reply(err.code === '28000' ? 401 : 400, { code: err.code, message: err.message || String(e) });
  }
});
