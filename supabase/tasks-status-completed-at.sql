-- Add completed_at column and extend status constraint to include 'in_progress'.
--
-- Run this once in the Supabase SQL editor:
--   https://app.supabase.com → SQL Editor

-- 1. Add completed_at timestamp (nullable — only set when status = 'complete')
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- 2. Drop the old status check constraint and replace with one that includes in_progress
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_status_check;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_status_check
    CHECK (status IN ('open', 'in_progress', 'complete'));
