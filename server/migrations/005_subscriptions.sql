-- B9: subscriptions and notifications
CREATE TABLE IF NOT EXISTS subscriptions (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id         UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pack_name      VARCHAR(100) NOT NULL,
  project_name   VARCHAR(100) NOT NULL DEFAULT '',
  pinned_version VARCHAR(50)  NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, org_id, pack_name, project_name)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_pack ON subscriptions(org_id, pack_name);

CREATE TABLE IF NOT EXISTS notifications (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id       UUID         NOT NULL,
  pack_name    VARCHAR(100) NOT NULL,
  old_version  VARCHAR(50),
  new_version  VARCHAR(50)  NOT NULL,
  diff_summary JSONB,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
