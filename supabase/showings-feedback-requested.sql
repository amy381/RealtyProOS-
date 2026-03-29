-- Add feedback_requested and feedback_requested_at to showings table
-- feedback_requested: boolean flag for whether a feedback request email has been sent
-- feedback_requested_at: timestamp of when the last request was sent
ALTER TABLE showings ADD COLUMN IF NOT EXISTS feedback_requested boolean NOT NULL DEFAULT false;
ALTER TABLE showings ADD COLUMN IF NOT EXISTS feedback_requested_at timestamptz;
