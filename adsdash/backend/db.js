// ============================================================
// Database — PostgreSQL connection pool + schema bootstrap
// ============================================================
import pg from 'pg';
import { config } from 'dotenv';
config();

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Run once on startup to create tables if they don't exist
export async function bootstrapSchema() {
  await pool.query(`
    -- Agency users (admins / account managers)
    CREATE TABLE IF NOT EXISTS users (
      id          SERIAL PRIMARY KEY,
      email       TEXT UNIQUE NOT NULL,
      name        TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role        TEXT DEFAULT 'manager',   -- 'admin' | 'manager' | 'viewer'
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    -- Clients managed by the agency
    CREATE TABLE IF NOT EXISTS clients (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      logo_url    TEXT,
      industry    TEXT,
      currency    TEXT DEFAULT 'USD',
      created_by  INT REFERENCES users(id),
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    -- OAuth tokens per client per platform
    CREATE TABLE IF NOT EXISTS platform_connections (
      id                SERIAL PRIMARY KEY,
      client_id         INT REFERENCES clients(id) ON DELETE CASCADE,
      platform          TEXT NOT NULL,  -- 'google_ads' | 'meta_ads'
      access_token      TEXT NOT NULL,
      refresh_token     TEXT,
      token_expires_at  TIMESTAMPTZ,
      account_id        TEXT,           -- Google customer_id or Meta act_XXXXXXX
      account_name      TEXT,
      connected_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(client_id, platform)
    );

    -- Cached metrics snapshots (daily granularity)
    CREATE TABLE IF NOT EXISTS metrics_snapshots (
      id           SERIAL PRIMARY KEY,
      client_id    INT REFERENCES clients(id) ON DELETE CASCADE,
      platform     TEXT NOT NULL,
      date         DATE NOT NULL,
      campaign_id  TEXT,
      campaign_name TEXT,
      impressions  BIGINT DEFAULT 0,
      clicks       BIGINT DEFAULT 0,
      spend        NUMERIC(14,2) DEFAULT 0,
      conversions  NUMERIC(10,2) DEFAULT 0,
      revenue      NUMERIC(14,2) DEFAULT 0,
      raw_data     JSONB,
      fetched_at   TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(client_id, platform, date, campaign_id)
    );

    -- Saved reports
    CREATE TABLE IF NOT EXISTS reports (
      id           SERIAL PRIMARY KEY,
      client_id    INT REFERENCES clients(id) ON DELETE CASCADE,
      created_by   INT REFERENCES users(id),
      title        TEXT NOT NULL,
      description  TEXT,
      config       JSONB NOT NULL,   -- widget layout, date ranges, metrics selected
      is_public    BOOLEAN DEFAULT FALSE,
      public_token TEXT UNIQUE,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_client_date ON metrics_snapshots(client_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_snapshots_platform    ON metrics_snapshots(platform);
  `);
  console.log('✅ Database schema bootstrapped');
}
