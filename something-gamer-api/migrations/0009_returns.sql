CREATE TABLE IF NOT EXISTS market_delivery_receipts (order_id TEXT PRIMARY KEY REFERENCES market_orders(id),delivered_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS market_returns (
 order_id TEXT PRIMARY KEY REFERENCES market_orders(id),buyer_uid TEXT NOT NULL,reason TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'requested' CHECK(state IN ('requested','approved','rejected','in_transit','received','refunded')),
 tracking TEXT NOT NULL DEFAULT '',decision_reason TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS market_dispute_context (order_id TEXT PRIMARY KEY REFERENCES market_orders(id),prior_state TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS market_dispute_decisions (order_id TEXT PRIMARY KEY REFERENCES market_orders(id),actor_uid TEXT NOT NULL,decision TEXT NOT NULL CHECK(decision IN ('resume','refunded')),reason TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TRIGGER IF NOT EXISTS dispute_decision_valid BEFORE INSERT ON market_dispute_decisions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM market_orders WHERE id=NEW.order_id AND ((NEW.decision='resume' AND state='disputed') OR (NEW.decision='refunded' AND state='refunded'))) THEN RAISE(ABORT,'DISPUTE_STATE_CONFLICT') END;
END;
