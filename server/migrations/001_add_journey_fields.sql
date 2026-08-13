-- Migration: add journey tracking fields to user_habits
-- Applied manually via psql or pool.query before this was automated.
-- Run once on the database; safe to re-run (uses IF NOT EXISTS / DO NOTHING guards).

ALTER TABLE user_habits
  ADD COLUMN IF NOT EXISTS journey_start_date TEXT,
  ADD COLUMN IF NOT EXISTS journey_target_days INTEGER,
  ADD COLUMN IF NOT EXISTS habit_status VARCHAR(32) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS notify_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Back-fill: any existing rows without a status get 'active' and notifications enabled
UPDATE user_habits SET habit_status = 'active'    WHERE habit_status IS NULL;
UPDATE user_habits SET notify_enabled = TRUE       WHERE notify_enabled IS NULL;
-- Mute notifications for already-maintained habits
UPDATE user_habits SET notify_enabled = FALSE      WHERE habit_status = 'maintained';
