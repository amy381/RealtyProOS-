-- Add resolves_critical_date to template_tasks table
-- Stores the template_task id of the Critical Date task this task resolves.
-- When a template is applied, this is mapped to the actual created task id.
ALTER TABLE template_tasks
  ADD COLUMN IF NOT EXISTS resolves_critical_date uuid REFERENCES template_tasks(id) ON DELETE SET NULL;
