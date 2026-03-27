-- Adds appraisal_date to transactions and row_date to tasks.
-- Run in the Supabase SQL editor.

alter table transactions
  add column if not exists appraisal_date date;

alter table tasks
  add column if not exists row_date date;
