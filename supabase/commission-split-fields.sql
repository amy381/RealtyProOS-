-- Commission fields migration
-- Run in Supabase SQL Editor

ALTER TABLE commissions
  ADD COLUMN IF NOT EXISTS seller_concession_percent   numeric,
  ADD COLUMN IF NOT EXISTS seller_concession_flat      numeric,
  ADD COLUMN IF NOT EXISTS buyer_contribution_percent  numeric,
  ADD COLUMN IF NOT EXISTS buyer_contribution_flat     numeric,
  ADD COLUMN IF NOT EXISTS cap_deduction               boolean,
  ADD COLUMN IF NOT EXISTS royalty_deduction           boolean,
  ADD COLUMN IF NOT EXISTS tc_fee_commission           numeric,
  ADD COLUMN IF NOT EXISTS concessions                 numeric,
  ADD COLUMN IF NOT EXISTS buyer_broker_addendum       boolean;
