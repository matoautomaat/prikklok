-- The nightly Officient fetch, scheduled once per Supabase project after
-- deploying the 'officient' Edge Function (supabase/functions/officient).
-- Fill in the project ref and the publishable key from web/config.js.
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.schedule('officient-nightly', '7 2 * * *', $job$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/officient',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'apikey', '<publishable-key>',
                                  'x-cron-secret', (select cron_secret from app_private.officient where id = 1)),
    body := '{"action":"sync"}'::jsonb,
    timeout_milliseconds := 150000)
$job$);
