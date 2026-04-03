-- Add progress-tracking fields to the tasks table.
-- has_progress_tracking: when true, the Global Tasks tab shows the
--   Progress Date column (ordered_date / scheduled_date) for this row.
-- ordered_date:    the date the service/item was ordered.
-- scheduled_date:  the date the service/item is scheduled.
--
-- For tasks whose titles correspond to tracked transaction-level dates
-- (Home Inspection → transaction.home_inspection_date,
--  Appraisal       → transaction.appraisal_date,
--  BINSR Submitted → transaction.binsr_submitted_date),
-- the UI performs a one-way sync: saving ordered_date or scheduled_date
-- on the task also calls onUpdateTransaction with the mapped field.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS has_progress_tracking boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ordered_date          date,
  ADD COLUMN IF NOT EXISTS scheduled_date        date;
