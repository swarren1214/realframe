-- Every 5 minutes, ask the app to send any notification emails that are due.
-- The endpoint is safe to call at any time: the database hands each batch out
-- once and emails a person at most every 15 minutes.
create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'realframe-notification-digest',
  '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://www.realframe.app/api/notifications/digest',
       headers := '{"content-type": "application/json"}'::jsonb,
       body := '{}'::jsonb
     ); $$
);
