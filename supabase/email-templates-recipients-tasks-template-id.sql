-- Add structured recipients/cc JSONB columns to email_templates
-- Add email_template_id to tasks so Email-type tasks carry their linked template

ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS recipients    jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cc_recipients jsonb DEFAULT '[]'::jsonb;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS email_template_id uuid REFERENCES email_templates(id) ON DELETE SET NULL;
