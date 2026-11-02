CREATE TABLE IF NOT EXISTS social_product_links (content_id TEXT PRIMARY KEY REFERENCES social_content(id),product_id TEXT NOT NULL REFERENCES market_products(id));
