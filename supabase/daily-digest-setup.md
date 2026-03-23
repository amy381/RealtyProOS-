# Daily Digest Setup

## 1. SQL — Run in Supabase SQL Editor

```sql
-- user_settings table (digest preferences)
create table if not exists user_settings (
  id                   uuid primary key default gen_random_uuid(),
  email                text unique not null,
  daily_digest_enabled boolean not null default true,
  created_at           timestamptz default now()
);

alter table user_settings enable row level security;
create policy "service role full access" on user_settings
  using (true) with check (true);
```

## 2. Deploy the Edge Function

```bash
# From the project root
npx supabase login
npx supabase link --project-ref <your-project-ref>

npx supabase functions deploy send-daily-digest
```

## 3. Set Supabase Secrets

```bash
npx supabase secrets set \
  EMAILJS_SERVICE_ID=<your_service_id> \
  EMAILJS_DIGEST_TEMPLATE_ID=<your_digest_template_id> \
  EMAILJS_PUBLIC_KEY=<your_public_key> \
  EMAILJS_PRIVATE_KEY=<your_private_key>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

## 4. Schedule the Cron Job

In the Supabase Dashboard → **Edge Functions** → **send-daily-digest** → **Schedule**, set:

```
0 15 * * *
```

This is 8:00 AM Arizona time (UTC-7, no DST). Arizona never observes daylight saving time.

Alternatively, run this SQL in the SQL Editor (requires pg_cron extension enabled):

```sql
select cron.schedule(
  'daily-digest',
  '0 15 * * *',
  $$
  select net.http_post(
    url    := current_setting('app.supabase_url') || '/functions/v1/send-daily-digest',
    body   := '{}',
    params := '{}',
    headers := json_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type',  'application/json'
    )::jsonb
  )
  $$
);
```

> Note: Supabase's built-in cron scheduler in the dashboard is the easiest option.

## 5. Create the EmailJS Digest Template

1. Log in to [emailjs.com](https://www.emailjs.com)
2. Go to **Email Templates** → **Create New Template**
3. Set the template to send to: `{{to_email}}`
4. Subject: `{{subject}}`
5. Body: Choose **HTML** mode and paste:

```html
{{{message_html}}}
```

6. Save the template and copy the **Template ID** → use as `EMAILJS_DIGEST_TEMPLATE_ID` secret

## 6. Test Manually

Invoke the function manually from the Supabase dashboard or CLI:

```bash
npx supabase functions invoke send-daily-digest --no-verify-jwt
```

Response will show which users received emails and which were skipped.
