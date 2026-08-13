-- Migration: create invite_links table for short invite URLs
-- Stores server-generated 8-char codes that map to an inviting user.
-- GET /i/:code resolves the code and redirects to the invite landing page.
-- Safe to re-run (uses IF NOT EXISTS guards).

CREATE TABLE IF NOT EXISTS invite_links (
  code          VARCHAR(12)  PRIMARY KEY,
  inviter_user_id VARCHAR     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMP    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invite_links_inviter_idx ON invite_links(inviter_user_id);
