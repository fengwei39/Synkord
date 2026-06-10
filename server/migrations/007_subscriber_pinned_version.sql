-- Add pinned_version to subscriptions so we can show whether a subscriber
-- is on the latest pack version.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS pinned_version VARCHAR(50) NOT NULL DEFAULT '';
