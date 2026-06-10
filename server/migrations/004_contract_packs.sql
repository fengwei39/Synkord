-- B7: contract_packs metadata table
CREATE TABLE IF NOT EXISTS contract_packs (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name         VARCHAR(100) NOT NULL,
  version      VARCHAR(50)  NOT NULL DEFAULT '0.0.0',
  owner_email  VARCHAR(255) NOT NULL DEFAULT '',
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_contract_packs_org_id ON contract_packs(org_id);
