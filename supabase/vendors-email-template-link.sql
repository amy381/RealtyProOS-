-- Link email-only vendors to an email template
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS email_template_id uuid REFERENCES email_templates(id) ON DELETE SET NULL;
