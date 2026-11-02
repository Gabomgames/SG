CREATE TABLE IF NOT EXISTS api_limits (
 bucket TEXT NOT NULL,key TEXT NOT NULL,period TEXT NOT NULL,count INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(bucket,key,period)
);
CREATE INDEX IF NOT EXISTS api_limit_period ON api_limits(period);
