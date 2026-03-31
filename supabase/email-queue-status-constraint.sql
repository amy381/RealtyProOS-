-- Formalises the status column on email_queue to support pending / sent / failed.
-- The column already exists with default 'pending'. This adds the check constraint
-- so failed items can be distinguished from unsent ones and retried from the UI.

alter table email_queue
  add constraint email_queue_status_check
  check (status in ('pending', 'sent', 'failed'));
