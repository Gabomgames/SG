-- Aplicar somente a um D1 explicitamente escolhido; nenhuma migração de KV automática.
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY, uid TEXT NOT NULL, client_key TEXT NOT NULL,
  plan TEXT NOT NULL, days INTEGER NOT NULL, amount_cents INTEGER NOT NULL,
  reference TEXT NOT NULL UNIQUE, order_id TEXT UNIQUE, checkout_url TEXT,
  state TEXT NOT NULL DEFAULT 'created', review TEXT NOT NULL DEFAULT 'none',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  approved_at INTEGER, expires_at INTEGER, reviewed_by TEXT, review_reason TEXT,
  mirror_pending INTEGER NOT NULL DEFAULT 0,
  UNIQUE(uid, client_key), CHECK(amount_cents > 0), CHECK(days > 0),
  CHECK(state IN ('created','pending','approved','cancelled','revoked')),
  CHECK(review IN ('none','pending','approved','rejected'))
);
CREATE INDEX IF NOT EXISTS payments_user ON payments(uid, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_reconcile ON payments(state, updated_at);
CREATE TABLE IF NOT EXISTS payment_events (
  event_key TEXT PRIMARY KEY, order_id TEXT NOT NULL,
  state TEXT NOT NULL, received_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_audit (
  id TEXT PRIMARY KEY, actor_uid TEXT NOT NULL, action TEXT NOT NULL,
  target_id TEXT NOT NULL, result TEXT NOT NULL, created_at INTEGER NOT NULL
);
-- Imutabilidade pela API; operadores do banco ainda precisam de controles do provedor.
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON admin_audit BEGIN SELECT RAISE(ABORT, 'immutable audit'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON admin_audit BEGIN SELECT RAISE(ABORT, 'immutable audit'); END;
