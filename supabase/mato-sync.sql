-- Fetching the driver's refills from MATO Info every 5 minutes, scheduled once
-- in Prikklok's Supabase project after deploying the 'mato' Edge Function
-- (supabase/functions/mato) and linking MATO Info (supabase/mato-link.sql).
-- Fill in the project ref and the publishable key from web/config.js.
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.schedule('mato-refills', '*/5 * * * *', $job$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/mato',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'apikey', '<publishable-key>',
                                  'x-cron-secret', (select cron_secret from app_private.mato where id = 1)),
    body := '{"action":"sync"}'::jsonb,
    timeout_milliseconds := 30000)
$job$);
