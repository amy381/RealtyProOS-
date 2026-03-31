-- Adds the scopes column to google_auth so the stored OAuth token's granted scopes
-- are persisted on each re-auth. Used by /api/google/gmail-status to detect whether
-- the gmail.send scope is present without making a live API call.
--
-- Also adds gmail_message_id and sent_via to email_sent_log to support the Gmail
-- send path and track how each email was delivered as we migrate away from EmailJS.

alter table google_auth
  add column if not exists scopes text;

alter table email_sent_log
  add column if not exists gmail_message_id text,
  add column if not exists sent_via text not null default 'emailjs'
    constraint email_sent_log_sent_via_check
    check (sent_via in ('gmail', 'emailjs', 'manual'));
