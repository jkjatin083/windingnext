-- WhatsApp alerts. Run once in the Neon SQL editor. Only NEW tables; nothing existing is changed.
-- Safe to run twice.

CREATE TABLE IF NOT EXISTS wa_alert_settings (
  id int PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,     -- master switch (new alerts are only queued when ON)
  test_mode boolean NOT NULL DEFAULT true,    -- ON = every alert goes only to test_phone
  test_phone text,
  expire_minutes int NOT NULL DEFAULT 2880,   -- alert older than this is not sent (PC was off). 2880 = 48 h,
                                              -- long enough for night entries (9 PM-9 AM) and a Sunday off
  monthly_cap int NOT NULL DEFAULT 1500,      -- safety limit on sent alerts per month
  sender_seen timestamptz,                    -- last time the computer program checked in
  poll_seconds int                            -- the check-in rhythm it reported (so "connected" is judged fairly)
);
INSERT INTO wa_alert_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS wa_contacts (
  name text PRIMARY KEY,
  phone text,
  alerts_on boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS wa_outbox (
  id bigserial PRIMARY KEY,
  entry_id bigint NOT NULL,                   -- 0 for a test message
  event text NOT NULL,                        -- made | given | test | edited | deleted
  recipient text NOT NULL,                    -- person name
  status text NOT NULL DEFAULT 'queued',      -- queued sending sent delivered failed unsure expired no_number cancelled
  kind text,
  contractor text,
  party text,
  wtype text,                                 -- winding type shown in the message
  qty numeric,
  d date,
  bal_after numeric,                          -- contractor's stock in hand after this entry/change
  old_qty numeric,                            -- edited messages: quantity before the correction
  old_d date,                                 -- edited messages: date before the correction
  wa_message_id text,
  attempts int NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz
);
-- one alert per entry per person for the original made/given alerts. Edit and delete
-- messages may repeat for the same entry by design (each correction is one message).
DROP INDEX IF EXISTS wa_outbox_one_per_entry;
CREATE UNIQUE INDEX wa_outbox_one_per_entry ON wa_outbox (entry_id, event, recipient) WHERE entry_id > 0 AND event IN ('made','given');
CREATE INDEX IF NOT EXISTS wa_outbox_status ON wa_outbox (status, id);
CREATE INDEX IF NOT EXISTS wa_outbox_msgid ON wa_outbox (wa_message_id);

-- For databases created with the first version of this file (added later).
-- Safe on a fresh install too, because the columns/index above already match.
ALTER TABLE wa_outbox ADD COLUMN IF NOT EXISTS old_qty numeric;
ALTER TABLE wa_outbox ADD COLUMN IF NOT EXISTS old_d date;
DROP INDEX IF EXISTS wa_outbox_one_per_entry;
CREATE UNIQUE INDEX wa_outbox_one_per_entry ON wa_outbox (entry_id, event, recipient) WHERE entry_id > 0 AND event IN ('made','given');
