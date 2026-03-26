-- Run this in the Supabase SQL editor to enable the Notify diff feature.

create table if not exists notify_snapshots (
  id             uuid        primary key default gen_random_uuid(),
  transaction_id uuid        not null references transactions(id) on delete cascade,
  sent_at        timestamptz not null default now(),
  snapshot       jsonb       not null
);

create index if not exists notify_snapshots_tx_idx
  on notify_snapshots (transaction_id, sent_at desc);
