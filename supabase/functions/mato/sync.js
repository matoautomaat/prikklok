// The driver's refills from MATO Info (the vending app, its own Supabase
// project), kept in machine_visits: every 5 minutes by pg_cron and when a
// manager taps "Nu ophalen". MATO Info answers through one read-only function,
// public.prikklok_refill_visits, that wants the secret in app_private.mato
// (supabase/mato-link.sql). Plain JavaScript, so the local tests can run it.

export function makeMato({ db, fetch, now = () => new Date() }) {
  const DAY = 86400000;
  const fail = (message, code) => Object.assign(new Error(message), code ? { code } : {});

  async function run({ token, cron }) {
    const cfg = await db('select row_to_json(m) as r from app_private.mato m where id = 1', []);
    if (!cfg) throw fail('MATO Info is not linked.');
    if (cron) {
      if (cron !== cfg.cron_secret) throw fail('Not allowed.', '28000');
    } else {
      await db('select (app_private.current_manager($1)).id as r', [token || '']);
    }
    // the last two days, or back to the last run (a day more), at most 35 days
    const to = now();
    const behind = cfg.last_sync_at ? (to - new Date(cfg.last_sync_at)) / DAY + 1 : 35;
    const from = new Date(to.getTime() - Math.min(35, Math.max(2, behind)) * DAY);
    let visits;
    try {
      const res = await fetch(`${cfg.url}/rest/v1/rpc/prikklok_refill_visits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: cfg.api_key },
        body: JSON.stringify({ p_secret: cfg.secret, p_from: from.toISOString(), p_to: to.toISOString() }),
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = '';
        try { msg = JSON.parse(text).message || ''; } catch { /* not json */ }
        throw fail(`MATO Info answered ${res.status}${msg ? `: ${msg}` : ''}.`);
      }
      visits = JSON.parse(text);
      if (!Array.isArray(visits)) throw fail('MATO Info sent something unexpected.');
    } catch (e) {
      await db('select app_private.mato_failed($1) as r', [String(e.message || e)]);
      throw e;
    }
    const report = await db('select app_private.mato_store($1::text::json, $2::timestamptz) as r', [JSON.stringify(visits), from.toISOString()]);
    return { ok: true, report };
  }

  return { run };
}
