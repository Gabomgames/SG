CREATE TABLE IF NOT EXISTS market_products (
 id TEXT PRIMARY KEY, seller_uid TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
 category TEXT NOT NULL, condition TEXT NOT NULL, image_url TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '',
 price_cents INTEGER NOT NULL CHECK(price_cents BETWEEN 1 AND 5000000),
 stock INTEGER NOT NULL CHECK(stock >= 0), reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved >= 0 AND reserved <= stock),
 shipping_cents INTEGER NOT NULL DEFAULT 0 CHECK(shipping_cents BETWEEN 0 AND 100000),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft','active','paused','removed')),
 return_policy TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS market_catalog ON market_products(status,created_at DESC,id);
CREATE TABLE IF NOT EXISTS market_offers (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES market_products(id), buyer_uid TEXT NOT NULL, seller_uid TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 20),
 state TEXT NOT NULL DEFAULT 'proposed' CHECK(state IN ('proposed','countered','accepted','rejected','consumed')),
 last_actor TEXT NOT NULL, expires_at INTEGER NOT NULL, order_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, mirror_pending INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS market_orders (
 id TEXT PRIMARY KEY, buyer_uid TEXT NOT NULL, seller_uid TEXT NOT NULL, client_key TEXT NOT NULL, request_hash TEXT NOT NULL DEFAULT '',
 subtotal_cents INTEGER NOT NULL CHECK(subtotal_cents > 0), shipping_cents INTEGER NOT NULL CHECK(shipping_cents >= 0),
 commission_cents INTEGER NOT NULL CHECK(commission_cents >= 0 AND commission_cents <= subtotal_cents),
 total_cents INTEGER NOT NULL CHECK(total_cents = subtotal_cents + shipping_cents),
 state TEXT NOT NULL DEFAULT 'awaiting_payment',
 preference_id TEXT UNIQUE, checkout_url TEXT, payment_id TEXT UNIQUE, tracking TEXT NOT NULL DEFAULT '',
 expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(buyer_uid,client_key),
 CHECK(state IN ('awaiting_payment','paid','packing','shipped','delivered','cancelled','refunded','disputed'))
);
CREATE TABLE IF NOT EXISTS market_order_items (
 order_id TEXT NOT NULL REFERENCES market_orders(id), product_id TEXT NOT NULL REFERENCES market_products(id),
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 20), unit_cents INTEGER NOT NULL CHECK(unit_cents > 0), title TEXT NOT NULL,
 offer_id TEXT REFERENCES market_offers(id), PRIMARY KEY(order_id,product_id)
);
CREATE TRIGGER IF NOT EXISTS market_reserve_check BEFORE INSERT ON market_order_items BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM market_products p JOIN market_orders o ON o.id=NEW.order_id
  WHERE p.id=NEW.product_id AND p.status='active' AND p.seller_uid=o.seller_uid AND p.seller_uid<>o.buyer_uid
  AND p.stock-p.reserved>=NEW.quantity
  AND ((NEW.offer_id IS NULL AND p.price_cents=NEW.unit_cents) OR EXISTS (
   SELECT 1 FROM market_offers f WHERE f.id=NEW.offer_id AND f.product_id=p.id AND f.buyer_uid=o.buyer_uid
    AND f.seller_uid=p.seller_uid AND f.quantity=NEW.quantity AND f.amount_cents=NEW.unit_cents
    AND f.state='accepted' AND f.order_id IS NULL AND f.expires_at>o.created_at
  ))
 ) THEN RAISE(ABORT,'MARKET_STOCK_OR_QUOTE_CONFLICT') END;
END;
CREATE TRIGGER IF NOT EXISTS market_reserve AFTER INSERT ON market_order_items BEGIN
 UPDATE market_products SET reserved=reserved+NEW.quantity WHERE id=NEW.product_id;
 UPDATE market_offers SET state='consumed',order_id=NEW.order_id,mirror_pending=1,last_actor=(SELECT buyer_uid FROM market_orders WHERE id=NEW.order_id),updated_at=(SELECT created_at FROM market_orders WHERE id=NEW.order_id) WHERE id=NEW.offer_id;
END;
CREATE TRIGGER IF NOT EXISTS market_paid AFTER UPDATE OF state ON market_orders
 WHEN OLD.state='awaiting_payment' AND NEW.state='paid' BEGIN
 UPDATE market_products SET stock=stock-(SELECT quantity FROM market_order_items WHERE order_id=NEW.id AND product_id=market_products.id),
  reserved=reserved-(SELECT quantity FROM market_order_items WHERE order_id=NEW.id AND product_id=market_products.id)
 WHERE id IN (SELECT product_id FROM market_order_items WHERE order_id=NEW.id);
END;
CREATE TRIGGER IF NOT EXISTS market_release AFTER UPDATE OF state ON market_orders
 WHEN OLD.state='awaiting_payment' AND NEW.state IN ('cancelled','refunded','disputed') BEGIN
 UPDATE market_products SET reserved=reserved-(SELECT quantity FROM market_order_items WHERE order_id=NEW.id AND product_id=market_products.id)
 WHERE id IN (SELECT product_id FROM market_order_items WHERE order_id=NEW.id);
END;
CREATE TABLE IF NOT EXISTS market_reviews (
 order_id TEXT PRIMARY KEY REFERENCES market_orders(id), buyer_uid TEXT NOT NULL, seller_uid TEXT NOT NULL,
 rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), comment TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS review_eligible BEFORE INSERT ON market_reviews BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM market_orders WHERE id=NEW.order_id AND buyer_uid=NEW.buyer_uid
  AND seller_uid=NEW.seller_uid AND state='delivered') THEN RAISE(ABORT,'REVIEW_NOT_ELIGIBLE') END;
END;
CREATE TABLE IF NOT EXISTS market_disputes (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE REFERENCES market_orders(id), opened_by TEXT NOT NULL,
 reason TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'open', resolution TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS seller_accounts (
 uid TEXT PRIMARY KEY, collector_id TEXT NOT NULL UNIQUE, encrypted_credentials TEXT NOT NULL,
 expires_at INTEGER NOT NULL, mode TEXT NOT NULL CHECK(mode IN ('test','production')), updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS seller_oauth (
 state_hash TEXT PRIMARY KEY, uid TEXT NOT NULL, verifier TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER
);
CREATE TABLE IF NOT EXISTS market_payment_events (
 event_key TEXT PRIMARY KEY, order_id TEXT NOT NULL, status TEXT NOT NULL, received_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS market_refunds (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE REFERENCES market_orders(id), requested_by TEXT NOT NULL,
 reason TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'requested', provider_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
