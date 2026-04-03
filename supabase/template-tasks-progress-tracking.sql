-- Add has_progress_tracking to the template_tasks table.
-- When a template is applied, this flag carries through to the created
-- task row exactly as task_type and resolves_critical_date already do.
ALTER TABLE template_tasks
  ADD COLUMN IF NOT EXISTS has_progress_tracking boolean NOT NULL DEFAULT false;
