-- Migration: add push_token column to users table
-- Stores the Expo push token for each device so the server can send
-- friend-request and invitation-accepted push notifications.
-- Safe to re-run (uses IF NOT EXISTS guard).

ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token TEXT;
