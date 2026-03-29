-- ============================================================
-- RLS Migration: Enable Row Level Security on all tables
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
--
-- Policy design: single-workspace app with Google OAuth.
-- Any authenticated Supabase user gets full read/write access.
-- Unauthenticated (anon) requests are blocked entirely.
-- ============================================================


-- ─── 1. ENABLE RLS ───────────────────────────────────────────────────────────

ALTER TABLE transactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE tc_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_tasks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE showings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaborators      ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors            ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_filters      ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_notes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notify_snapshots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_uploads   ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_queue        ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sent_log     ENABLE ROW LEVEL SECURITY;


-- ─── 2. DROP EXISTING POLICIES (idempotent) ──────────────────────────────────

DROP POLICY IF EXISTS "authenticated_all" ON transactions;
DROP POLICY IF EXISTS "authenticated_all" ON commissions;
DROP POLICY IF EXISTS "authenticated_all" ON tasks;
DROP POLICY IF EXISTS "authenticated_all" ON tc_settings;
DROP POLICY IF EXISTS "authenticated_all" ON task_templates;
DROP POLICY IF EXISTS "authenticated_all" ON template_tasks;
DROP POLICY IF EXISTS "authenticated_all" ON task_comments;
DROP POLICY IF EXISTS "authenticated_all" ON user_settings;
DROP POLICY IF EXISTS "authenticated_all" ON showings;
DROP POLICY IF EXISTS "authenticated_all" ON collaborators;
DROP POLICY IF EXISTS "authenticated_all" ON email_templates;
DROP POLICY IF EXISTS "authenticated_all" ON vendors;
DROP POLICY IF EXISTS "authenticated_all" ON saved_filters;
DROP POLICY IF EXISTS "authenticated_all" ON transaction_notes;
DROP POLICY IF EXISTS "authenticated_all" ON notify_snapshots;
DROP POLICY IF EXISTS "authenticated_all" ON document_uploads;
DROP POLICY IF EXISTS "authenticated_all" ON transaction_history;
DROP POLICY IF EXISTS "authenticated_all" ON email_queue;
DROP POLICY IF EXISTS "authenticated_all" ON email_sent_log;


-- ─── 3. CREATE POLICIES ───────────────────────────────────────────────────────
--
-- USING (true)      → any existing row is visible/updatable/deletable
-- WITH CHECK (true) → any new row can be inserted/updated
-- TO authenticated  → only applies to logged-in users; anon role gets nothing

CREATE POLICY "authenticated_all" ON transactions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON commissions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON tc_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON task_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON template_tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON task_comments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON user_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON showings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON collaborators
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON email_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON vendors
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON saved_filters
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON transaction_notes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON notify_snapshots
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON document_uploads
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON transaction_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON email_queue
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON email_sent_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ─── 4. VERIFY ───────────────────────────────────────────────────────────────
-- Run this query after the migration to confirm all tables are protected:
--
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
--
-- Every table should show rowsecurity = true.
-- To check policies were created:
--
-- SELECT tablename, policyname, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
