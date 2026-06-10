-- Add rich metadata to subscriptions so the subscriber list can show
-- device, git, and project information for each member.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS device_info   JSONB,
  ADD COLUMN IF NOT EXISTS git_info      JSONB,
  ADD COLUMN IF NOT EXISTS project_names TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW();
