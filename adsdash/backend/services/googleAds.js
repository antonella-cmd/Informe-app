// ============================================================
// Google Ads Service
// Uses google-ads-api (Node client for Google Ads API v17)
// ============================================================
import { GoogleAdsApi } from 'google-ads-api';
import { OAuth2Client } from 'google-auth-library';
import { pool } from '../db.js';
import { config } from 'dotenv';
config();

// ── OAuth2 client ──────────────────────────────────────────
export function getOAuthClient() {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI   // e.g. http://localhost:4000/api/auth/google/callback
  );
}

export function getAuthUrl() {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/adwords',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  });
}

// Exchange auth code → tokens, save to DB
export async function exchangeCodeAndSave(code, clientId) {
  const oauth = getOAuthClient();
  const { tokens } = await oauth.getToken(code);

  // Fetch accessible Google Ads accounts
  oauth.setCredentials(tokens);
  const api = new GoogleAdsApi({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    developer_token: process.env.GOOGLE_DEVELOPER_TOKEN,
  });

  const customer = api.Customer({
    customer_id:   'customers',   // list accessible
    refresh_token: tokens.refresh_token,
  });

  // Save connection
  await pool.query(`
    INSERT INTO platform_connections
      (client_id, platform, access_token, refresh_token, token_expires_at)
    VALUES ($1, 'google_ads', $2, $3, $4)
    ON CONFLICT (client_id, platform) DO UPDATE SET
      access_token    = EXCLUDED.access_token,
      refresh_token   = EXCLUDED.refresh_token,
      token_expires_at = EXCLUDED.token_expires_at
  `, [clientId, tokens.access_token, tokens.refresh_token,
      new Date(tokens.expiry_date)]);

  return tokens;
}

// ── Build authenticated API customer ──────────────────────
async function getCustomer(clientId, accountId) {
  const { rows } = await pool.query(
    `SELECT * FROM platform_connections WHERE client_id = $1 AND platform = 'google_ads'`,
    [clientId]
  );
  if (!rows.length) throw new Error('Google Ads not connected for this client');
  const conn = rows[0];

  const api = new GoogleAdsApi({
    client_id:       process.env.GOOGLE_CLIENT_ID,
    client_secret:   process.env.GOOGLE_CLIENT_SECRET,
    developer_token: process.env.GOOGLE_DEVELOPER_TOKEN,
  });

  return api.Customer({
    customer_id:   accountId || conn.account_id,
    refresh_token: conn.refresh_token,
    login_customer_id: process.env.GOOGLE_MCC_ID,   // Manager Account (MCC)
  });
}

// ── Fetch campaigns with metrics ──────────────────────────
export async function fetchCampaignMetrics(clientId, { startDate, endDate, accountId }) {
  const customer = await getCustomer(clientId, accountId);

  const rows = await customer.query(`
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_per_conversion
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `);

  return rows.map(r => ({
    id:           r.campaign.id,
    name:         r.campaign.name,
    status:       r.campaign.status,
    channel:      r.campaign.advertising_channel_type,
    impressions:  Number(r.metrics.impressions),
    clicks:       Number(r.metrics.clicks),
    spend:        Number(r.metrics.cost_micros) / 1_000_000,
    conversions:  Number(r.metrics.conversions),
    revenue:      Number(r.metrics.conversions_value),
    ctr:          Number(r.metrics.ctr) * 100,
    avg_cpc:      Number(r.metrics.average_cpc) / 1_000_000,
    cpa:          Number(r.metrics.cost_per_conversion) / 1_000_000,
    roas:         r.metrics.conversions_value > 0
                    ? (Number(r.metrics.conversions_value) / (Number(r.metrics.cost_micros) / 1_000_000))
                    : 0,
    platform:     'google_ads',
  }));
}

// ── Daily time-series (for charts) ────────────────────────
export async function fetchDailyTimeSeries(clientId, { startDate, endDate, accountId }) {
  const customer = await getCustomer(clientId, accountId);

  const rows = await customer.query(`
    SELECT
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM customer
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    ORDER BY segments.date
  `);

  return rows.map(r => ({
    date:        r.segments.date,
    impressions: Number(r.metrics.impressions),
    clicks:      Number(r.metrics.clicks),
    spend:       Number(r.metrics.cost_micros) / 1_000_000,
    conversions: Number(r.metrics.conversions),
    revenue:     Number(r.metrics.conversions_value),
    platform:    'google_ads',
  }));
}

// ── Account summary (KPIs) ────────────────────────────────
export async function fetchAccountSummary(clientId, { startDate, endDate, accountId }) {
  const rows = await fetchDailyTimeSeries(clientId, { startDate, endDate, accountId });
  return rows.reduce((acc, r) => ({
    impressions: acc.impressions + r.impressions,
    clicks:      acc.clicks      + r.clicks,
    spend:       acc.spend       + r.spend,
    conversions: acc.conversions + r.conversions,
    revenue:     acc.revenue     + r.revenue,
  }), { impressions: 0, clicks: 0, spend: 0, conversions: 0, revenue: 0 });
}

// ── List accessible accounts (for initial setup) ──────────
export async function listAccessibleAccounts(refreshToken) {
  const api = new GoogleAdsApi({
    client_id:       process.env.GOOGLE_CLIENT_ID,
    client_secret:   process.env.GOOGLE_CLIENT_SECRET,
    developer_token: process.env.GOOGLE_DEVELOPER_TOKEN,
  });
  const customer = api.Customer({ refresh_token: refreshToken, customer_id: process.env.GOOGLE_MCC_ID });
  const rows = await customer.query(`
    SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code
    FROM customer_client WHERE customer_client.manager = false
  `);
  return rows.map(r => ({
    id:       r.customer_client.id,
    name:     r.customer_client.descriptive_name,
    currency: r.customer_client.currency_code,
  }));
}
