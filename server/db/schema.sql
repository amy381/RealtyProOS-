-- RealtyPro OS — full schema
-- Run this entire file in Supabase Dashboard → SQL Editor → New query

-- ─── Drop existing tables (order matters for FK) ─────────────────────────────
drop table if exists public.commissions;
drop table if exists public.transactions;

-- ─── Transactions ────────────────────────────────────────────────────────────
create table public.transactions (
  id uuid default gen_random_uuid() primary key,

  -- Core
  property_address  text,
  client_name       text,
  price             numeric,
  status            text not null default 'pre-listing',
  rep_type          text,
  assigned_tc       text,
  co_op_agent       text,
  lender_name       text,
  title_company     text,
  notes             text,

  -- Primary client contact
  client_first_name text,
  client_last_name  text,
  client_phone      text,
  client_email      text,

  -- Secondary client contact
  client2_first_name text,
  client2_last_name  text,
  client2_phone      text,
  client2_email      text,

  -- Date fields
  bba_contract             date,
  bba_expiration           date,
  close_of_escrow          date,
  contract_acceptance_date date,
  ipe_date                 date,
  listing_contract         date,
  listing_expiration_date  date,
  target_live_date         date,
  nda_expires              date,
  photography_date         date,

  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint valid_status check (status in (
    'buyer-broker', 'pre-listing', 'active-listing',
    'pending', 'closed', 'cancelled-expired'
  ))
);

-- ─── Commissions (one row per transaction) ───────────────────────────────────
create table public.commissions (
  id               uuid default gen_random_uuid() primary key,
  transaction_id   uuid not null references public.transactions(id) on delete cascade,
  commission_rate  text,       -- '3' (percent) or '$1500' (flat fee)
  ref_percent      numeric,
  tc_fee           numeric,
  commission_status text default 'Pending',

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(transaction_id)
);

-- ─── Row Level Security ──────────────────────────────────────────────────────
alter table public.transactions enable row level security;
alter table public.commissions  enable row level security;

-- Full access via anon key (single-user tool; add auth later if needed)
create policy "anon full access" on public.transactions
  for all to anon using (true) with check (true);

create policy "anon full access" on public.commissions
  for all to anon using (true) with check (true);

-- ─── Auto-update updated_at ──────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_transactions_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

create trigger trg_commissions_updated_at
  before update on public.commissions
  for each row execute function public.set_updated_at();

-- ─── Tasks ───────────────────────────────────────────────────────────────────
create table public.tasks (
  id             uuid default gen_random_uuid() primary key,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  title          text not null default '',
  due_date       date,
  assigned_to    text default 'Me',
  status         text default 'open' check (status in ('open', 'complete')),
  notes          text default '',
  sort_order     integer default 0,
  template_key   text,
  notified_mentions text[] default '{}',

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index tasks_transaction_id_idx on public.tasks(transaction_id);

alter table public.tasks enable row level security;

create policy "anon full access" on public.tasks
  for all to anon using (true) with check (true);

create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ─── TC Settings (email addresses for team members) ──────────────────────────
create table public.tc_settings (
  id         uuid default gen_random_uuid() primary key,
  name       text unique not null,
  email      text default '',
  updated_at timestamptz default now()
);

alter table public.tc_settings enable row level security;

create policy "anon full access" on public.tc_settings
  for all to anon using (true) with check (true);

-- Seed default team members (safe to re-run)
insert into public.tc_settings (name, email) values
  ('Me', ''),
  ('Justina Morris', ''),
  ('Victoria Lareau', '')
on conflict (name) do nothing;
