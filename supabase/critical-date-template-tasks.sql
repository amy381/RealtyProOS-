-- Pre-populates Buyer and Seller Residential Pending templates with Critical Date tasks.
-- Run in the Supabase SQL editor.
--
-- This script finds templates by matching their name with ILIKE patterns.
-- If your template names differ, update the WHERE clauses below.
-- Expected names: one containing "buyer" + "pending", one containing "seller" + "pending".

DO $$
DECLARE
  buyer_tid  uuid;
  seller_tid uuid;
  b_sort     int;
  s_sort     int;
BEGIN
  -- Find buyer pending template
  SELECT id INTO buyer_tid
    FROM task_templates
    WHERE name ILIKE '%buyer%' AND name ILIKE '%pending%'
    ORDER BY created_at ASC
    LIMIT 1;

  -- Find seller pending template
  SELECT id INTO seller_tid
    FROM task_templates
    WHERE name ILIKE '%seller%' AND name ILIKE '%pending%'
    ORDER BY created_at ASC
    LIMIT 1;

  -- ── Buyer Residential — Pending ──────────────────────────────────────────
  IF buyer_tid IS NOT NULL THEN
    SELECT COALESCE(MAX(sort_order), -1) + 1 INTO b_sort
      FROM template_tasks WHERE template_id = buyer_tid;

    INSERT INTO template_tasks
      (template_id, title, task_type, timing_type, timing_days, applies_to, auto_assign_to, sort_order)
    VALUES
      (buyer_tid, 'SPDS Due',                      'Critical Date', 'days_after_contract', 3,  'Both', 'Me', b_sort),
      (buyer_tid, 'Solar System Documents',         'Critical Date', 'days_after_contract', 3,  'Both', 'Me', b_sort + 1),
      (buyer_tid, 'IHR Due',                        'Critical Date', 'days_after_contract', 5,  'Both', 'Me', b_sort + 2),
      (buyer_tid, 'DWWA SPDS',                      'Critical Date', 'days_after_contract', 5,  'Both', 'Me', b_sort + 3),
      (buyer_tid, 'Well Registration (ADWR)',        'Critical Date', 'days_after_contract', 5,  'Both', 'Me', b_sort + 4),
      (buyer_tid, 'Lead Based Paint',               'Critical Date', 'days_after_contract', 5,  'Both', 'Me', b_sort + 5),
      (buyer_tid, 'Affidavit of Disclosure',        'Critical Date', 'days_after_contract', 5,  'Both', 'Me', b_sort + 6),
      (buyer_tid, 'Loan Status Update',             'Critical Date', 'days_after_contract', 10, 'Both', 'Me', b_sort + 7),
      (buyer_tid, 'HOA Disclosures',                'Critical Date', 'days_after_contract', 10, 'Both', 'Me', b_sort + 8),
      (buyer_tid, 'Septic Inspection',              'Critical Date', 'days_after_contract', 20, 'Both', 'Me', b_sort + 9),
      (buyer_tid, 'Seller Response to BINSR',       'Critical Date', 'days_after_binsr',    5,  'Both', 'Me', b_sort + 10),
      (buyer_tid, 'Upload Commission Instructions', 'Critical Date', 'days_before_coe',     10, 'Both', 'Me', b_sort + 11),
      (buyer_tid, 'Loan Approval',                  'Critical Date', 'days_before_coe',     3,  'Both', 'Me', b_sort + 12),
      (buyer_tid, 'Seller Repairs Completed',       'Critical Date', 'days_before_coe',     3,  'Both', 'Me', b_sort + 13);

    RAISE NOTICE 'Inserted 14 Critical Date tasks into buyer template: %', buyer_tid;
  ELSE
    RAISE WARNING 'Buyer pending template not found — check template name contains "buyer" and "pending"';
  END IF;

  -- ── Seller Residential — Pending ─────────────────────────────────────────
  IF seller_tid IS NOT NULL THEN
    SELECT COALESCE(MAX(sort_order), -1) + 1 INTO s_sort
      FROM template_tasks WHERE template_id = seller_tid;

    INSERT INTO template_tasks
      (template_id, title, task_type, timing_type, timing_days, applies_to, auto_assign_to, sort_order)
    VALUES
      (seller_tid, 'SPDS Due',                      'Critical Date', 'days_after_contract', 3,  'Both', 'Me', s_sort),
      (seller_tid, 'Solar System Documents',         'Critical Date', 'days_after_contract', 3,  'Both', 'Me', s_sort + 1),
      (seller_tid, 'IHR Due',                        'Critical Date', 'days_after_contract', 5,  'Both', 'Me', s_sort + 2),
      (seller_tid, 'DWWA SPDS',                      'Critical Date', 'days_after_contract', 5,  'Both', 'Me', s_sort + 3),
      (seller_tid, 'Well Registration (ADWR)',        'Critical Date', 'days_after_contract', 5,  'Both', 'Me', s_sort + 4),
      (seller_tid, 'Lead Based Paint',               'Critical Date', 'days_after_contract', 5,  'Both', 'Me', s_sort + 5),
      (seller_tid, 'Affidavit of Disclosure',        'Critical Date', 'days_after_contract', 5,  'Both', 'Me', s_sort + 6),
      (seller_tid, 'Loan Status Update',             'Critical Date', 'days_after_contract', 10, 'Both', 'Me', s_sort + 7),
      (seller_tid, 'HOA Disclosures',                'Critical Date', 'days_after_contract', 10, 'Both', 'Me', s_sort + 8),
      (seller_tid, 'Septic Inspection',              'Critical Date', 'days_after_contract', 20, 'Both', 'Me', s_sort + 9),
      (seller_tid, 'Seller Response to BINSR',       'Critical Date', 'days_after_binsr',    5,  'Both', 'Me', s_sort + 10),
      (seller_tid, 'Upload Commission Instructions', 'Critical Date', 'days_before_coe',     10, 'Both', 'Me', s_sort + 11),
      (seller_tid, 'Seller Repairs Completed',       'Critical Date', 'days_before_coe',     3,  'Both', 'Me', s_sort + 12);

    RAISE NOTICE 'Inserted 13 Critical Date tasks into seller template: %', seller_tid;
  ELSE
    RAISE WARNING 'Seller pending template not found — check template name contains "seller" and "pending"';
  END IF;
END $$;
