-- Adds the critical date linking column to the tasks table.
-- Run in the Supabase SQL editor.

alter table tasks
  add column if not exists resolves_critical_date text;
