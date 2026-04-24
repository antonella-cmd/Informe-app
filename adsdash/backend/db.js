// ============================================================
// db.js — PostgreSQL connection + schema unificado PTI Analytics
// ============================================================
import pg from 'pg';
import { config } from 'dotenv';
config();

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function bootstrapSchema() {
  await pool.query(`
    -- ── Usuarios ──────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT DEFAULT 'editor',  -- 'admin' | 'editor' | 'viewer'
      avatar_url    TEXT,
      invite_token  TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );

    -- ── Clientes ──────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS clients (
      id           SERIAL PRIMARY KEY,
      name         TEXT NOT NULL,
      company      TEXT,
      country      TEXT DEFAULT 'AR',
      logo_url     TEXT,
      industry     TEXT,
      currency     TEXT DEFAULT 'USD',
      created_by   INT REFERENCES users(id),
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );

    -- Agregar columnas nuevas si no existen (para repos que ya tienen clients)
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS company  TEXT;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS country  TEXT DEFAULT 'AR';
    ALTER TABLE users   ADD COLUMN IF NOT EXISTS role     TEXT DEFAULT 'editor';
    ALTER TABLE users   ADD COLUMN IF NOT EXISTS avatar_url  TEXT;
    ALTER TABLE users   ADD COLUMN IF NOT EXISTS invite_token TEXT;

    -- ── Relación clientes-usuarios (viewers) ──────────────────
    CREATE TABLE IF NOT EXISTS client_users (
      id         SERIAL PRIMARY KEY,
      client_id  INT REFERENCES clients(id) ON DELETE CASCADE,
      user_id    INT REFERENCES users(id)   ON DELETE CASCADE,
      UNIQUE(client_id, user_id)
    );

    -- ── Conexiones OAuth por plataforma ───────────────────────
    CREATE TABLE IF NOT EXISTS platform_connections (
      id               SERIAL PRIMARY KEY,
      client_id        INT REFERENCES clients(id) ON DELETE CASCADE,
      platform         TEXT NOT NULL,  -- 'google_ads' | 'meta_ads'
      access_token     TEXT NOT NULL,
      refresh_token    TEXT,
      token_expires_at TIMESTAMPTZ,
      account_id       TEXT,
      account_name     TEXT,
      connected_at     TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(client_id, platform)
    );

    -- ── Cuentas de ads ────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS ad_accounts (
      id           SERIAL PRIMARY KEY,
      client_id    INT REFERENCES clients(id) ON DELETE CASCADE,
      platform     TEXT NOT NULL,
      account_id   TEXT NOT NULL,
      account_name TEXT,
      currency     TEXT DEFAULT 'USD',
      timezone     TEXT,
      is_active    BOOLEAN DEFAULT TRUE,
      UNIQUE(client_id, platform, account_id)
    );

    -- ── Campañas ──────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS campaigns (
      id                   SERIAL PRIMARY KEY,
      ad_account_id        INT REFERENCES ad_accounts(id) ON DELETE CASCADE,
      platform_campaign_id TEXT NOT NULL,
      name                 TEXT NOT NULL,
      status               TEXT DEFAULT 'active',
      objective            TEXT DEFAULT 'general',
      budget_daily         NUMERIC(14,2),
      budget_total         NUMERIC(14,2),
      start_date           DATE,
      end_date             DATE,
      synced_at            TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(ad_account_id, platform_campaign_id)
    );

    -- ── Métricas diarias de campañas ──────────────────────────
    CREATE TABLE IF NOT EXISTS campaign_metrics (
      id            SERIAL PRIMARY KEY,
      campaign_id   INT REFERENCES campaigns(id) ON DELETE CASCADE,
      date          DATE NOT NULL,
      impressions   BIGINT  DEFAULT 0,
      clicks        BIGINT  DEFAULT 0,
      spend         NUMERIC(14,2) DEFAULT 0,
      conversions   NUMERIC(10,2) DEFAULT 0,
      revenue       NUMERIC(14,2) DEFAULT 0,
      ctr           NUMERIC(8,4)  DEFAULT 0,
      cpc           NUMERIC(10,4) DEFAULT 0,
      cpm           NUMERIC(10,4) DEFAULT 0,
      roas          NUMERIC(10,4) DEFAULT 0,
      cpa           NUMERIC(10,4) DEFAULT 0,
      reach         BIGINT  DEFAULT 0,
      frequency     NUMERIC(8,4)  DEFAULT 0,
      purchases             NUMERIC(10,2) DEFAULT 0,
      add_to_cart           NUMERIC(10,2) DEFAULT 0,
      checkout_initiated    NUMERIC(10,2) DEFAULT 0,
      fetched_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(campaign_id, date)
    );

    -- ── Snapshots legacy (mantener compatibilidad) ─────────────
    CREATE TABLE IF NOT EXISTS metrics_snapshots (
      id            SERIAL PRIMARY KEY,
      client_id     INT REFERENCES clients(id) ON DELETE CASCADE,
      platform      TEXT NOT NULL,
      date          DATE NOT NULL,
      campaign_id   TEXT,
      campaign_name TEXT,
      impressions   BIGINT DEFAULT 0,
      clicks        BIGINT DEFAULT 0,
      spend         NUMERIC(14,2) DEFAULT 0,
      conversions   NUMERIC(10,2) DEFAULT 0,
      revenue       NUMERIC(14,2) DEFAULT 0,
      raw_data      JSONB,
      fetched_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(client_id, platform, date, campaign_id)
    );

    -- ── Reportes ──────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS reports (
      id                SERIAL PRIMARY KEY,
      client_id         INT REFERENCES clients(id) ON DELETE CASCADE,
      created_by_user_id INT REFERENCES users(id),
      created_by        INT REFERENCES users(id),  -- alias legacy
      name              TEXT,
      title             TEXT,                       -- alias legacy
      description       TEXT,
      config_json       JSONB DEFAULT '{}',
      config            JSONB DEFAULT '{}',         -- alias legacy
      share_token       TEXT UNIQUE,
      share_expires_at  TIMESTAMPTZ,
      is_public         BOOLEAN DEFAULT FALSE,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      last_run_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    );

    -- Agregar columnas nuevas a reports si no existen
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS created_by_user_id INT REFERENCES users(id);
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS name              TEXT;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS config_json       JSONB DEFAULT '{}';
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS share_token       TEXT;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS share_expires_at  TIMESTAMPTZ;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS last_run_at       TIMESTAMPTZ DEFAULT NOW();

    -- ── Sync logs ─────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS sync_logs (
      id              SERIAL PRIMARY KEY,
      client_id       INT REFERENCES clients(id) ON DELETE CASCADE,
      platform        TEXT NOT NULL,
      status          TEXT NOT NULL,  -- 'success' | 'error'
      records_synced  INT DEFAULT 0,
      error_msg       TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    -- ── Índices ───────────────────────────────────────────────
    CREATE INDEX IF NOT EXISTS idx_snapshots_client_date   ON metrics_snapshots(client_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_snapshots_platform      ON metrics_snapshots(platform);
    CREATE INDEX IF NOT EXISTS idx_campaign_metrics_date   ON campaign_metrics(campaign_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_campaigns_account       ON campaigns(ad_account_id);
    CREATE INDEX IF NOT EXISTS idx_ad_accounts_client      ON ad_accounts(client_id);
  `);
  console.log('✅ PTI Analytics — Database schema bootstrapped');
}
