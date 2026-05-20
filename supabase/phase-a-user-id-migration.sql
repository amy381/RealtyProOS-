-- ============================================================================
-- Phase A: Add user_id to all tenant-scoped tables (multi-tenancy foundation)
-- ============================================================================
-- Run via: Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- This migration is ATOMIC (single transaction). If any step fails, nothing
-- commits. It is also RE-RUNNABLE — safe to apply twice.
--
-- Before running:
--   1. Take a Supabase database backup (Project Settings → Database → Backups).
--   2. Confirm AMY_USER_ID below matches the value in
--      auth.users for amy@desert-legacy.com.
--
-- Scope: 19 tables (verified to exist in the public schema on 2026-05-20).
-- The earlier draft also touched user_settings and notify_snapshots — both
-- referenced in client code but never actually created in this project. They
-- are out of scope for Phase A; the broken writes are a separate issue.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1 — Add user_id column (NULLABLE) to every table
-- ────────────────────────────────────────────────────────────────────────────
-- REFERENCES auth.users(id) with default ON DELETE NO ACTION — deleting a
-- Supabase auth user will be blocked until their rows are cleaned up. We can
-- relax to ON DELETE CASCADE in a later phase if/when we add account deletion.

ALTER TABLE public.transactions        ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.tasks               ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.commissions         ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.collaborators       ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.email_templates     ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.agent_settings      ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.showings            ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.transaction_notes   ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.task_comments       ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.email_queue         ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.email_sent_log      ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.saved_filters       ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.google_auth         ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.tc_settings         ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.task_templates      ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.template_tasks      ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.transaction_history ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.vendors             ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.document_uploads    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);


-- ────────────────────────────────────────────────────────────────────────────
-- Step 2 — Backfill every existing row to Amy's user_id
-- ────────────────────────────────────────────────────────────────────────────
-- All existing data was created when LegacyOS was single-user, so every row
-- belongs to Amy. The WHERE user_id IS NULL clause makes this re-runnable.

UPDATE public.transactions        SET user_id = 'a02b464f-dd3e-49de-b893-2825fe8efb3f' WHERE user_id IS NULL;
UPDATE public.tasks               SET user_id = 'a02b464f-dd3e-49de-b893-2825fe8efb3f' WHERE user_id IS NULL;
UPDATE public.commissions         SET user_id = 'a02b464f-dd3e-49de-b893-2825fe8efb3f' WHERE user_id IS NULL;
UPDATE public.collaborators       SET user_id = 'a02b464f-dd3e-49de-b893-2825fe8efb3f' WHERE user_id IS NULL;
UPDATE public.email_templates     SET user_id = 'a02b464f-dd3e-49de-b893-2825fe8efb3f' WHERE user_id IS NULL;
UPDATE public.agent_settings      SET user_id = 'a02b464f-dd3e-49de-b893-2825fe8efb3f' WHERE user_id IS NULL;
UPDATE public.showings            SET user_id = 'a02b464f-dd3e-49de-b893-2825fe8efb3f' WHERE user_id IS NULL;
UPDATE public.transaction_notes   SET user_id = 'a02b464f-dd3e-49de-b893-2825fe8efb3f' WHERE user_id IS NULL;
UPDATE public.task_comments       SET user_id = 'a02b464f-dd3e-49de-b893-2825fe8efb3f' WHERE user_id IS NULL;
UPDATE public.email_queue         SET user_id = 'a02b464f-dd3e-49de-b893-2825fe8efb3f' WHERE user_id IS NULL;
UPDATE public.email_sent_log      SET user_id = 'a02b464f-dd3e-49de-b893-2825fe8efb3f' WHERE user_id IS NULL;
UPDATE public.saved_filters       SET user_id = 'a02b464f-dd3e-49de-b893-2825fe8efb3f' WHERE user_id IS NULL;
UPDATE public.google_auth         SET user_id = 'a02b464f-dd3e-49de-b893-2825fe8efb3f' WHERE user_id IS NULL;
UPDATE public.tc_settings         SET user_id = 'a02b464f-dd3e-49de-b893-2825fe8efb3f' WHERE user_id IS NULL;
UPDATE public.task_templates      SET user_id = 'a02b464f-dd3e-49de-b893-2825fe8efb3f' WHERE user_id IS NULL;
UPDATE public.template_tasks      SET user_id = 'a02b464f-dd3e-49de-b893-2825fe8efb3f' WHERE user_id IS NULL;
UPDATE public.transaction_history SET user_id = 'a02b464f-dd3e-49de-b893-2825fe8efb3f' WHERE user_id IS NULL;
UPDATE public.vendors             SET user_id = 'a02b464f-dd3e-49de-b893-2825fe8efb3f' WHERE user_id IS NULL;
UPDATE public.document_uploads    SET user_id = 'a02b464f-dd3e-49de-b893-2825fe8efb3f' WHERE user_id IS NULL;


-- ────────────────────────────────────────────────────────────────────────────
-- Step 3 — Set user_id NOT NULL
-- ────────────────────────────────────────────────────────────────────────────
-- This will fail (rolling back the whole transaction) if any row is still NULL
-- after the backfill. That's the desired safety check.

ALTER TABLE public.transactions        ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.tasks               ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.commissions         ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.collaborators       ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.email_templates     ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.agent_settings      ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.showings            ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.transaction_notes   ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.task_comments       ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.email_queue         ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.email_sent_log      ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.saved_filters       ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.google_auth         ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.tc_settings         ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.task_templates      ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.template_tasks      ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.transaction_history ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.vendors             ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.document_uploads    ALTER COLUMN user_id SET NOT NULL;


-- ────────────────────────────────────────────────────────────────────────────
-- Step 4 — Index user_id on every table for RLS query performance
-- ────────────────────────────────────────────────────────────────────────────
-- Every read goes through `auth.uid() = user_id`. Without an index, that
-- becomes a sequential scan per query.

CREATE INDEX IF NOT EXISTS transactions_user_id_idx        ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS tasks_user_id_idx               ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS commissions_user_id_idx         ON public.commissions(user_id);
CREATE INDEX IF NOT EXISTS collaborators_user_id_idx       ON public.collaborators(user_id);
CREATE INDEX IF NOT EXISTS email_templates_user_id_idx     ON public.email_templates(user_id);
CREATE INDEX IF NOT EXISTS agent_settings_user_id_idx      ON public.agent_settings(user_id);
CREATE INDEX IF NOT EXISTS showings_user_id_idx            ON public.showings(user_id);
CREATE INDEX IF NOT EXISTS transaction_notes_user_id_idx   ON public.transaction_notes(user_id);
CREATE INDEX IF NOT EXISTS task_comments_user_id_idx       ON public.task_comments(user_id);
CREATE INDEX IF NOT EXISTS email_queue_user_id_idx         ON public.email_queue(user_id);
CREATE INDEX IF NOT EXISTS email_sent_log_user_id_idx      ON public.email_sent_log(user_id);
CREATE INDEX IF NOT EXISTS saved_filters_user_id_idx       ON public.saved_filters(user_id);
CREATE INDEX IF NOT EXISTS google_auth_user_id_idx         ON public.google_auth(user_id);
CREATE INDEX IF NOT EXISTS tc_settings_user_id_idx         ON public.tc_settings(user_id);
CREATE INDEX IF NOT EXISTS task_templates_user_id_idx      ON public.task_templates(user_id);
CREATE INDEX IF NOT EXISTS template_tasks_user_id_idx      ON public.template_tasks(user_id);
CREATE INDEX IF NOT EXISTS transaction_history_user_id_idx ON public.transaction_history(user_id);
CREATE INDEX IF NOT EXISTS vendors_user_id_idx             ON public.vendors(user_id);
CREATE INDEX IF NOT EXISTS document_uploads_user_id_idx    ON public.document_uploads(user_id);


-- ────────────────────────────────────────────────────────────────────────────
-- Step 5 — Enable RLS on tables that don't have it yet
-- ────────────────────────────────────────────────────────────────────────────
-- 17 of these already have RLS enabled (see supabase/rls-policies.sql).
-- agent_settings and google_auth do not. ENABLE ROW LEVEL SECURITY is
-- idempotent so this block is safe for re-runs.

ALTER TABLE public.transactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaborators       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.showings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_notes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_queue         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sent_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_filters       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_auth         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tc_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_tasks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_uploads    ENABLE ROW LEVEL SECURITY;


-- ────────────────────────────────────────────────────────────────────────────
-- Step 6 — Drop existing wide-open policies
-- ────────────────────────────────────────────────────────────────────────────
-- Current policy is named "authenticated_all" (see supabase/rls-policies.sql).
-- agent_settings/google_auth previously had no policies at all — IF EXISTS
-- makes those no-ops.

DROP POLICY IF EXISTS "authenticated_all" ON public.transactions;
DROP POLICY IF EXISTS "authenticated_all" ON public.tasks;
DROP POLICY IF EXISTS "authenticated_all" ON public.commissions;
DROP POLICY IF EXISTS "authenticated_all" ON public.collaborators;
DROP POLICY IF EXISTS "authenticated_all" ON public.email_templates;
DROP POLICY IF EXISTS "authenticated_all" ON public.agent_settings;
DROP POLICY IF EXISTS "authenticated_all" ON public.showings;
DROP POLICY IF EXISTS "authenticated_all" ON public.transaction_notes;
DROP POLICY IF EXISTS "authenticated_all" ON public.task_comments;
DROP POLICY IF EXISTS "authenticated_all" ON public.email_queue;
DROP POLICY IF EXISTS "authenticated_all" ON public.email_sent_log;
DROP POLICY IF EXISTS "authenticated_all" ON public.saved_filters;
DROP POLICY IF EXISTS "authenticated_all" ON public.google_auth;
DROP POLICY IF EXISTS "authenticated_all" ON public.tc_settings;
DROP POLICY IF EXISTS "authenticated_all" ON public.task_templates;
DROP POLICY IF EXISTS "authenticated_all" ON public.template_tasks;
DROP POLICY IF EXISTS "authenticated_all" ON public.transaction_history;
DROP POLICY IF EXISTS "authenticated_all" ON public.vendors;
DROP POLICY IF EXISTS "authenticated_all" ON public.document_uploads;


-- ────────────────────────────────────────────────────────────────────────────
-- Step 7 — Create user-scoped RLS policies (4 per table)
-- ────────────────────────────────────────────────────────────────────────────
-- Each table gets SELECT / INSERT / UPDATE / DELETE policies enforcing that
-- auth.uid() matches user_id. DROP IF EXISTS before each CREATE keeps this
-- migration idempotent.
--
-- NOTE: Server-side code in server/routes/* and api/google/* uses the SUPABASE
-- SERVICE ROLE KEY, which bypasses RLS entirely. The NOT NULL constraint still
-- applies, so those routes need to supply user_id explicitly. Phase A leaves
-- them as-is (single-user assumption); revisit in Phase B.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'transactions', 'tasks', 'commissions', 'collaborators', 'email_templates',
    'agent_settings', 'showings', 'transaction_notes', 'task_comments',
    'email_queue', 'email_sent_log', 'saved_filters', 'google_auth',
    'tc_settings', 'task_templates', 'template_tasks', 'transaction_history',
    'vendors', 'document_uploads'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- SELECT
    EXECUTE format(
      'DROP POLICY IF EXISTS "Users can view own data" ON public.%I', t
    );
    EXECUTE format(
      'CREATE POLICY "Users can view own data" ON public.%I '
      'FOR SELECT TO authenticated USING (auth.uid() = user_id)', t
    );

    -- INSERT
    EXECUTE format(
      'DROP POLICY IF EXISTS "Users can insert own data" ON public.%I', t
    );
    EXECUTE format(
      'CREATE POLICY "Users can insert own data" ON public.%I '
      'FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)', t
    );

    -- UPDATE
    EXECUTE format(
      'DROP POLICY IF EXISTS "Users can update own data" ON public.%I', t
    );
    EXECUTE format(
      'CREATE POLICY "Users can update own data" ON public.%I '
      'FOR UPDATE TO authenticated USING (auth.uid() = user_id) '
      'WITH CHECK (auth.uid() = user_id)', t
    );

    -- DELETE
    EXECUTE format(
      'DROP POLICY IF EXISTS "Users can delete own data" ON public.%I', t
    );
    EXECUTE format(
      'CREATE POLICY "Users can delete own data" ON public.%I '
      'FOR DELETE TO authenticated USING (auth.uid() = user_id)', t
    );
  END LOOP;
END
$$;


COMMIT;


-- ============================================================================
-- VERIFICATION — run these AFTER the migration commits
-- ============================================================================
-- These are reference queries; they don't execute as part of the migration.

-- 1. Confirm RLS is on for all 19 tables (rowsecurity = true):
--
--   SELECT tablename, rowsecurity
--   FROM pg_tables
--   WHERE schemaname = 'public'
--     AND tablename IN (
--       'transactions','tasks','commissions','collaborators','email_templates',
--       'agent_settings','showings','transaction_notes','task_comments',
--       'email_queue','email_sent_log','saved_filters','google_auth',
--       'tc_settings','task_templates','template_tasks','transaction_history',
--       'vendors','document_uploads'
--     )
--   ORDER BY tablename;

-- 2. Confirm 4 policies exist per table (76 rows total):
--
--   SELECT tablename, policyname, cmd
--   FROM pg_policies
--   WHERE schemaname = 'public'
--   ORDER BY tablename, cmd;

-- 3. Confirm no NULL user_id values remain (every row count = 0):
--
--   SELECT 'transactions' AS tbl, count(*) AS null_user_id_rows FROM public.transactions WHERE user_id IS NULL
--   UNION ALL SELECT 'tasks',                count(*) FROM public.tasks               WHERE user_id IS NULL
--   UNION ALL SELECT 'commissions',          count(*) FROM public.commissions         WHERE user_id IS NULL
--   UNION ALL SELECT 'collaborators',        count(*) FROM public.collaborators       WHERE user_id IS NULL
--   UNION ALL SELECT 'email_templates',      count(*) FROM public.email_templates     WHERE user_id IS NULL
--   UNION ALL SELECT 'agent_settings',       count(*) FROM public.agent_settings      WHERE user_id IS NULL
--   UNION ALL SELECT 'showings',             count(*) FROM public.showings            WHERE user_id IS NULL
--   UNION ALL SELECT 'transaction_notes',    count(*) FROM public.transaction_notes   WHERE user_id IS NULL
--   UNION ALL SELECT 'task_comments',        count(*) FROM public.task_comments       WHERE user_id IS NULL
--   UNION ALL SELECT 'email_queue',          count(*) FROM public.email_queue         WHERE user_id IS NULL
--   UNION ALL SELECT 'email_sent_log',       count(*) FROM public.email_sent_log      WHERE user_id IS NULL
--   UNION ALL SELECT 'saved_filters',        count(*) FROM public.saved_filters       WHERE user_id IS NULL
--   UNION ALL SELECT 'google_auth',          count(*) FROM public.google_auth         WHERE user_id IS NULL
--   UNION ALL SELECT 'tc_settings',          count(*) FROM public.tc_settings         WHERE user_id IS NULL
--   UNION ALL SELECT 'task_templates',       count(*) FROM public.task_templates      WHERE user_id IS NULL
--   UNION ALL SELECT 'template_tasks',       count(*) FROM public.template_tasks      WHERE user_id IS NULL
--   UNION ALL SELECT 'transaction_history',  count(*) FROM public.transaction_history WHERE user_id IS NULL
--   UNION ALL SELECT 'vendors',              count(*) FROM public.vendors             WHERE user_id IS NULL
--   UNION ALL SELECT 'document_uploads',     count(*) FROM public.document_uploads    WHERE user_id IS NULL;

-- 4. Sanity check that Amy's user_id matches what you'd expect:
--
--   SELECT id, email FROM auth.users WHERE id = 'a02b464f-dd3e-49de-b893-2825fe8efb3f';
