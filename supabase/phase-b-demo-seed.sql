-- ============================================================================
-- Phase B: Demo Account Seed Data
-- ============================================================================
-- Target user: sarah.mitchell.legacy@gmail.com
-- auth.users.id: 63578549-0148-49fc-bc4d-59328f047429
--
-- Run via: Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- This script is:
--   • ATOMIC      — wrapped in BEGIN/COMMIT
--   • IDEMPOTENT  — deletes existing demo data first, then re-inserts
--   • SERVICE-ROLE only — the SQL editor bypasses RLS, which is necessary
--     because the inserts are FOR a different user than the caller.
--
-- All dates are relative to NOW() / CURRENT_DATE so the demo always looks
-- current. Date-typed columns get explicit ::date casts.
--
-- Out of scope (tables that don't exist on this project, per Phase A audit):
--   • user_settings
--   • notify_snapshots
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1 — Clean slate
-- ────────────────────────────────────────────────────────────────────────────
-- Delete in reverse dependency order. FKs from tasks/notes/etc → transactions,
-- and template_tasks → task_templates, must be cleared before the parents.

DELETE FROM public.transaction_history WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429';
DELETE FROM public.task_comments       WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429';
DELETE FROM public.transaction_notes   WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429';
DELETE FROM public.showings            WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429';
DELETE FROM public.document_uploads    WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429';
DELETE FROM public.email_sent_log      WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429';
DELETE FROM public.email_queue         WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429';
DELETE FROM public.tasks               WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429';
DELETE FROM public.commissions         WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429';
DELETE FROM public.transactions        WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429';
DELETE FROM public.template_tasks      WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429';
DELETE FROM public.task_templates      WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429';
DELETE FROM public.email_templates     WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429';
DELETE FROM public.collaborators       WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429';
DELETE FROM public.saved_filters       WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429';
DELETE FROM public.vendors             WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429';
DELETE FROM public.tc_settings         WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429';
DELETE FROM public.agent_settings      WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429';
DELETE FROM public.google_auth         WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429';


-- ────────────────────────────────────────────────────────────────────────────
-- Step 2 — Seed (single PL/pgSQL block with cross-referenced UUIDs)
-- ────────────────────────────────────────────────────────────────────────────

DO $seed$
DECLARE
  -- Demo account
  v_user_id uuid := '63578549-0148-49fc-bc4d-59328f047429';

  -- Transaction IDs (in spec order)
  v_tx_01 uuid := gen_random_uuid();  -- Copper Ridge        (pre-listing)
  v_tx_02 uuid := gen_random_uuid();  -- Saguaro Vista       (pre-listing)
  v_tx_03 uuid := gen_random_uuid();  -- Sunset Bluff        (pre-listing)
  v_tx_04 uuid := gen_random_uuid();  -- Ironwood Trail      (active)
  v_tx_05 uuid := gen_random_uuid();  -- Desert Willow       (active)
  v_tx_06 uuid := gen_random_uuid();  -- Red Hawk Mesa       (active)
  v_tx_07 uuid := gen_random_uuid();  -- Palo Verde          (active)
  v_tx_08 uuid := gen_random_uuid();  -- Canyon Rim          (pending buyer)
  v_tx_09 uuid := gen_random_uuid();  -- Quail Hollow        (pending buyer)
  v_tx_10 uuid := gen_random_uuid();  -- Juniper Springs     (pending seller)
  v_tx_11 uuid := gen_random_uuid();  -- Ridgeline           (pending buyer)
  v_tx_12 uuid := gen_random_uuid();  -- Crestview           (pending dual)
  v_tx_13 uuid := gen_random_uuid();  -- Mesquite Flats      (pending buyer)
  v_tx_14 uuid := gen_random_uuid();  -- Pinyon Creek        (pending seller)
  v_tx_15 uuid := gen_random_uuid();  -- Sandstone Loop      (closed buyer)
  v_tx_16 uuid := gen_random_uuid();  -- Amber Creek         (closed seller)
  v_tx_17 uuid := gen_random_uuid();  -- Hawk Ridge          (closed buyer)
  v_tx_18 uuid := gen_random_uuid();  -- Chaparral           (closed seller)
  v_tx_19 uuid := gen_random_uuid();  -- Ocotillo            (expired)
  v_tx_20 uuid := gen_random_uuid();  -- Barrel Cactus       (cancelled)

  -- Task template IDs
  v_tpl_prelist     uuid := gen_random_uuid();
  v_tpl_buy_pending uuid := gen_random_uuid();
  v_tpl_sell_pending uuid := gen_random_uuid();

  -- Parent note IDs (need explicit IDs because replies reference them)
  v_note_tx08_p uuid := gen_random_uuid();
  v_note_tx10_p uuid := gen_random_uuid();
  v_note_tx13_p uuid := gen_random_uuid();
BEGIN

  -- ── 2a. Agent settings ─────────────────────────────────────────────────
  INSERT INTO public.agent_settings (
    id, user_id, realtor_name, company, realtor_phone, realtor_email,
    goal_gci, goal_units, goal_volume, goal_avg_price
  ) VALUES (
    gen_random_uuid(), v_user_id,
    'Sarah Mitchell', 'Pinnacle Real Estate Group', '(602) 555-0147', 'sarah@pinnacle-realty.com',
    240000, 40, 16000000, 400000
  );


  -- ── 2b. TC settings ────────────────────────────────────────────────────
  INSERT INTO public.tc_settings (id, user_id, name, email) VALUES
    (gen_random_uuid(), v_user_id, 'Rachel Torres', 'rachel@pinnacle-realty.com'),
    (gen_random_uuid(), v_user_id, 'Megan Cole',    'megan@pinnacle-realty.com');


  -- ── 2c. Collaborators ──────────────────────────────────────────────────
  INSERT INTO public.collaborators (id, user_id, category, first_name, last_name, company, email, phone) VALUES
    -- Title / Escrow
    (gen_random_uuid(), v_user_id, 'title-escrow',    'Jennifer', 'Walsh',   'Pioneer Title Agency',     'jennifer@pioneertitle.com',  '(602) 555-0201'),
    (gen_random_uuid(), v_user_id, 'title-escrow',    'Marcus',   'Rivera',  'Fidelity National Title',  'marcus@fidelitytitle.com',   '(480) 555-0302'),
    (gen_random_uuid(), v_user_id, 'title-escrow',    'Lisa',     'Chang',   'Chicago Title',            'lisa.chang@chicagotitle.com','(623) 555-0403'),
    -- Lenders
    (gen_random_uuid(), v_user_id, 'lenders',         'Robert',   'Kimball', 'CrossCountry Mortgage',    'robert.kimball@ccm.com',     '(602) 555-0501'),
    (gen_random_uuid(), v_user_id, 'lenders',         'Diana',    'Patel',   'Guild Mortgage',           'diana.patel@guildmortgage.com','(480) 555-0602'),
    -- Inspectors
    (gen_random_uuid(), v_user_id, 'home-inspectors', 'Frank',    'Dawson',  'Desert Home Inspections',  'frank@deserthomeinspect.com', '(602) 555-0701'),
    (gen_random_uuid(), v_user_id, 'home-inspectors', 'Tony',     'Reyes',   'Cactus State Inspections', 'tony@cactustateinspect.com',  '(623) 555-0802'),
    -- Co-op Agents
    (gen_random_uuid(), v_user_id, 'coop-agents',     'Karen',    'Liu',         'Realty ONE Group',  'karen.liu@realtyonegroup.com',     '(480) 555-0901'),
    (gen_random_uuid(), v_user_id, 'coop-agents',     'James',    'Whitaker',    'Coldwell Banker',   'james.whitaker@coldwellbanker.com','(602) 555-1001'),
    (gen_random_uuid(), v_user_id, 'coop-agents',     'Nina',     'Alvarez',     'eXp Realty',        'nina.alvarez@exprealty.com',       '(623) 555-1101'),
    (gen_random_uuid(), v_user_id, 'coop-agents',     'Derek',    'Hanson',      'HomeSmart',         'derek.hanson@homesmart.com',       '(480) 555-1201');


  -- ── 2d. Email templates ────────────────────────────────────────────────
  -- jsonb cc/recipients/cc_recipients fields left NULL — spec didn't populate.
  INSERT INTO public.email_templates (id, user_id, name, subject, body, trigger, applies_to) VALUES
    (
      gen_random_uuid(), v_user_id,
      'Listing Live — Seller Welcome',
      'Your home is officially on the market — {{property_address}}',
      E'Hi {{client_first_name}},\n\nGreat news — your home is now live on the MLS!\n\nI will keep you updated on showing activity. Our next milestone is the first weekend of showings.\n\nDon''t hesitate to reach out with any questions.\n\nBest,\n{{agent_name}}',
      'manual', 'Seller'
    ),
    (
      gen_random_uuid(), v_user_id,
      'Under Contract — Client Congratulations',
      'Congratulations — you are under contract on {{property_address}}!',
      E'Hi {{client_first_name}},\n\nWe did it! Your offer has been accepted and we are officially under contract.\n\nHere are your key upcoming dates:\n- Inspection Period Ends: {{ipe_date}}\n- Target Close: {{close_of_escrow}}\n\nMy transaction coordinator {{tc_name}} will be reaching out shortly.\n\nSo excited for you!\n\n{{agent_name}}',
      'manual', 'Both'
    ),
    (
      gen_random_uuid(), v_user_id,
      'TC Introduction',
      'New Transaction — {{property_address}} — Action Needed',
      E'Hi {{tc_name}},\n\nWe have a new transaction!\n\nProperty: {{property_address}}\nClient: {{client_first_name}} {{client_last_name}}\nClosing Date: {{close_of_escrow}}\n\nPlease begin your standard under-contract checklist.\n\nThank you,\n{{agent_name}}',
      'manual', 'Both'
    ),
    (
      gen_random_uuid(), v_user_id,
      'Closing Reminder — 1 Week Out',
      'Closing in one week — {{property_address}}',
      E'Hi {{client_first_name}},\n\nJust a reminder that we are one week away from closing on {{property_address}}!\n\nPlease make sure to:\n- Complete your final walkthrough\n- Confirm wire transfer details with the title company\n- Bring a valid photo ID to closing\n\nLet me know if you have any questions.\n\n{{agent_name}}',
      'manual', 'Both'
    ),
    (
      gen_random_uuid(), v_user_id,
      'Price Reduction Notice',
      'Price update on {{property_address}}',
      E'Hi {{client_first_name}},\n\nAs we discussed, I have updated the listing price on {{property_address}}.\n\nThis adjustment should help us generate more showing activity. I will keep you updated on any new interest.\n\nBest,\n{{agent_name}}',
      'manual', 'Seller'
    ),
    (
      gen_random_uuid(), v_user_id,
      'Appraisal Scheduled',
      'Appraisal scheduled for {{property_address}}',
      E'Hi {{client_first_name}},\n\nThe appraisal for {{property_address}} has been scheduled.\n\nDate: {{appraisal_date}}\n\nI will follow up once we receive the appraisal report.\n\nBest,\n{{agent_name}}',
      'manual', 'Both'
    );


  -- ── 2e. Task templates ─────────────────────────────────────────────────
  INSERT INTO public.task_templates (id, user_id, name, stage, rep_type, sort_order) VALUES
    (v_tpl_prelist,      v_user_id, 'Seller Residential — Pre-Listing',     'pre-listing', 'Seller', 1),
    (v_tpl_buy_pending,  v_user_id, 'Buyer Residential — Pending to Close', 'pending',     'Buyer',  2),
    (v_tpl_sell_pending, v_user_id, 'Seller Residential — Pending to Close','pending',     'Seller', 3);


  -- ── 2f. Template tasks ─────────────────────────────────────────────────
  -- Template 1: Pre-Listing (Seller)
  INSERT INTO public.template_tasks (id, user_id, template_id, sort_order, title, timing_type, auto_assign_to, has_progress_tracking, task_type) VALUES
    (gen_random_uuid(), v_user_id, v_tpl_prelist, 1, 'Sign listing agreement',     'at_stage_change', 'Sarah Mitchell', false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tpl_prelist, 2, 'Schedule photography',       'at_stage_change', 'Sarah Mitchell', false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tpl_prelist, 3, 'Order yard sign',            'at_stage_change', 'Rachel Torres',  true,  'Task'),
    (gen_random_uuid(), v_user_id, v_tpl_prelist, 4, 'Prepare MLS input sheet',    'at_stage_change', 'Rachel Torres',  false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tpl_prelist, 5, 'Collect seller disclosures', 'at_stage_change', 'Sarah Mitchell', false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tpl_prelist, 6, 'Install lockbox',            'at_stage_change', 'Sarah Mitchell', false, 'Task');

  -- Template 2: Pending → Close (Buyer)
  INSERT INTO public.template_tasks (id, user_id, template_id, sort_order, title, timing_type, auto_assign_to, has_progress_tracking, task_type) VALUES
    (gen_random_uuid(), v_user_id, v_tpl_buy_pending,  1, 'Send UC congratulations email',  'at_stage_change', 'Sarah Mitchell', false, 'Email'),
    (gen_random_uuid(), v_user_id, v_tpl_buy_pending,  2, 'Send TC introduction email',     'at_stage_change', 'Rachel Torres',  false, 'Email'),
    (gen_random_uuid(), v_user_id, v_tpl_buy_pending,  3, 'Open escrow with title company', 'at_stage_change', 'Megan Cole',     false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tpl_buy_pending,  4, 'Schedule home inspection',       'at_stage_change', 'Megan Cole',     true,  'Task'),
    (gen_random_uuid(), v_user_id, v_tpl_buy_pending,  5, 'Order appraisal',                'at_stage_change', 'Megan Cole',     true,  'Task'),
    (gen_random_uuid(), v_user_id, v_tpl_buy_pending,  6, 'Submit earnest money',           'at_stage_change', 'Megan Cole',     false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tpl_buy_pending,  7, 'Review inspection report',       'at_stage_change', 'Sarah Mitchell', false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tpl_buy_pending,  8, 'Submit BINSR',                   'at_stage_change', 'Sarah Mitchell', false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tpl_buy_pending,  9, 'Confirm loan approval',          'at_stage_change', 'Megan Cole',     false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tpl_buy_pending, 10, 'Schedule final walkthrough',     'at_stage_change', 'Sarah Mitchell', false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tpl_buy_pending, 11, 'Confirm closing date and time',  'at_stage_change', 'Megan Cole',     false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tpl_buy_pending, 12, 'Send closing reminder email',    'at_stage_change', 'Sarah Mitchell', false, 'Email');

  -- Template 3: Pending → Close (Seller)
  INSERT INTO public.template_tasks (id, user_id, template_id, sort_order, title, timing_type, auto_assign_to, has_progress_tracking, task_type) VALUES
    (gen_random_uuid(), v_user_id, v_tpl_sell_pending,  1, 'Send UC congratulations email',   'at_stage_change', 'Sarah Mitchell', false, 'Email'),
    (gen_random_uuid(), v_user_id, v_tpl_sell_pending,  2, 'Send TC introduction email',      'at_stage_change', 'Rachel Torres',  false, 'Email'),
    (gen_random_uuid(), v_user_id, v_tpl_sell_pending,  3, 'Open escrow with title company',  'at_stage_change', 'Rachel Torres',  false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tpl_sell_pending,  4, 'Collect HOA documents',           'at_stage_change', 'Rachel Torres',  false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tpl_sell_pending,  5, 'Review buyer inspection report',  'at_stage_change', 'Sarah Mitchell', false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tpl_sell_pending,  6, 'Respond to BINSR',                'at_stage_change', 'Sarah Mitchell', false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tpl_sell_pending,  7, 'Confirm appraisal completed',     'at_stage_change', 'Rachel Torres',  true,  'Task'),
    (gen_random_uuid(), v_user_id, v_tpl_sell_pending,  8, 'Schedule sign removal',           'at_stage_change', 'Rachel Torres',  true,  'Task'),
    (gen_random_uuid(), v_user_id, v_tpl_sell_pending,  9, 'Remove lockbox',                  'at_stage_change', 'Sarah Mitchell', false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tpl_sell_pending, 10, 'Confirm closing date and time',   'at_stage_change', 'Rachel Torres',  false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tpl_sell_pending, 11, 'Send closing reminder email',     'at_stage_change', 'Sarah Mitchell', false, 'Email');


  -- ── 2g. Transactions (20) ──────────────────────────────────────────────
  -- Dates use CURRENT_DATE +/- INTERVAL for date columns.

  -- Pre-listing (1-3)
  INSERT INTO public.transactions (
    id, user_id, property_address, city, state, zip,
    client_first_name, client_last_name, client2_first_name, client2_last_name,
    client_email, client_phone,
    status, rep_type, assigned_tc, price,
    listing_contract, listing_expiration_date, photography_date,
    property_type, bedrooms, bathrooms, year_built, square_ft, has_sign, lockbox
  ) VALUES
    (v_tx_01, v_user_id, '4821 Copper Ridge Dr', 'Scottsdale', 'AZ', '85255',
     'David', 'Thornton', 'Lisa', 'Thornton', 'david.thornton@email.com', '(602) 555-2001',
     'pre-listing', 'Seller', 'Rachel Torres', 485000,
     (CURRENT_DATE - INTERVAL '7 days')::date, (CURRENT_DATE + INTERVAL '173 days')::date, (CURRENT_DATE + INTERVAL '3 days')::date,
     'Single Family', 4, '3', '2004', 2850, false, NULL),
    (v_tx_02, v_user_id, '910 Saguaro Vista Ln', 'Mesa', 'AZ', '85207',
     'Maria', 'Espinoza', NULL, NULL, 'maria.espinoza@email.com', '(480) 555-2002',
     'pre-listing', 'Seller', 'Rachel Torres', 329000,
     (CURRENT_DATE - INTERVAL '2 days')::date, (CURRENT_DATE + INTERVAL '178 days')::date, NULL,
     'Single Family', 3, '2', '1998', 1750, false, NULL),
    (v_tx_03, v_user_id, '7244 Sunset Bluff Ct', 'Paradise Valley', 'AZ', '85253',
     'Robert', 'Haines', NULL, NULL, 'robert.haines@email.com', '(602) 555-2003',
     'pre-listing', 'Seller', 'Rachel Torres', 612000,
     (CURRENT_DATE - INTERVAL '10 days')::date, (CURRENT_DATE + INTERVAL '170 days')::date, NULL,
     'Single Family', 5, '4', '2015', 3800, true, 'Supra BT LE');

  -- Active (4-7)
  INSERT INTO public.transactions (
    id, user_id, property_address, city, state, zip,
    client_first_name, client_last_name, client2_first_name, client2_last_name,
    client_email, client_phone,
    status, rep_type, assigned_tc, price,
    listing_contract, listing_expiration_date, target_live_date,
    has_sign, lockbox, mls_number,
    property_type, bedrooms, bathrooms, year_built, square_ft, has_lbp
  ) VALUES
    (v_tx_04, v_user_id, '1530 Ironwood Trail', 'Gilbert', 'AZ', '85297',
     'Patricia', 'Keller', 'James', 'Keller', 'pat.keller@email.com', '(480) 555-2004',
     'active-listing', 'Seller', 'Rachel Torres', 359000,
     (CURRENT_DATE - INTERVAL '52 days')::date, (CURRENT_DATE + INTERVAL '128 days')::date, (CURRENT_DATE - INTERVAL '45 days')::date,
     true, 'Supra BT LE', 'MLS-2026-4401',
     'Single Family', 3, '2.5', '2001', 2100, false),
    (v_tx_05, v_user_id, '228 Desert Willow Ave', 'Chandler', 'AZ', '85249',
     'Sandra', 'Nguyen', NULL, NULL, 'sandra.nguyen@email.com', '(480) 555-2005',
     'active-listing', 'Seller', 'Rachel Torres', 289000,
     (CURRENT_DATE - INTERVAL '14 days')::date, (CURRENT_DATE + INTERVAL '166 days')::date, (CURRENT_DATE - INTERVAL '5 days')::date,
     true, 'Supra BT LE', 'MLS-2026-4502',
     'Townhouse', 2, '2', '2010', 1400, false),
    (v_tx_06, v_user_id, '6602 Red Hawk Mesa Dr', 'Fountain Hills', 'AZ', '85268',
     'Tom', 'Bryant', 'Angela', 'Bryant', 'tom.bryant@email.com', '(480) 555-2006',
     'active-listing', 'Seller', 'Rachel Torres', 549000,
     (CURRENT_DATE - INTERVAL '30 days')::date, (CURRENT_DATE + INTERVAL '150 days')::date, (CURRENT_DATE - INTERVAL '25 days')::date,
     true, 'Supra BT LE', 'MLS-2026-4603',
     'Single Family', 4, '3.5', '2018', 3200, false),
    (v_tx_07, v_user_id, '3317 Palo Verde Pkwy', 'Tempe', 'AZ', '85284',
     'Michael', 'Reeves', NULL, NULL, 'michael.reeves@email.com', '(602) 555-2007',
     'active-listing', 'Seller', 'Rachel Torres', 410000,
     (CURRENT_DATE - INTERVAL '25 days')::date, (CURRENT_DATE + INTERVAL '155 days')::date, (CURRENT_DATE - INTERVAL '20 days')::date,
     true, 'Supra BT LE', 'MLS-2026-4704',
     'Single Family', 4, '2.5', '1995', 2350, true);

  -- Pending (8-14)
  INSERT INTO public.transactions (
    id, user_id, property_address, city, state, zip,
    client_first_name, client_last_name, client2_first_name, client2_last_name,
    client_email, client_phone,
    status, rep_type, assigned_tc, price, contract_price,
    contract_acceptance_date, close_of_escrow, ipe_date,
    home_inspection_date, appraisal_date, nda_expires,
    financing_type, lender_name, lender_email,
    title_company, title_contact_name, title_company_email,
    co_op_agent, co_op_agent_email, opposite_party_name,
    property_type, bedrooms, bathrooms, year_built, square_ft, has_hoa, has_lbp, notes
  ) VALUES
    (v_tx_08, v_user_id, '5540 Canyon Rim Rd', 'Scottsdale', 'AZ', '85262',
     'Jessica', 'Torres', 'Brian', 'Torres', 'jessica.torres@email.com', '(480) 555-2008',
     'pending', 'Buyer', 'Megan Cole', 365000, 365000,
     (CURRENT_DATE - INTERVAL '18 days')::date, (CURRENT_DATE + INTERVAL '22 days')::date, (CURRENT_DATE - INTERVAL '8 days')::date,
     (CURRENT_DATE - INTERVAL '12 days')::date, (CURRENT_DATE - INTERVAL '5 days')::date, NULL,
     'Conventional', 'Robert Kimball', 'robert.kimball@ccm.com',
     'Pioneer Title Agency', 'Jennifer Walsh', 'jennifer@pioneertitle.com',
     'Karen Liu', 'karen.liu@realtyonegroup.com', NULL,
     'Single Family', 3, '2.5', '2008', 2200, false, false, NULL),
    (v_tx_09, v_user_id, '1204 Quail Hollow Ln', 'Peoria', 'AZ', '85383',
     'Amanda', 'Chen', NULL, NULL, 'amanda.chen@email.com', '(623) 555-2009',
     'pending', 'Buyer', 'Megan Cole', 298000, 298000,
     (CURRENT_DATE - INTERVAL '5 days')::date, (CURRENT_DATE + INTERVAL '35 days')::date, (CURRENT_DATE + INTERVAL '5 days')::date,
     (CURRENT_DATE + INTERVAL '2 days')::date, NULL, NULL,
     'FHA', 'Diana Patel', 'diana.patel@guildmortgage.com',
     'Fidelity National Title', 'Marcus Rivera', 'marcus@fidelitytitle.com',
     'James Whitaker', 'james.whitaker@coldwellbanker.com', NULL,
     'Single Family', 3, '2', '2002', 1650, false, false, NULL),
    (v_tx_10, v_user_id, '8815 Juniper Springs Way', 'Cave Creek', 'AZ', '85331',
     'Kevin', 'Marshall', 'Diane', 'Marshall', 'kevin.marshall@email.com', '(480) 555-2010',
     'pending', 'Seller', 'Rachel Torres', 425000, 418000,
     (CURRENT_DATE - INTERVAL '25 days')::date, (CURRENT_DATE + INTERVAL '5 days')::date, (CURRENT_DATE - INTERVAL '15 days')::date,
     NULL, NULL, (CURRENT_DATE + INTERVAL '3 days')::date,
     'Conventional', 'Robert Kimball', NULL,
     'Pioneer Title Agency', 'Jennifer Walsh', 'jennifer@pioneertitle.com',
     'Nina Alvarez', 'nina.alvarez@exprealty.com', NULL,
     'Single Family', 3, '2.5', '2006', 2400, true, false, NULL),
    (v_tx_11, v_user_id, '442 Ridgeline Blvd', 'Goodyear', 'AZ', '85395',
     'Chris', 'Morales', NULL, NULL, 'chris.morales@email.com', '(623) 555-2011',
     'pending', 'Buyer', 'Megan Cole', 515000, 510000,
     (CURRENT_DATE - INTERVAL '30 days')::date, (CURRENT_DATE + INTERVAL '10 days')::date, (CURRENT_DATE - INTERVAL '20 days')::date,
     NULL, (CURRENT_DATE - INTERVAL '10 days')::date, NULL,
     'Conventional', 'Diana Patel', 'diana.patel@guildmortgage.com',
     'Chicago Title', 'Lisa Chang', 'lisa.chang@chicagotitle.com',
     'Derek Hanson', 'derek.hanson@homesmart.com', NULL,
     'Single Family', 5, '3.5', '2020', 3500, false, false, NULL),
    (v_tx_12, v_user_id, '7100 Crestview Terrace', 'Scottsdale', 'AZ', '85260',
     'Nathan', 'Parker', 'Emily', 'Parker', 'nathan.parker@email.com', '(480) 555-2012',
     'pending', 'Dual', 'Rachel Torres', 470000, 465000,
     (CURRENT_DATE - INTERVAL '14 days')::date, (CURRENT_DATE + INTERVAL '26 days')::date, (CURRENT_DATE - INTERVAL '4 days')::date,
     (CURRENT_DATE - INTERVAL '7 days')::date, NULL, NULL,
     'Conventional', 'Robert Kimball', 'robert.kimball@ccm.com',
     'Pioneer Title Agency', 'Jennifer Walsh', 'jennifer@pioneertitle.com',
     NULL, NULL, 'Nathan & Emily Parker',
     'Single Family', 4, '3', '2012', 2800, false, false, NULL),
    (v_tx_13, v_user_id, '2956 Mesquite Flats Dr', 'Queen Creek', 'AZ', '85142',
     'Sarah', 'Whitfield', NULL, NULL, 'sarah.whitfield@email.com', '(480) 555-2013',
     'pending', 'Buyer', 'Megan Cole', 340000, 332000,
     (CURRENT_DATE - INTERVAL '20 days')::date, (CURRENT_DATE + INTERVAL '20 days')::date, (CURRENT_DATE - INTERVAL '10 days')::date,
     NULL, (CURRENT_DATE - INTERVAL '3 days')::date, NULL,
     'VA', 'Robert Kimball', 'robert.kimball@ccm.com',
     'Fidelity National Title', 'Marcus Rivera', 'marcus@fidelitytitle.com',
     'Karen Liu', 'karen.liu@realtyonegroup.com', NULL,
     'Single Family', 3, '2', '2019', 1900, false, false,
     'Appraisal came in at $332,000 — negotiated price reduction from $340,000. Seller agreed.'),
    (v_tx_14, v_user_id, '1688 Pinyon Creek Ct', 'Glendale', 'AZ', '85308',
     'Dennis', 'Hoffman', 'Ruth', 'Hoffman', 'dennis.hoffman@email.com', '(623) 555-2014',
     'pending', 'Seller', 'Rachel Torres', 389000, 385000,
     (CURRENT_DATE - INTERVAL '32 days')::date, (CURRENT_DATE + INTERVAL '3 days')::date, (CURRENT_DATE - INTERVAL '22 days')::date,
     NULL, (CURRENT_DATE - INTERVAL '15 days')::date, NULL,
     'Conventional', 'Diana Patel', NULL,
     'Chicago Title', 'Lisa Chang', 'lisa.chang@chicagotitle.com',
     'James Whitaker', 'james.whitaker@coldwellbanker.com', NULL,
     'Single Family', 3, '2', '1992', 1800, false, true, NULL);

  -- Closed (15-18)
  INSERT INTO public.transactions (
    id, user_id, property_address, city, state, zip,
    client_first_name, client_last_name, client2_first_name, client2_last_name,
    client_email, client_phone,
    status, rep_type, assigned_tc, price, contract_price,
    contract_acceptance_date, close_of_escrow,
    property_type, bedrooms, bathrooms, year_built, square_ft
  ) VALUES
    (v_tx_15, v_user_id, '3021 Sandstone Loop', 'Gilbert', 'AZ', '85296',
     'Mark', 'Andersen', 'Julie', 'Andersen', 'mark.andersen@email.com', '(480) 555-2015',
     'closed', 'Buyer', 'Megan Cole', 355000, 355000,
     (CURRENT_DATE - INTERVAL '65 days')::date, (CURRENT_DATE - INTERVAL '25 days')::date,
     'Single Family', 4, '2.5', '2005', 2300),
    (v_tx_16, v_user_id, '5509 Amber Creek Dr', 'Chandler', 'AZ', '85248',
     'Laura', 'Simmons', NULL, NULL, 'laura.simmons@email.com', '(480) 555-2016',
     'closed', 'Seller', 'Rachel Torres', 415000, 410000,
     (CURRENT_DATE - INTERVAL '75 days')::date, (CURRENT_DATE - INTERVAL '35 days')::date,
     'Single Family', 4, '3', '2011', 2650),
    (v_tx_17, v_user_id, '9230 Hawk Ridge Pl', 'Surprise', 'AZ', '85388',
     'Daniel', 'Watkins', 'Amy', 'Watkins', 'daniel.watkins@email.com', '(623) 555-2017',
     'closed', 'Buyer', 'Megan Cole', 278000, 278000,
     (CURRENT_DATE - INTERVAL '90 days')::date, (CURRENT_DATE - INTERVAL '50 days')::date,
     'Single Family', 3, '2', '1999', 1550),
    (v_tx_18, v_user_id, '620 Chaparral Way', 'Carefree', 'AZ', '85377',
     'Steve', 'Nakamura', NULL, NULL, 'steve.nakamura@email.com', '(480) 555-2018',
     'closed', 'Seller', 'Rachel Torres', 490000, 485000,
     (CURRENT_DATE - INTERVAL '80 days')::date, (CURRENT_DATE - INTERVAL '40 days')::date,
     'Single Family', 5, '3.5', '2016', 3400);

  -- Cancelled / Expired (19-20)
  INSERT INTO public.transactions (
    id, user_id, property_address, city, state, zip,
    client_first_name, client_last_name, client2_first_name, client2_last_name,
    client_email, client_phone,
    status, rep_type, assigned_tc, price, contract_price,
    listing_contract, listing_expiration_date, contract_acceptance_date,
    financing_type, notes,
    property_type, bedrooms, bathrooms, year_built, square_ft
  ) VALUES
    (v_tx_19, v_user_id, '4405 Ocotillo Rd', 'Phoenix', 'AZ', '85018',
     'Karen', 'Phillips', NULL, NULL, 'karen.phillips@email.com', '(602) 555-2019',
     'cancelled-expired', 'Seller', 'Rachel Torres', 399000, NULL,
     (CURRENT_DATE - INTERVAL '190 days')::date, (CURRENT_DATE - INTERVAL '10 days')::date, NULL,
     NULL,
     'Listing expired after 180 days. No offers received. Seller decided not to relist at this time.',
     'Single Family', 3, '2', '1988', 1650),
    (v_tx_20, v_user_id, '1122 Barrel Cactus Ln', 'Buckeye', 'AZ', '85396',
     'Troy', 'Dixon', 'Janet', 'Dixon', 'troy.dixon@email.com', '(623) 555-2020',
     'cancelled-expired', 'Buyer', 'Megan Cole', 310000, 310000,
     NULL, NULL, (CURRENT_DATE - INTERVAL '60 days')::date,
     'FHA',
     'Cancelled — buyer financing fell through. Lender denied final approval due to employment change during escrow.',
     'Single Family', 4, '2.5', '2021', 2100);


  -- ── 2h. Commissions (one per transaction) ──────────────────────────────
  INSERT INTO public.commissions (
    id, user_id, transaction_id, commission_status, tc_fee,
    seller_concession_percent, seller_concession_flat,
    buyer_contribution_percent, buyer_contribution_flat
  ) VALUES
    -- Pre-listing & active: pending, minimal data
    (gen_random_uuid(), v_user_id, v_tx_01, 'Pending', 350, NULL, NULL, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_tx_02, 'Pending', 350, NULL, NULL, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_tx_03, 'Pending', 350, NULL, NULL, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_tx_04, 'Pending', 350, NULL, NULL, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_tx_05, 'Pending', 350, NULL, NULL, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_tx_06, 'Pending', 350, NULL, NULL, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_tx_07, 'Pending', 350, NULL, NULL, NULL, NULL),

    -- Pending (8-14): detailed concession/contribution data
    (gen_random_uuid(), v_user_id, v_tx_08, 'Pending', 350, 3,   NULL, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_tx_09, 'Pending', 350, NULL, NULL, 2.5,  500),
    (gen_random_uuid(), v_user_id, v_tx_10, 'Pending', 350, 3,   NULL, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_tx_11, 'Pending', 350, 2.5, NULL, NULL, 1000),
    (gen_random_uuid(), v_user_id, v_tx_12, 'Pending', 350, 3,   NULL, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_tx_13, 'Pending', 350, NULL, NULL, 3,    NULL),
    (gen_random_uuid(), v_user_id, v_tx_14, 'Pending', 350, 3,   NULL, NULL, NULL),

    -- Closed (15-18): received
    (gen_random_uuid(), v_user_id, v_tx_15, 'Received', 350, 3,    NULL, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_tx_16, 'Received', 350, 3,    NULL, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_tx_17, 'Received', 350, NULL, NULL, 2.5,  500),
    (gen_random_uuid(), v_user_id, v_tx_18, 'Received', 350, 3,    NULL, NULL, NULL),

    -- Cancelled / expired
    (gen_random_uuid(), v_user_id, v_tx_19, 'Pending', 350, NULL, NULL, NULL, NULL),
    (gen_random_uuid(), v_user_id, v_tx_20, 'Pending', 350, NULL, NULL, NULL, NULL);


  -- ── 2i. Tasks ──────────────────────────────────────────────────────────
  -- For each transaction we instantiate the appropriate stage template's tasks
  -- with realistic completion state per the spec. Tasks marked complete get
  -- status='complete' + completed_at set to a date relative to the timeline.
  -- A handful are intentionally overdue (due_date < CURRENT_DATE, status='open')
  -- to drive urgency indicators on the board.

  -- TX 1 (Copper Ridge, pre-listing): 3/6 complete
  INSERT INTO public.tasks (id, user_id, transaction_id, title, assigned_to, status, sort_order, template_key, completed_at, due_date, has_progress_tracking, task_type) VALUES
    (gen_random_uuid(), v_user_id, v_tx_01, 'Sign listing agreement',     'Sarah Mitchell', 'complete', 1, v_tpl_prelist::text, NOW() - INTERVAL '7 days',  NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_01, 'Schedule photography',       'Sarah Mitchell', 'complete', 2, v_tpl_prelist::text, NOW() - INTERVAL '5 days',  NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_01, 'Order yard sign',            'Rachel Torres',  'open',     3, v_tpl_prelist::text, NULL, (CURRENT_DATE + INTERVAL '2 days')::date,  true, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_01, 'Prepare MLS input sheet',    'Rachel Torres',  'open',     4, v_tpl_prelist::text, NULL, (CURRENT_DATE + INTERVAL '3 days')::date,  false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_01, 'Collect seller disclosures', 'Sarah Mitchell', 'complete', 5, v_tpl_prelist::text, NOW() - INTERVAL '2 days', NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_01, 'Install lockbox',            'Sarah Mitchell', 'open',     6, v_tpl_prelist::text, NULL, (CURRENT_DATE + INTERVAL '5 days')::date,  false, 'Task');

  -- TX 2 (Saguaro Vista, pre-listing): 1/6 complete
  INSERT INTO public.tasks (id, user_id, transaction_id, title, assigned_to, status, sort_order, template_key, completed_at, due_date, has_progress_tracking, task_type) VALUES
    (gen_random_uuid(), v_user_id, v_tx_02, 'Sign listing agreement',     'Sarah Mitchell', 'complete', 1, v_tpl_prelist::text, NOW() - INTERVAL '2 days', NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_02, 'Schedule photography',       'Sarah Mitchell', 'open',     2, v_tpl_prelist::text, NULL, (CURRENT_DATE + INTERVAL '5 days')::date,  false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_02, 'Order yard sign',            'Rachel Torres',  'open',     3, v_tpl_prelist::text, NULL, (CURRENT_DATE + INTERVAL '4 days')::date,  true, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_02, 'Prepare MLS input sheet',    'Rachel Torres',  'open',     4, v_tpl_prelist::text, NULL, (CURRENT_DATE + INTERVAL '6 days')::date,  false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_02, 'Collect seller disclosures', 'Sarah Mitchell', 'open',     5, v_tpl_prelist::text, NULL, (CURRENT_DATE + INTERVAL '3 days')::date,  false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_02, 'Install lockbox',            'Sarah Mitchell', 'open',     6, v_tpl_prelist::text, NULL, (CURRENT_DATE + INTERVAL '7 days')::date,  false, 'Task');

  -- TX 3 (Sunset Bluff, pre-listing): 4/6 complete (sign ordered, has progress)
  INSERT INTO public.tasks (id, user_id, transaction_id, title, assigned_to, status, sort_order, template_key, completed_at, due_date, has_progress_tracking, ordered_date, task_type) VALUES
    (gen_random_uuid(), v_user_id, v_tx_03, 'Sign listing agreement',     'Sarah Mitchell', 'complete', 1, v_tpl_prelist::text, NOW() - INTERVAL '10 days', NULL, false, NULL, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_03, 'Schedule photography',       'Sarah Mitchell', 'complete', 2, v_tpl_prelist::text, NOW() - INTERVAL '8 days',  NULL, false, NULL, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_03, 'Order yard sign',            'Rachel Torres',  'complete', 3, v_tpl_prelist::text, NOW() - INTERVAL '6 days',  NULL, true,  (CURRENT_DATE - INTERVAL '6 days')::date, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_03, 'Prepare MLS input sheet',    'Rachel Torres',  'open',     4, v_tpl_prelist::text, NULL, (CURRENT_DATE + INTERVAL '2 days')::date,  false, NULL, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_03, 'Collect seller disclosures', 'Sarah Mitchell', 'complete', 5, v_tpl_prelist::text, NOW() - INTERVAL '4 days',  NULL, false, NULL, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_03, 'Install lockbox',            'Sarah Mitchell', 'open',     6, v_tpl_prelist::text, NULL, (CURRENT_DATE + INTERVAL '4 days')::date,  false, NULL, 'Task');

  -- TX 4-7 (active listings): all pre-listing tasks complete + 1 active-stage task each
  -- TX 4 (Ironwood Trail, 45 days active, price reduced)
  INSERT INTO public.tasks (id, user_id, transaction_id, title, assigned_to, status, sort_order, template_key, completed_at, due_date, has_progress_tracking, task_type) VALUES
    (gen_random_uuid(), v_user_id, v_tx_04, 'Sign listing agreement',     'Sarah Mitchell', 'complete', 1, v_tpl_prelist::text, NOW() - INTERVAL '52 days', NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_04, 'Schedule photography',       'Sarah Mitchell', 'complete', 2, v_tpl_prelist::text, NOW() - INTERVAL '50 days', NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_04, 'Order yard sign',            'Rachel Torres',  'complete', 3, v_tpl_prelist::text, NOW() - INTERVAL '48 days', NULL, true, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_04, 'Prepare MLS input sheet',    'Rachel Torres',  'complete', 4, v_tpl_prelist::text, NOW() - INTERVAL '46 days', NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_04, 'Collect seller disclosures', 'Sarah Mitchell', 'complete', 5, v_tpl_prelist::text, NOW() - INTERVAL '47 days', NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_04, 'Install lockbox',            'Sarah Mitchell', 'complete', 6, v_tpl_prelist::text, NOW() - INTERVAL '45 days', NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_04, 'Discuss price reduction with seller', 'Sarah Mitchell', 'complete', 7, NULL, NOW() - INTERVAL '14 days', NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_04, 'Send price reduction notice email',   'Sarah Mitchell', 'complete', 8, NULL, NOW() - INTERVAL '12 days', NULL, false, 'Task');

  -- TX 5 (Desert Willow, 14 days active)
  INSERT INTO public.tasks (id, user_id, transaction_id, title, assigned_to, status, sort_order, template_key, completed_at, due_date, has_progress_tracking, task_type) VALUES
    (gen_random_uuid(), v_user_id, v_tx_05, 'Sign listing agreement',     'Sarah Mitchell', 'complete', 1, v_tpl_prelist::text, NOW() - INTERVAL '14 days', NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_05, 'Schedule photography',       'Sarah Mitchell', 'complete', 2, v_tpl_prelist::text, NOW() - INTERVAL '12 days', NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_05, 'Order yard sign',            'Rachel Torres',  'complete', 3, v_tpl_prelist::text, NOW() - INTERVAL '10 days', NULL, true, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_05, 'Prepare MLS input sheet',    'Rachel Torres',  'complete', 4, v_tpl_prelist::text, NOW() - INTERVAL '9 days',  NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_05, 'Collect seller disclosures', 'Sarah Mitchell', 'complete', 5, v_tpl_prelist::text, NOW() - INTERVAL '11 days', NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_05, 'Install lockbox',            'Sarah Mitchell', 'complete', 6, v_tpl_prelist::text, NOW() - INTERVAL '5 days',  NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_05, 'Schedule open house',        'Sarah Mitchell', 'open',     7, NULL, NULL, (CURRENT_DATE + INTERVAL '5 days')::date, false, 'Task');

  -- TX 6 (Red Hawk Mesa, 30 days active)
  INSERT INTO public.tasks (id, user_id, transaction_id, title, assigned_to, status, sort_order, template_key, completed_at, due_date, has_progress_tracking, task_type) VALUES
    (gen_random_uuid(), v_user_id, v_tx_06, 'Sign listing agreement',     'Sarah Mitchell', 'complete', 1, v_tpl_prelist::text, NOW() - INTERVAL '30 days', NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_06, 'Schedule photography',       'Sarah Mitchell', 'complete', 2, v_tpl_prelist::text, NOW() - INTERVAL '28 days', NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_06, 'Order yard sign',            'Rachel Torres',  'complete', 3, v_tpl_prelist::text, NOW() - INTERVAL '26 days', NULL, true, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_06, 'Prepare MLS input sheet',    'Rachel Torres',  'complete', 4, v_tpl_prelist::text, NOW() - INTERVAL '25 days', NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_06, 'Collect seller disclosures', 'Sarah Mitchell', 'complete', 5, v_tpl_prelist::text, NOW() - INTERVAL '27 days', NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_06, 'Install lockbox',            'Sarah Mitchell', 'complete', 6, v_tpl_prelist::text, NOW() - INTERVAL '25 days', NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_06, 'Host weekend open house',    'Sarah Mitchell', 'complete', 7, NULL, NOW() - INTERVAL '14 days', NULL, false, 'Task');

  -- TX 7 (Palo Verde, 25 days active)
  INSERT INTO public.tasks (id, user_id, transaction_id, title, assigned_to, status, sort_order, template_key, completed_at, due_date, has_progress_tracking, task_type) VALUES
    (gen_random_uuid(), v_user_id, v_tx_07, 'Sign listing agreement',     'Sarah Mitchell', 'complete', 1, v_tpl_prelist::text, NOW() - INTERVAL '25 days', NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_07, 'Schedule photography',       'Sarah Mitchell', 'complete', 2, v_tpl_prelist::text, NOW() - INTERVAL '23 days', NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_07, 'Order yard sign',            'Rachel Torres',  'complete', 3, v_tpl_prelist::text, NOW() - INTERVAL '21 days', NULL, true, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_07, 'Prepare MLS input sheet',    'Rachel Torres',  'complete', 4, v_tpl_prelist::text, NOW() - INTERVAL '20 days', NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_07, 'Collect seller disclosures', 'Sarah Mitchell', 'complete', 5, v_tpl_prelist::text, NOW() - INTERVAL '22 days', NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_07, 'Install lockbox',            'Sarah Mitchell', 'complete', 6, v_tpl_prelist::text, NOW() - INTERVAL '20 days', NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_07, 'Provide LBP disclosure to buyer agents', 'Sarah Mitchell', 'open', 7, NULL, NULL, (CURRENT_DATE + INTERVAL '3 days')::date, false, 'Task');

  -- TX 8 (Canyon Rim, pending buyer, 60% complete — has an overdue task)
  INSERT INTO public.tasks (id, user_id, transaction_id, title, assigned_to, status, sort_order, template_key, completed_at, due_date, task_type, has_progress_tracking) VALUES
    (gen_random_uuid(), v_user_id, v_tx_08, 'Send UC congratulations email',  'Sarah Mitchell', 'complete', 1,  v_tpl_buy_pending::text, NOW() - INTERVAL '18 days', NULL, 'Email', false),
    (gen_random_uuid(), v_user_id, v_tx_08, 'Send TC introduction email',     'Rachel Torres',  'complete', 2,  v_tpl_buy_pending::text, NOW() - INTERVAL '18 days', NULL, 'Email', false),
    (gen_random_uuid(), v_user_id, v_tx_08, 'Open escrow with title company', 'Megan Cole',     'complete', 3,  v_tpl_buy_pending::text, NOW() - INTERVAL '17 days', NULL, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_08, 'Schedule home inspection',       'Megan Cole',     'complete', 4,  v_tpl_buy_pending::text, NOW() - INTERVAL '14 days', NULL, 'Task', true),
    (gen_random_uuid(), v_user_id, v_tx_08, 'Order appraisal',                'Megan Cole',     'complete', 5,  v_tpl_buy_pending::text, NOW() - INTERVAL '10 days', NULL, 'Task', true),
    (gen_random_uuid(), v_user_id, v_tx_08, 'Submit earnest money',           'Megan Cole',     'complete', 6,  v_tpl_buy_pending::text, NOW() - INTERVAL '16 days', NULL, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_08, 'Review inspection report',       'Sarah Mitchell', 'complete', 7,  v_tpl_buy_pending::text, NOW() - INTERVAL '10 days', NULL, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_08, 'Submit BINSR',                   'Sarah Mitchell', 'complete', 8,  v_tpl_buy_pending::text, NOW() - INTERVAL '8 days',  NULL, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_08, 'Confirm loan approval',          'Megan Cole',     'open',     9,  v_tpl_buy_pending::text, NULL, (CURRENT_DATE + INTERVAL '5 days')::date, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_08, 'Schedule final walkthrough',     'Sarah Mitchell', 'open',     10, v_tpl_buy_pending::text, NULL, (CURRENT_DATE - INTERVAL '2 days')::date, 'Task', false),  -- overdue
    (gen_random_uuid(), v_user_id, v_tx_08, 'Confirm closing date and time',  'Megan Cole',     'open',     11, v_tpl_buy_pending::text, NULL, (CURRENT_DATE + INTERVAL '15 days')::date, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_08, 'Send closing reminder email',    'Sarah Mitchell', 'open',     12, v_tpl_buy_pending::text, NULL, (CURRENT_DATE + INTERVAL '15 days')::date, 'Email', false);

  -- TX 9 (Quail Hollow, pending buyer, 15% complete — just under contract)
  INSERT INTO public.tasks (id, user_id, transaction_id, title, assigned_to, status, sort_order, template_key, completed_at, due_date, task_type, has_progress_tracking) VALUES
    (gen_random_uuid(), v_user_id, v_tx_09, 'Send UC congratulations email',  'Sarah Mitchell', 'complete', 1,  v_tpl_buy_pending::text, NOW() - INTERVAL '5 days', NULL, 'Email', false),
    (gen_random_uuid(), v_user_id, v_tx_09, 'Send TC introduction email',     'Rachel Torres',  'complete', 2,  v_tpl_buy_pending::text, NOW() - INTERVAL '5 days', NULL, 'Email', false),
    (gen_random_uuid(), v_user_id, v_tx_09, 'Open escrow with title company', 'Megan Cole',     'open',     3,  v_tpl_buy_pending::text, NULL, (CURRENT_DATE + INTERVAL '2 days')::date, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_09, 'Schedule home inspection',       'Megan Cole',     'open',     4,  v_tpl_buy_pending::text, NULL, (CURRENT_DATE + INTERVAL '2 days')::date, 'Task', true),
    (gen_random_uuid(), v_user_id, v_tx_09, 'Order appraisal',                'Megan Cole',     'open',     5,  v_tpl_buy_pending::text, NULL, (CURRENT_DATE + INTERVAL '10 days')::date, 'Task', true),
    (gen_random_uuid(), v_user_id, v_tx_09, 'Submit earnest money',           'Megan Cole',     'open',     6,  v_tpl_buy_pending::text, NULL, (CURRENT_DATE + INTERVAL '3 days')::date, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_09, 'Review inspection report',       'Sarah Mitchell', 'open',     7,  v_tpl_buy_pending::text, NULL, (CURRENT_DATE + INTERVAL '8 days')::date, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_09, 'Submit BINSR',                   'Sarah Mitchell', 'open',     8,  v_tpl_buy_pending::text, NULL, (CURRENT_DATE + INTERVAL '12 days')::date, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_09, 'Confirm loan approval',          'Megan Cole',     'open',     9,  v_tpl_buy_pending::text, NULL, (CURRENT_DATE + INTERVAL '25 days')::date, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_09, 'Schedule final walkthrough',     'Sarah Mitchell', 'open',     10, v_tpl_buy_pending::text, NULL, (CURRENT_DATE + INTERVAL '30 days')::date, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_09, 'Confirm closing date and time',  'Megan Cole',     'open',     11, v_tpl_buy_pending::text, NULL, (CURRENT_DATE + INTERVAL '28 days')::date, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_09, 'Send closing reminder email',    'Sarah Mitchell', 'open',     12, v_tpl_buy_pending::text, NULL, (CURRENT_DATE + INTERVAL '28 days')::date, 'Email', false);

  -- TX 10 (Juniper Springs, pending seller, 85% — closing in 5 days, has an overdue)
  INSERT INTO public.tasks (id, user_id, transaction_id, title, assigned_to, status, sort_order, template_key, completed_at, due_date, task_type, has_progress_tracking) VALUES
    (gen_random_uuid(), v_user_id, v_tx_10, 'Send UC congratulations email',  'Sarah Mitchell', 'complete', 1,  v_tpl_sell_pending::text, NOW() - INTERVAL '25 days', NULL, 'Email', false),
    (gen_random_uuid(), v_user_id, v_tx_10, 'Send TC introduction email',     'Rachel Torres',  'complete', 2,  v_tpl_sell_pending::text, NOW() - INTERVAL '25 days', NULL, 'Email', false),
    (gen_random_uuid(), v_user_id, v_tx_10, 'Open escrow with title company', 'Rachel Torres',  'complete', 3,  v_tpl_sell_pending::text, NOW() - INTERVAL '24 days', NULL, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_10, 'Collect HOA documents',          'Rachel Torres',  'complete', 4,  v_tpl_sell_pending::text, NOW() - INTERVAL '20 days', NULL, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_10, 'Review buyer inspection report', 'Sarah Mitchell', 'complete', 5,  v_tpl_sell_pending::text, NOW() - INTERVAL '15 days', NULL, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_10, 'Respond to BINSR',               'Sarah Mitchell', 'complete', 6,  v_tpl_sell_pending::text, NOW() - INTERVAL '13 days', NULL, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_10, 'Confirm appraisal completed',    'Rachel Torres',  'complete', 7,  v_tpl_sell_pending::text, NOW() - INTERVAL '10 days', NULL, 'Task', true),
    (gen_random_uuid(), v_user_id, v_tx_10, 'Schedule sign removal',          'Rachel Torres',  'open',     8,  v_tpl_sell_pending::text, NULL, (CURRENT_DATE + INTERVAL '4 days')::date, 'Task', true),
    (gen_random_uuid(), v_user_id, v_tx_10, 'Remove lockbox',                 'Sarah Mitchell', 'open',     9,  v_tpl_sell_pending::text, NULL, (CURRENT_DATE + INTERVAL '5 days')::date, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_10, 'Confirm closing date and time',  'Rachel Torres',  'open',     10, v_tpl_sell_pending::text, NULL, (CURRENT_DATE - INTERVAL '1 days')::date, 'Task', false),  -- overdue
    (gen_random_uuid(), v_user_id, v_tx_10, 'Send closing reminder email',    'Sarah Mitchell', 'complete', 11, v_tpl_sell_pending::text, NOW() - INTERVAL '2 days',  NULL, 'Email', false);

  -- TX 11 (Ridgeline, pending buyer, 75% — closing in 10 days)
  INSERT INTO public.tasks (id, user_id, transaction_id, title, assigned_to, status, sort_order, template_key, completed_at, due_date, task_type, has_progress_tracking) VALUES
    (gen_random_uuid(), v_user_id, v_tx_11, 'Send UC congratulations email',  'Sarah Mitchell', 'complete', 1,  v_tpl_buy_pending::text, NOW() - INTERVAL '30 days', NULL, 'Email', false),
    (gen_random_uuid(), v_user_id, v_tx_11, 'Send TC introduction email',     'Rachel Torres',  'complete', 2,  v_tpl_buy_pending::text, NOW() - INTERVAL '30 days', NULL, 'Email', false),
    (gen_random_uuid(), v_user_id, v_tx_11, 'Open escrow with title company', 'Megan Cole',     'complete', 3,  v_tpl_buy_pending::text, NOW() - INTERVAL '29 days', NULL, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_11, 'Schedule home inspection',       'Megan Cole',     'complete', 4,  v_tpl_buy_pending::text, NOW() - INTERVAL '25 days', NULL, 'Task', true),
    (gen_random_uuid(), v_user_id, v_tx_11, 'Order appraisal',                'Megan Cole',     'complete', 5,  v_tpl_buy_pending::text, NOW() - INTERVAL '20 days', NULL, 'Task', true),
    (gen_random_uuid(), v_user_id, v_tx_11, 'Submit earnest money',           'Megan Cole',     'complete', 6,  v_tpl_buy_pending::text, NOW() - INTERVAL '28 days', NULL, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_11, 'Review inspection report',       'Sarah Mitchell', 'complete', 7,  v_tpl_buy_pending::text, NOW() - INTERVAL '23 days', NULL, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_11, 'Submit BINSR',                   'Sarah Mitchell', 'complete', 8,  v_tpl_buy_pending::text, NOW() - INTERVAL '21 days', NULL, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_11, 'Confirm loan approval',          'Megan Cole',     'complete', 9,  v_tpl_buy_pending::text, NOW() - INTERVAL '5 days',  NULL, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_11, 'Schedule final walkthrough',     'Sarah Mitchell', 'open',     10, v_tpl_buy_pending::text, NULL, (CURRENT_DATE + INTERVAL '8 days')::date, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_11, 'Confirm closing date and time',  'Megan Cole',     'open',     11, v_tpl_buy_pending::text, NULL, (CURRENT_DATE + INTERVAL '7 days')::date, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_11, 'Send closing reminder email',    'Sarah Mitchell', 'open',     12, v_tpl_buy_pending::text, NULL, (CURRENT_DATE + INTERVAL '3 days')::date, 'Email', false);

  -- TX 12 (Crestview, pending dual, 40% — mid-process, has an overdue)
  INSERT INTO public.tasks (id, user_id, transaction_id, title, assigned_to, status, sort_order, template_key, completed_at, due_date, task_type, has_progress_tracking) VALUES
    (gen_random_uuid(), v_user_id, v_tx_12, 'Send UC congratulations email',  'Sarah Mitchell', 'complete', 1,  v_tpl_sell_pending::text, NOW() - INTERVAL '14 days', NULL, 'Email', false),
    (gen_random_uuid(), v_user_id, v_tx_12, 'Send TC introduction email',     'Rachel Torres',  'complete', 2,  v_tpl_sell_pending::text, NOW() - INTERVAL '14 days', NULL, 'Email', false),
    (gen_random_uuid(), v_user_id, v_tx_12, 'Open escrow with title company', 'Rachel Torres',  'complete', 3,  v_tpl_sell_pending::text, NOW() - INTERVAL '13 days', NULL, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_12, 'Collect HOA documents',          'Rachel Torres',  'complete', 4,  v_tpl_sell_pending::text, NOW() - INTERVAL '10 days', NULL, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_12, 'Review buyer inspection report', 'Sarah Mitchell', 'open',     5,  v_tpl_sell_pending::text, NULL, (CURRENT_DATE + INTERVAL '2 days')::date, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_12, 'Respond to BINSR',               'Sarah Mitchell', 'open',     6,  v_tpl_sell_pending::text, NULL, (CURRENT_DATE - INTERVAL '2 days')::date, 'Task', false),  -- overdue
    (gen_random_uuid(), v_user_id, v_tx_12, 'Confirm appraisal completed',    'Rachel Torres',  'open',     7,  v_tpl_sell_pending::text, NULL, (CURRENT_DATE + INTERVAL '5 days')::date, 'Task', true),
    (gen_random_uuid(), v_user_id, v_tx_12, 'Schedule sign removal',          'Rachel Torres',  'open',     8,  v_tpl_sell_pending::text, NULL, (CURRENT_DATE + INTERVAL '20 days')::date, 'Task', true),
    (gen_random_uuid(), v_user_id, v_tx_12, 'Remove lockbox',                 'Sarah Mitchell', 'open',     9,  v_tpl_sell_pending::text, NULL, (CURRENT_DATE + INTERVAL '25 days')::date, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_12, 'Confirm closing date and time',  'Rachel Torres',  'open',     10, v_tpl_sell_pending::text, NULL, (CURRENT_DATE + INTERVAL '20 days')::date, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_12, 'Send closing reminder email',    'Sarah Mitchell', 'open',     11, v_tpl_sell_pending::text, NULL, (CURRENT_DATE + INTERVAL '19 days')::date, 'Email', false);

  -- TX 13 (Mesquite Flats, pending buyer, 55% — re-negotiated price, has an overdue)
  INSERT INTO public.tasks (id, user_id, transaction_id, title, assigned_to, status, sort_order, template_key, completed_at, due_date, task_type, has_progress_tracking) VALUES
    (gen_random_uuid(), v_user_id, v_tx_13, 'Send UC congratulations email',  'Sarah Mitchell', 'complete', 1,  v_tpl_buy_pending::text, NOW() - INTERVAL '20 days', NULL, 'Email', false),
    (gen_random_uuid(), v_user_id, v_tx_13, 'Send TC introduction email',     'Rachel Torres',  'complete', 2,  v_tpl_buy_pending::text, NOW() - INTERVAL '20 days', NULL, 'Email', false),
    (gen_random_uuid(), v_user_id, v_tx_13, 'Open escrow with title company', 'Megan Cole',     'complete', 3,  v_tpl_buy_pending::text, NOW() - INTERVAL '19 days', NULL, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_13, 'Schedule home inspection',       'Megan Cole',     'complete', 4,  v_tpl_buy_pending::text, NOW() - INTERVAL '15 days', NULL, 'Task', true),
    (gen_random_uuid(), v_user_id, v_tx_13, 'Order appraisal',                'Megan Cole',     'complete', 5,  v_tpl_buy_pending::text, NOW() - INTERVAL '12 days', NULL, 'Task', true),
    (gen_random_uuid(), v_user_id, v_tx_13, 'Submit earnest money',           'Megan Cole',     'complete', 6,  v_tpl_buy_pending::text, NOW() - INTERVAL '18 days', NULL, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_13, 'Review inspection report',       'Sarah Mitchell', 'complete', 7,  v_tpl_buy_pending::text, NOW() - INTERVAL '12 days', NULL, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_13, 'Negotiate appraisal-driven price reduction', 'Sarah Mitchell', 'complete', 8, NULL, NOW() - INTERVAL '2 days', NULL, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_13, 'Submit BINSR',                   'Sarah Mitchell', 'open',     9,  v_tpl_buy_pending::text, NULL, (CURRENT_DATE + INTERVAL '2 days')::date, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_13, 'Confirm loan approval',          'Megan Cole',     'open',     10, v_tpl_buy_pending::text, NULL, (CURRENT_DATE - INTERVAL '3 days')::date, 'Task', false),  -- overdue
    (gen_random_uuid(), v_user_id, v_tx_13, 'Schedule final walkthrough',     'Sarah Mitchell', 'open',     11, v_tpl_buy_pending::text, NULL, (CURRENT_DATE + INTERVAL '18 days')::date, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_13, 'Confirm closing date and time',  'Megan Cole',     'open',     12, v_tpl_buy_pending::text, NULL, (CURRENT_DATE + INTERVAL '15 days')::date, 'Task', false);

  -- TX 14 (Pinyon Creek, pending seller, 95% — closing in 3 days)
  INSERT INTO public.tasks (id, user_id, transaction_id, title, assigned_to, status, sort_order, template_key, completed_at, due_date, task_type, has_progress_tracking) VALUES
    (gen_random_uuid(), v_user_id, v_tx_14, 'Send UC congratulations email',  'Sarah Mitchell', 'complete', 1,  v_tpl_sell_pending::text, NOW() - INTERVAL '32 days', NULL, 'Email', false),
    (gen_random_uuid(), v_user_id, v_tx_14, 'Send TC introduction email',     'Rachel Torres',  'complete', 2,  v_tpl_sell_pending::text, NOW() - INTERVAL '32 days', NULL, 'Email', false),
    (gen_random_uuid(), v_user_id, v_tx_14, 'Open escrow with title company', 'Rachel Torres',  'complete', 3,  v_tpl_sell_pending::text, NOW() - INTERVAL '31 days', NULL, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_14, 'Collect HOA documents',          'Rachel Torres',  'complete', 4,  v_tpl_sell_pending::text, NOW() - INTERVAL '27 days', NULL, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_14, 'Review buyer inspection report', 'Sarah Mitchell', 'complete', 5,  v_tpl_sell_pending::text, NOW() - INTERVAL '22 days', NULL, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_14, 'Respond to BINSR',               'Sarah Mitchell', 'complete', 6,  v_tpl_sell_pending::text, NOW() - INTERVAL '20 days', NULL, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_14, 'Confirm appraisal completed',    'Rachel Torres',  'complete', 7,  v_tpl_sell_pending::text, NOW() - INTERVAL '15 days', NULL, 'Task', true),
    (gen_random_uuid(), v_user_id, v_tx_14, 'Schedule sign removal',          'Rachel Torres',  'complete', 8,  v_tpl_sell_pending::text, NOW() - INTERVAL '5 days',  NULL, 'Task', true),
    (gen_random_uuid(), v_user_id, v_tx_14, 'Remove lockbox',                 'Sarah Mitchell', 'complete', 9,  v_tpl_sell_pending::text, NOW() - INTERVAL '1 days',  NULL, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_14, 'Confirm closing date and time',  'Rachel Torres',  'complete', 10, v_tpl_sell_pending::text, NOW() - INTERVAL '3 days',  NULL, 'Task', false),
    (gen_random_uuid(), v_user_id, v_tx_14, 'Send closing reminder email',    'Sarah Mitchell', 'open',     11, v_tpl_sell_pending::text, NULL, (CURRENT_DATE + INTERVAL '1 days')::date, 'Email', false);

  -- TX 15 (Sandstone, closed buyer): all tasks complete
  INSERT INTO public.tasks (id, user_id, transaction_id, title, assigned_to, status, sort_order, template_key, completed_at, task_type) VALUES
    (gen_random_uuid(), v_user_id, v_tx_15, 'Send UC congratulations email',  'Sarah Mitchell', 'complete', 1,  v_tpl_buy_pending::text, NOW() - INTERVAL '65 days', 'Email'),
    (gen_random_uuid(), v_user_id, v_tx_15, 'Send TC introduction email',     'Rachel Torres',  'complete', 2,  v_tpl_buy_pending::text, NOW() - INTERVAL '65 days', 'Email'),
    (gen_random_uuid(), v_user_id, v_tx_15, 'Open escrow with title company', 'Megan Cole',     'complete', 3,  v_tpl_buy_pending::text, NOW() - INTERVAL '63 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_15, 'Schedule home inspection',       'Megan Cole',     'complete', 4,  v_tpl_buy_pending::text, NOW() - INTERVAL '58 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_15, 'Order appraisal',                'Megan Cole',     'complete', 5,  v_tpl_buy_pending::text, NOW() - INTERVAL '55 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_15, 'Submit earnest money',           'Megan Cole',     'complete', 6,  v_tpl_buy_pending::text, NOW() - INTERVAL '62 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_15, 'Review inspection report',       'Sarah Mitchell', 'complete', 7,  v_tpl_buy_pending::text, NOW() - INTERVAL '55 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_15, 'Submit BINSR',                   'Sarah Mitchell', 'complete', 8,  v_tpl_buy_pending::text, NOW() - INTERVAL '53 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_15, 'Confirm loan approval',          'Megan Cole',     'complete', 9,  v_tpl_buy_pending::text, NOW() - INTERVAL '32 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_15, 'Schedule final walkthrough',     'Sarah Mitchell', 'complete', 10, v_tpl_buy_pending::text, NOW() - INTERVAL '27 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_15, 'Confirm closing date and time',  'Megan Cole',     'complete', 11, v_tpl_buy_pending::text, NOW() - INTERVAL '28 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_15, 'Send closing reminder email',    'Sarah Mitchell', 'complete', 12, v_tpl_buy_pending::text, NOW() - INTERVAL '32 days', 'Email');

  -- TX 16 (Amber Creek, closed seller): all complete
  INSERT INTO public.tasks (id, user_id, transaction_id, title, assigned_to, status, sort_order, template_key, completed_at, task_type) VALUES
    (gen_random_uuid(), v_user_id, v_tx_16, 'Send UC congratulations email',  'Sarah Mitchell', 'complete', 1,  v_tpl_sell_pending::text, NOW() - INTERVAL '75 days', 'Email'),
    (gen_random_uuid(), v_user_id, v_tx_16, 'Send TC introduction email',     'Rachel Torres',  'complete', 2,  v_tpl_sell_pending::text, NOW() - INTERVAL '75 days', 'Email'),
    (gen_random_uuid(), v_user_id, v_tx_16, 'Open escrow with title company', 'Rachel Torres',  'complete', 3,  v_tpl_sell_pending::text, NOW() - INTERVAL '73 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_16, 'Collect HOA documents',          'Rachel Torres',  'complete', 4,  v_tpl_sell_pending::text, NOW() - INTERVAL '68 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_16, 'Review buyer inspection report', 'Sarah Mitchell', 'complete', 5,  v_tpl_sell_pending::text, NOW() - INTERVAL '63 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_16, 'Respond to BINSR',               'Sarah Mitchell', 'complete', 6,  v_tpl_sell_pending::text, NOW() - INTERVAL '61 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_16, 'Confirm appraisal completed',    'Rachel Torres',  'complete', 7,  v_tpl_sell_pending::text, NOW() - INTERVAL '55 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_16, 'Schedule sign removal',          'Rachel Torres',  'complete', 8,  v_tpl_sell_pending::text, NOW() - INTERVAL '40 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_16, 'Remove lockbox',                 'Sarah Mitchell', 'complete', 9,  v_tpl_sell_pending::text, NOW() - INTERVAL '36 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_16, 'Confirm closing date and time',  'Rachel Torres',  'complete', 10, v_tpl_sell_pending::text, NOW() - INTERVAL '40 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_16, 'Send closing reminder email',    'Sarah Mitchell', 'complete', 11, v_tpl_sell_pending::text, NOW() - INTERVAL '42 days', 'Email');

  -- TX 17 (Hawk Ridge, closed buyer): all complete
  INSERT INTO public.tasks (id, user_id, transaction_id, title, assigned_to, status, sort_order, template_key, completed_at, task_type) VALUES
    (gen_random_uuid(), v_user_id, v_tx_17, 'Send UC congratulations email',  'Sarah Mitchell', 'complete', 1,  v_tpl_buy_pending::text, NOW() - INTERVAL '90 days', 'Email'),
    (gen_random_uuid(), v_user_id, v_tx_17, 'Send TC introduction email',     'Rachel Torres',  'complete', 2,  v_tpl_buy_pending::text, NOW() - INTERVAL '90 days', 'Email'),
    (gen_random_uuid(), v_user_id, v_tx_17, 'Open escrow with title company', 'Megan Cole',     'complete', 3,  v_tpl_buy_pending::text, NOW() - INTERVAL '88 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_17, 'Schedule home inspection',       'Megan Cole',     'complete', 4,  v_tpl_buy_pending::text, NOW() - INTERVAL '83 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_17, 'Order appraisal',                'Megan Cole',     'complete', 5,  v_tpl_buy_pending::text, NOW() - INTERVAL '80 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_17, 'Submit earnest money',           'Megan Cole',     'complete', 6,  v_tpl_buy_pending::text, NOW() - INTERVAL '87 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_17, 'Review inspection report',       'Sarah Mitchell', 'complete', 7,  v_tpl_buy_pending::text, NOW() - INTERVAL '80 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_17, 'Submit BINSR',                   'Sarah Mitchell', 'complete', 8,  v_tpl_buy_pending::text, NOW() - INTERVAL '78 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_17, 'Confirm loan approval',          'Megan Cole',     'complete', 9,  v_tpl_buy_pending::text, NOW() - INTERVAL '57 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_17, 'Schedule final walkthrough',     'Sarah Mitchell', 'complete', 10, v_tpl_buy_pending::text, NOW() - INTERVAL '52 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_17, 'Confirm closing date and time',  'Megan Cole',     'complete', 11, v_tpl_buy_pending::text, NOW() - INTERVAL '53 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_17, 'Send closing reminder email',    'Sarah Mitchell', 'complete', 12, v_tpl_buy_pending::text, NOW() - INTERVAL '57 days', 'Email');

  -- TX 18 (Chaparral, closed seller): all complete
  INSERT INTO public.tasks (id, user_id, transaction_id, title, assigned_to, status, sort_order, template_key, completed_at, task_type) VALUES
    (gen_random_uuid(), v_user_id, v_tx_18, 'Send UC congratulations email',  'Sarah Mitchell', 'complete', 1,  v_tpl_sell_pending::text, NOW() - INTERVAL '80 days', 'Email'),
    (gen_random_uuid(), v_user_id, v_tx_18, 'Send TC introduction email',     'Rachel Torres',  'complete', 2,  v_tpl_sell_pending::text, NOW() - INTERVAL '80 days', 'Email'),
    (gen_random_uuid(), v_user_id, v_tx_18, 'Open escrow with title company', 'Rachel Torres',  'complete', 3,  v_tpl_sell_pending::text, NOW() - INTERVAL '78 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_18, 'Collect HOA documents',          'Rachel Torres',  'complete', 4,  v_tpl_sell_pending::text, NOW() - INTERVAL '73 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_18, 'Review buyer inspection report', 'Sarah Mitchell', 'complete', 5,  v_tpl_sell_pending::text, NOW() - INTERVAL '68 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_18, 'Respond to BINSR',               'Sarah Mitchell', 'complete', 6,  v_tpl_sell_pending::text, NOW() - INTERVAL '66 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_18, 'Confirm appraisal completed',    'Rachel Torres',  'complete', 7,  v_tpl_sell_pending::text, NOW() - INTERVAL '60 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_18, 'Schedule sign removal',          'Rachel Torres',  'complete', 8,  v_tpl_sell_pending::text, NOW() - INTERVAL '45 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_18, 'Remove lockbox',                 'Sarah Mitchell', 'complete', 9,  v_tpl_sell_pending::text, NOW() - INTERVAL '41 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_18, 'Confirm closing date and time',  'Rachel Torres',  'complete', 10, v_tpl_sell_pending::text, NOW() - INTERVAL '45 days', 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_18, 'Send closing reminder email',    'Sarah Mitchell', 'complete', 11, v_tpl_sell_pending::text, NOW() - INTERVAL '47 days', 'Email');

  -- TX 19 (Ocotillo, expired listing): pre-listing tasks mostly done before expiration
  INSERT INTO public.tasks (id, user_id, transaction_id, title, assigned_to, status, sort_order, template_key, completed_at, due_date, has_progress_tracking, task_type) VALUES
    (gen_random_uuid(), v_user_id, v_tx_19, 'Sign listing agreement',     'Sarah Mitchell', 'complete', 1, v_tpl_prelist::text, NOW() - INTERVAL '190 days', NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_19, 'Schedule photography',       'Sarah Mitchell', 'complete', 2, v_tpl_prelist::text, NOW() - INTERVAL '188 days', NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_19, 'Order yard sign',            'Rachel Torres',  'complete', 3, v_tpl_prelist::text, NOW() - INTERVAL '185 days', NULL, true, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_19, 'Prepare MLS input sheet',    'Rachel Torres',  'complete', 4, v_tpl_prelist::text, NOW() - INTERVAL '183 days', NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_19, 'Collect seller disclosures', 'Sarah Mitchell', 'complete', 5, v_tpl_prelist::text, NOW() - INTERVAL '186 days', NULL, false, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_19, 'Install lockbox',            'Sarah Mitchell', 'complete', 6, v_tpl_prelist::text, NOW() - INTERVAL '184 days', NULL, false, 'Task');

  -- TX 20 (Barrel Cactus, cancelled buyer): pending tasks partially complete then cancelled
  INSERT INTO public.tasks (id, user_id, transaction_id, title, assigned_to, status, sort_order, template_key, completed_at, due_date, task_type) VALUES
    (gen_random_uuid(), v_user_id, v_tx_20, 'Send UC congratulations email',  'Sarah Mitchell', 'complete', 1, v_tpl_buy_pending::text, NOW() - INTERVAL '60 days', NULL, 'Email'),
    (gen_random_uuid(), v_user_id, v_tx_20, 'Send TC introduction email',     'Rachel Torres',  'complete', 2, v_tpl_buy_pending::text, NOW() - INTERVAL '60 days', NULL, 'Email'),
    (gen_random_uuid(), v_user_id, v_tx_20, 'Open escrow with title company', 'Megan Cole',     'complete', 3, v_tpl_buy_pending::text, NOW() - INTERVAL '58 days', NULL, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_20, 'Schedule home inspection',       'Megan Cole',     'complete', 4, v_tpl_buy_pending::text, NOW() - INTERVAL '54 days', NULL, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_20, 'Order appraisal',                'Megan Cole',     'complete', 5, v_tpl_buy_pending::text, NOW() - INTERVAL '50 days', NULL, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_20, 'Submit earnest money',           'Megan Cole',     'complete', 6, v_tpl_buy_pending::text, NOW() - INTERVAL '57 days', NULL, 'Task'),
    (gen_random_uuid(), v_user_id, v_tx_20, 'Confirm loan approval',          'Megan Cole',     'open',     9, v_tpl_buy_pending::text, NULL, (CURRENT_DATE - INTERVAL '20 days')::date, 'Task');


  -- ── 2j. Transaction notes ──────────────────────────────────────────────
  -- TX 8 — note + reply
  INSERT INTO public.transaction_notes (id, user_id, transaction_id, note_text, author, parent_id, created_at) VALUES
    (v_note_tx08_p, v_user_id, v_tx_08, 'Home inspection completed. A few minor items flagged — nothing structural. Buyers are happy to proceed.', 'Sarah Mitchell', NULL, NOW() - INTERVAL '15 days'),
    (gen_random_uuid(), v_user_id, v_tx_08, '@Sarah Mitchell — I sent the inspection report to the lender. They confirmed no issues with the findings.', 'Megan Cole', v_note_tx08_p, NOW() - INTERVAL '14 days');

  -- TX 10 — two notes + reply to the second
  INSERT INTO public.transaction_notes (id, user_id, transaction_id, note_text, author, parent_id, created_at) VALUES
    (gen_random_uuid(), v_user_id, v_tx_10, 'Appraisal came back at $420,000. Above contract price — we are clear to proceed.', 'Rachel Torres', NULL, NOW() - INTERVAL '10 days'),
    (v_note_tx10_p, v_user_id, v_tx_10, 'Final walkthrough scheduled for closing day morning. @Rachel Torres please confirm with the buyer agent.', 'Sarah Mitchell', NULL, NOW() - INTERVAL '5 days'),
    (gen_random_uuid(), v_user_id, v_tx_10, 'Confirmed with Nina Alvarez — 9am walkthrough on closing day.', 'Rachel Torres', v_note_tx10_p, NOW() - INTERVAL '4 days');

  -- TX 13 — two notes + reply
  INSERT INTO public.transaction_notes (id, user_id, transaction_id, note_text, author, parent_id, created_at) VALUES
    (gen_random_uuid(), v_user_id, v_tx_13, 'Appraisal came in low at $332,000 vs contract price of $340,000. Negotiating price reduction with seller.', 'Sarah Mitchell', NULL, NOW() - INTERVAL '4 days'),
    (v_note_tx13_p, v_user_id, v_tx_13, 'Seller agreed to reduce to $332,000. @Megan Cole please send the amended contract to title.', 'Sarah Mitchell', NULL, NOW() - INTERVAL '2 days'),
    (gen_random_uuid(), v_user_id, v_tx_13, 'Amendment sent to Marcus at Fidelity. Updated contract price in the system.', 'Megan Cole', v_note_tx13_p, NOW() - INTERVAL '1 days');

  -- TX 20 — three notes documenting cancellation
  INSERT INTO public.transaction_notes (id, user_id, transaction_id, note_text, author, parent_id, created_at) VALUES
    (gen_random_uuid(), v_user_id, v_tx_20, 'Lender flagged an issue with buyer employment verification. Troy changed jobs 2 weeks ago.', 'Megan Cole',     NULL, NOW() - INTERVAL '30 days'),
    (gen_random_uuid(), v_user_id, v_tx_20, 'Spoke with Troy — the job change was not disclosed to the lender. Loan is likely denied.',     'Sarah Mitchell', NULL, NOW() - INTERVAL '25 days'),
    (gen_random_uuid(), v_user_id, v_tx_20, 'Loan officially denied. Transaction cancelled per mutual agreement. Earnest money returned to buyer.', 'Sarah Mitchell', NULL, NOW() - INTERVAL '20 days');


  -- ── 2k. Showings ───────────────────────────────────────────────────────
  -- TX 4 — Ironwood Trail
  INSERT INTO public.showings (id, user_id, transaction_id, agent_name, showing_date, feedback, feedback_requested) VALUES
    (gen_random_uuid(), v_user_id, v_tx_04, 'Karen Liu',      (CURRENT_DATE - INTERVAL '35 days')::date, 'Nice layout but buyers thought the kitchen felt dated. Priced a bit high for the area.', false),
    (gen_random_uuid(), v_user_id, v_tx_04, 'Derek Hanson',   (CURRENT_DATE - INTERVAL '28 days')::date, 'Buyers loved the backyard. Concerned about the HOA fees. Will think about it.',         false),
    (gen_random_uuid(), v_user_id, v_tx_04, 'Nina Alvarez',   (CURRENT_DATE - INTERVAL '20 days')::date, 'Good showing. Buyers want to see a few more homes before deciding.',                     false),
    (gen_random_uuid(), v_user_id, v_tx_04, 'James Whitaker', (CURRENT_DATE - INTERVAL '12 days')::date, NULL, true);

  -- TX 6 — Red Hawk Mesa
  INSERT INTO public.showings (id, user_id, transaction_id, agent_name, showing_date, feedback, feedback_requested) VALUES
    (gen_random_uuid(), v_user_id, v_tx_06, 'Karen Liu',    (CURRENT_DATE - INTERVAL '18 days')::date, 'Beautiful home. Buyers are very interested — may submit an offer this week.', false),
    (gen_random_uuid(), v_user_id, v_tx_06, 'Open House',   (CURRENT_DATE - INTERVAL '14 days')::date, '12 groups came through. Strong interest from 3 parties.',                    false),
    (gen_random_uuid(), v_user_id, v_tx_06, 'Derek Hanson', (CURRENT_DATE - INTERVAL '7 days')::date,  NULL, true);

  -- TX 7 — Palo Verde
  INSERT INTO public.showings (id, user_id, transaction_id, agent_name, showing_date, feedback, feedback_requested) VALUES
    (gen_random_uuid(), v_user_id, v_tx_07, 'Nina Alvarez',   (CURRENT_DATE - INTERVAL '15 days')::date, 'Buyers liked the location but felt the master bath needs updating.',                 false),
    (gen_random_uuid(), v_user_id, v_tx_07, 'James Whitaker', (CURRENT_DATE - INTERVAL '8 days')::date,  'Second showing for our buyers. They are comparing with another property in the area.', false);


  -- ── 2l. Transaction history ────────────────────────────────────────────
  -- Pre-listing (created only)
  INSERT INTO public.transaction_history (id, user_id, transaction_id, description, changed_by, created_at) VALUES
    (gen_random_uuid(), v_user_id, v_tx_01, 'Transaction created', 'Sarah Mitchell', NOW() - INTERVAL '7 days'),
    (gen_random_uuid(), v_user_id, v_tx_02, 'Transaction created', 'Sarah Mitchell', NOW() - INTERVAL '2 days'),
    (gen_random_uuid(), v_user_id, v_tx_03, 'Transaction created', 'Sarah Mitchell', NOW() - INTERVAL '10 days');

  -- Active (created → active)
  INSERT INTO public.transaction_history (id, user_id, transaction_id, description, changed_by, created_at) VALUES
    (gen_random_uuid(), v_user_id, v_tx_04, 'Transaction created',                'Sarah Mitchell', NOW() - INTERVAL '52 days'),
    (gen_random_uuid(), v_user_id, v_tx_04, 'Status changed to Active Listing',   'Sarah Mitchell', NOW() - INTERVAL '45 days'),
    (gen_random_uuid(), v_user_id, v_tx_04, 'Price changed from "375000" to "359000"', 'Sarah Mitchell', NOW() - INTERVAL '12 days'),
    (gen_random_uuid(), v_user_id, v_tx_05, 'Transaction created',                'Sarah Mitchell', NOW() - INTERVAL '14 days'),
    (gen_random_uuid(), v_user_id, v_tx_05, 'Status changed to Active Listing',   'Sarah Mitchell', NOW() - INTERVAL '5 days'),
    (gen_random_uuid(), v_user_id, v_tx_06, 'Transaction created',                'Sarah Mitchell', NOW() - INTERVAL '30 days'),
    (gen_random_uuid(), v_user_id, v_tx_06, 'Status changed to Active Listing',   'Sarah Mitchell', NOW() - INTERVAL '25 days'),
    (gen_random_uuid(), v_user_id, v_tx_07, 'Transaction created',                'Sarah Mitchell', NOW() - INTERVAL '25 days'),
    (gen_random_uuid(), v_user_id, v_tx_07, 'Status changed to Active Listing',   'Sarah Mitchell', NOW() - INTERVAL '20 days');

  -- Pending (created → active → pending)
  INSERT INTO public.transaction_history (id, user_id, transaction_id, description, changed_by, created_at) VALUES
    (gen_random_uuid(), v_user_id, v_tx_08, 'Transaction created',              'Sarah Mitchell', NOW() - INTERVAL '40 days'),
    (gen_random_uuid(), v_user_id, v_tx_08, 'Status changed to Active Listing', 'Sarah Mitchell', NOW() - INTERVAL '32 days'),
    (gen_random_uuid(), v_user_id, v_tx_08, 'Status changed to Pending',        'Sarah Mitchell', NOW() - INTERVAL '18 days'),
    (gen_random_uuid(), v_user_id, v_tx_09, 'Transaction created',              'Sarah Mitchell', NOW() - INTERVAL '12 days'),
    (gen_random_uuid(), v_user_id, v_tx_09, 'Status changed to Active Listing', 'Sarah Mitchell', NOW() - INTERVAL '8 days'),
    (gen_random_uuid(), v_user_id, v_tx_09, 'Status changed to Pending',        'Sarah Mitchell', NOW() - INTERVAL '5 days'),
    (gen_random_uuid(), v_user_id, v_tx_10, 'Transaction created',              'Sarah Mitchell', NOW() - INTERVAL '60 days'),
    (gen_random_uuid(), v_user_id, v_tx_10, 'Status changed to Active Listing', 'Sarah Mitchell', NOW() - INTERVAL '50 days'),
    (gen_random_uuid(), v_user_id, v_tx_10, 'Status changed to Pending',        'Sarah Mitchell', NOW() - INTERVAL '25 days'),
    (gen_random_uuid(), v_user_id, v_tx_11, 'Transaction created',              'Sarah Mitchell', NOW() - INTERVAL '45 days'),
    (gen_random_uuid(), v_user_id, v_tx_11, 'Status changed to Active Listing', 'Sarah Mitchell', NOW() - INTERVAL '40 days'),
    (gen_random_uuid(), v_user_id, v_tx_11, 'Status changed to Pending',        'Sarah Mitchell', NOW() - INTERVAL '30 days'),
    (gen_random_uuid(), v_user_id, v_tx_12, 'Transaction created',              'Sarah Mitchell', NOW() - INTERVAL '40 days'),
    (gen_random_uuid(), v_user_id, v_tx_12, 'Status changed to Active Listing', 'Sarah Mitchell', NOW() - INTERVAL '30 days'),
    (gen_random_uuid(), v_user_id, v_tx_12, 'Status changed to Pending',        'Sarah Mitchell', NOW() - INTERVAL '14 days'),
    (gen_random_uuid(), v_user_id, v_tx_13, 'Transaction created',              'Sarah Mitchell', NOW() - INTERVAL '45 days'),
    (gen_random_uuid(), v_user_id, v_tx_13, 'Status changed to Active Listing', 'Sarah Mitchell', NOW() - INTERVAL '35 days'),
    (gen_random_uuid(), v_user_id, v_tx_13, 'Status changed to Pending',        'Sarah Mitchell', NOW() - INTERVAL '20 days'),
    (gen_random_uuid(), v_user_id, v_tx_14, 'Transaction created',              'Sarah Mitchell', NOW() - INTERVAL '60 days'),
    (gen_random_uuid(), v_user_id, v_tx_14, 'Status changed to Active Listing', 'Sarah Mitchell', NOW() - INTERVAL '50 days'),
    (gen_random_uuid(), v_user_id, v_tx_14, 'Status changed to Pending',        'Sarah Mitchell', NOW() - INTERVAL '32 days');

  -- Closed (full progression)
  INSERT INTO public.transaction_history (id, user_id, transaction_id, description, changed_by, created_at) VALUES
    (gen_random_uuid(), v_user_id, v_tx_15, 'Transaction created',              'Sarah Mitchell', NOW() - INTERVAL '95 days'),
    (gen_random_uuid(), v_user_id, v_tx_15, 'Status changed to Active Listing', 'Sarah Mitchell', NOW() - INTERVAL '85 days'),
    (gen_random_uuid(), v_user_id, v_tx_15, 'Status changed to Pending',        'Sarah Mitchell', NOW() - INTERVAL '65 days'),
    (gen_random_uuid(), v_user_id, v_tx_15, 'Status changed to Closed',         'Sarah Mitchell', NOW() - INTERVAL '25 days'),
    (gen_random_uuid(), v_user_id, v_tx_16, 'Transaction created',              'Sarah Mitchell', NOW() - INTERVAL '110 days'),
    (gen_random_uuid(), v_user_id, v_tx_16, 'Status changed to Active Listing', 'Sarah Mitchell', NOW() - INTERVAL '95 days'),
    (gen_random_uuid(), v_user_id, v_tx_16, 'Status changed to Pending',        'Sarah Mitchell', NOW() - INTERVAL '75 days'),
    (gen_random_uuid(), v_user_id, v_tx_16, 'Status changed to Closed',         'Sarah Mitchell', NOW() - INTERVAL '35 days'),
    (gen_random_uuid(), v_user_id, v_tx_17, 'Transaction created',              'Sarah Mitchell', NOW() - INTERVAL '125 days'),
    (gen_random_uuid(), v_user_id, v_tx_17, 'Status changed to Active Listing', 'Sarah Mitchell', NOW() - INTERVAL '110 days'),
    (gen_random_uuid(), v_user_id, v_tx_17, 'Status changed to Pending',        'Sarah Mitchell', NOW() - INTERVAL '90 days'),
    (gen_random_uuid(), v_user_id, v_tx_17, 'Status changed to Closed',         'Sarah Mitchell', NOW() - INTERVAL '50 days'),
    (gen_random_uuid(), v_user_id, v_tx_18, 'Transaction created',              'Sarah Mitchell', NOW() - INTERVAL '115 days'),
    (gen_random_uuid(), v_user_id, v_tx_18, 'Status changed to Active Listing', 'Sarah Mitchell', NOW() - INTERVAL '100 days'),
    (gen_random_uuid(), v_user_id, v_tx_18, 'Status changed to Pending',        'Sarah Mitchell', NOW() - INTERVAL '80 days'),
    (gen_random_uuid(), v_user_id, v_tx_18, 'Status changed to Closed',         'Sarah Mitchell', NOW() - INTERVAL '40 days');

  -- Cancelled / Expired
  INSERT INTO public.transaction_history (id, user_id, transaction_id, description, changed_by, created_at) VALUES
    (gen_random_uuid(), v_user_id, v_tx_19, 'Transaction created',                       'Sarah Mitchell', NOW() - INTERVAL '190 days'),
    (gen_random_uuid(), v_user_id, v_tx_19, 'Status changed to Active Listing',          'Sarah Mitchell', NOW() - INTERVAL '180 days'),
    (gen_random_uuid(), v_user_id, v_tx_19, 'Status changed to Cancelled / Expired',     'Sarah Mitchell', NOW() - INTERVAL '10 days'),
    (gen_random_uuid(), v_user_id, v_tx_20, 'Transaction created',                       'Sarah Mitchell', NOW() - INTERVAL '75 days'),
    (gen_random_uuid(), v_user_id, v_tx_20, 'Status changed to Active Listing',          'Sarah Mitchell', NOW() - INTERVAL '70 days'),
    (gen_random_uuid(), v_user_id, v_tx_20, 'Status changed to Pending',                 'Sarah Mitchell', NOW() - INTERVAL '60 days'),
    (gen_random_uuid(), v_user_id, v_tx_20, 'Status changed to Cancelled / Expired',     'Sarah Mitchell', NOW() - INTERVAL '20 days');

END
$seed$;

COMMIT;


-- ============================================================================
-- VERIFICATION — run after the migration commits
-- ============================================================================

-- 1. Row counts per table for the demo user:
--
--   SELECT 'agent_settings'      AS tbl, count(*) FROM public.agent_settings      WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429'
--   UNION ALL SELECT 'tc_settings',         count(*) FROM public.tc_settings         WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429'
--   UNION ALL SELECT 'collaborators',       count(*) FROM public.collaborators       WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429'
--   UNION ALL SELECT 'email_templates',     count(*) FROM public.email_templates     WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429'
--   UNION ALL SELECT 'task_templates',      count(*) FROM public.task_templates      WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429'
--   UNION ALL SELECT 'template_tasks',      count(*) FROM public.template_tasks      WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429'
--   UNION ALL SELECT 'transactions',        count(*) FROM public.transactions        WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429'
--   UNION ALL SELECT 'commissions',         count(*) FROM public.commissions         WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429'
--   UNION ALL SELECT 'tasks',               count(*) FROM public.tasks               WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429'
--   UNION ALL SELECT 'transaction_notes',   count(*) FROM public.transaction_notes   WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429'
--   UNION ALL SELECT 'showings',            count(*) FROM public.showings            WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429'
--   UNION ALL SELECT 'transaction_history', count(*) FROM public.transaction_history WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429';
--
--   Expected:
--     agent_settings       1
--     tc_settings          2
--     collaborators       11
--     email_templates      6
--     task_templates       3
--     template_tasks      29
--     transactions        20
--     commissions         20
--     tasks              ~180
--     transaction_notes   11
--     showings             9
--     transaction_history ~55

-- 2. Pipeline snapshot — count by status, should match the spec exactly:
--
--   SELECT status, count(*)
--   FROM public.transactions
--   WHERE user_id = '63578549-0148-49fc-bc4d-59328f047429'
--   GROUP BY status
--   ORDER BY status;
--
--   Expected:
--     active-listing      4
--     cancelled-expired   2
--     closed              4
--     pending             7
--     pre-listing         3

-- 3. Overdue tasks (should be 4):
--
--   SELECT t.title, t.assigned_to, t.due_date, tx.property_address
--   FROM public.tasks t
--   JOIN public.transactions tx ON tx.id = t.transaction_id
--   WHERE t.user_id = '63578549-0148-49fc-bc4d-59328f047429'
--     AND t.status = 'open'
--     AND t.due_date < CURRENT_DATE
--   ORDER BY t.due_date;
