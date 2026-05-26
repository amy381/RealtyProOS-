-- ============================================================================
-- Phase C: Team Members (TC access to the agent's data)
-- ============================================================================
-- Run via: Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- This migration:
--   1. Creates a team_members join table linking TC user ids to their agent.
--   2. Seeds Amy's two existing TCs (Justina, Victoria).
--   3. Adds a SECURITY DEFINER helper, is_owner_or_team_member(uuid), that
--      returns true if the calling user owns the row OR is a member of the
--      owner's team.
--   4. Replaces the four user-scoped policies created in Phase A on each of
--      the 19 tenant tables so they consult the helper instead of doing a
--      literal auth.uid() = user_id check.
--
-- ATOMIC (single transaction) and IDEMPOTENT (safe to re-run).
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1 — team_members table + its own RLS
-- ────────────────────────────────────────────────────────────────────────────
-- Note: this table intentionally does NOT have a `user_id` column. Its access
-- pattern is "the agent sees their own roster + each member sees their own
-- membership rows", which doesn't fit the owner-scoped Phase A pattern.

CREATE TABLE IF NOT EXISTS public.team_members (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_user_id   uuid        NOT NULL REFERENCES auth.users(id),
  member_user_id  uuid        NOT NULL REFERENCES auth.users(id),
  role            text        NOT NULL DEFAULT 'tc',
  created_at      timestamptz DEFAULT now(),
  UNIQUE (agent_user_id, member_user_id)
);

CREATE INDEX IF NOT EXISTS team_members_agent_user_id_idx  ON public.team_members(agent_user_id);
CREATE INDEX IF NOT EXISTS team_members_member_user_id_idx ON public.team_members(member_user_id);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Idempotent drops so re-runs don't fail on duplicate policy names
DROP POLICY IF EXISTS "Agents can view own team"        ON public.team_members;
DROP POLICY IF EXISTS "Agents can insert own team"      ON public.team_members;
DROP POLICY IF EXISTS "Agents can update own team"      ON public.team_members;
DROP POLICY IF EXISTS "Agents can delete own team"      ON public.team_members;
DROP POLICY IF EXISTS "Members can view own membership" ON public.team_members;

CREATE POLICY "Agents can view own team" ON public.team_members
  FOR SELECT TO authenticated USING (auth.uid() = agent_user_id);
CREATE POLICY "Agents can insert own team" ON public.team_members
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = agent_user_id);
CREATE POLICY "Agents can update own team" ON public.team_members
  FOR UPDATE TO authenticated USING (auth.uid() = agent_user_id) WITH CHECK (auth.uid() = agent_user_id);
CREATE POLICY "Agents can delete own team" ON public.team_members
  FOR DELETE TO authenticated USING (auth.uid() = agent_user_id);
CREATE POLICY "Members can view own membership" ON public.team_members
  FOR SELECT TO authenticated USING (auth.uid() = member_user_id);


-- ────────────────────────────────────────────────────────────────────────────
-- Step 2 — Seed Amy's existing TCs
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.team_members (agent_user_id, member_user_id, role) VALUES
  ('a02b464f-dd3e-49de-b893-2825fe8efb3f', '040ef107-c64a-45be-b810-e0cb080e7e39', 'tc'),  -- Justina
  ('a02b464f-dd3e-49de-b893-2825fe8efb3f', '5242f551-9551-4fe6-95cd-d98c2ecd884f', 'tc')   -- Victoria
ON CONFLICT (agent_user_id, member_user_id) DO NOTHING;


-- ────────────────────────────────────────────────────────────────────────────
-- Step 3 — RLS helper function
-- ────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so the function can read team_members regardless of the
-- caller's RLS context. STABLE because the result depends only on session
-- state (auth.uid()) and the team_members table within a single statement.
-- search_path is pinned so a malicious schema can't shadow public/auth lookups.

CREATE OR REPLACE FUNCTION public.is_owner_or_team_member(row_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 WHERE auth.uid() = row_user_id
    UNION ALL
    SELECT 1 FROM public.team_members
      WHERE agent_user_id  = row_user_id
        AND member_user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_owner_or_team_member(uuid) TO authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- Step 4 — Replace Phase A user-scoped policies with team-aware versions
-- ────────────────────────────────────────────────────────────────────────────
-- Same four policy names as Phase A so this migration is reversible and clean.

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
    EXECUTE format('DROP POLICY IF EXISTS "Users can view own data" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Users can view own data" ON public.%I '
      'FOR SELECT TO authenticated USING (public.is_owner_or_team_member(user_id))',
      t
    );

    -- INSERT
    EXECUTE format('DROP POLICY IF EXISTS "Users can insert own data" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Users can insert own data" ON public.%I '
      'FOR INSERT TO authenticated WITH CHECK (public.is_owner_or_team_member(user_id))',
      t
    );

    -- UPDATE
    EXECUTE format('DROP POLICY IF EXISTS "Users can update own data" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Users can update own data" ON public.%I '
      'FOR UPDATE TO authenticated USING (public.is_owner_or_team_member(user_id)) '
      'WITH CHECK (public.is_owner_or_team_member(user_id))',
      t
    );

    -- DELETE
    EXECUTE format('DROP POLICY IF EXISTS "Users can delete own data" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Users can delete own data" ON public.%I '
      'FOR DELETE TO authenticated USING (public.is_owner_or_team_member(user_id))',
      t
    );
  END LOOP;
END
$$;

COMMIT;


-- ============================================================================
-- VERIFICATION — run after the migration commits
-- ============================================================================

-- 1. Confirm team_members exists and Amy's two TCs are linked:
--
--   SELECT agent_user_id, member_user_id, role FROM public.team_members
--   ORDER BY created_at;
--   Expected: 2 rows, both with agent_user_id = a02b464f-...
--             (member ids: 040ef107-... and 5242f551-...)

-- 2. Confirm the helper function is SECURITY DEFINER:
--
--   SELECT proname, prosecdef, provolatile
--   FROM pg_proc p
--   WHERE proname = 'is_owner_or_team_member';
--   Expected: prosecdef = true, provolatile = 's' (STABLE)

-- 3. Confirm every tenant table still has exactly 4 user-scoped policies:
--
--   SELECT tablename, count(*) AS user_policies
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND policyname LIKE 'Users can %'
--     AND tablename IN (
--       'transactions','tasks','commissions','collaborators','email_templates',
--       'agent_settings','showings','transaction_notes','task_comments',
--       'email_queue','email_sent_log','saved_filters','google_auth',
--       'tc_settings','task_templates','template_tasks','transaction_history',
--       'vendors','document_uploads'
--     )
--   GROUP BY tablename
--   ORDER BY tablename;
--   Expected: every row shows user_policies = 4.

-- 4. Smoke-test the function from psql for each known user:
--
--   SET LOCAL "request.jwt.claims" = '{"sub":"a02b464f-dd3e-49de-b893-2825fe8efb3f"}';
--   SELECT public.is_owner_or_team_member('a02b464f-dd3e-49de-b893-2825fe8efb3f') AS amy_sees_own,
--          public.is_owner_or_team_member('63578549-0148-49fc-bc4d-59328f047429') AS amy_sees_sarah;
--   -- amy_sees_own = true, amy_sees_sarah = false
--
--   SET LOCAL "request.jwt.claims" = '{"sub":"040ef107-c64a-45be-b810-e0cb080e7e39"}';
--   SELECT public.is_owner_or_team_member('a02b464f-dd3e-49de-b893-2825fe8efb3f') AS justina_sees_amy,
--          public.is_owner_or_team_member('63578549-0148-49fc-bc4d-59328f047429') AS justina_sees_sarah;
--   -- justina_sees_amy = true, justina_sees_sarah = false
