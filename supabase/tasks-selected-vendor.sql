-- Add selected_vendor_id to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS selected_vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL;
