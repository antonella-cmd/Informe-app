// ============================================================
// services/googleAds.js — con timeout para evitar bloqueos
// ============================================================
import { GoogleAdsApi } from 'google-ads-api';
import { OAuth2Client } from 'google-auth-library';
import { pool } from '../db.js';
import { config } from 'dotenv';
config();

export function getOAuthClient() {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl(clientId) {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/adwords'],
    state: `clientId:${clientId}`,
  });
}

export async function exchangeCodeAndSave(code, clientId) {
  const oauth = getOAuthClient();
  const { tokens } = await oauth.getToken(code);

  await pool.query(`
    INSERT INTO platform_connections
      (client_id, platform, access_token, refresh_token, token_expires_at, account_id, account_name)
    VALUES ($1, 'google_ads', $2, $3, $4, $5, $6)
    ON CONFLICT (client_id, platform) DO UPDATE SET
      access_token     = EXCLUDED.access_token,
      refresh_token    = COALESCE(EXCLUDED.refresh_token, platform_connections.refresh_token),
      token_expires_at = EXCLUDED.token_expires_at
  `, [clientId, tokens.access_token, tokens.refresh_token,
      tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      null, null]);

  return { tokens };
}

// Wrapper con timeout — evita que Google bloquee el dashboard
function withTimeout(promise, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Google Ads timeout after ${ms}ms`)), ms)
    ),
  ]);
}

async function getCustomer(clientId) {
  const { rows } = await pool.query(
    `SELECT * FROM platform_connections WHERE client_id=$1 AND platform='google_ads'`,
    [clientId]
  );
  if (!rows.length) throw new Error('Google Ads no conectado');

  const conn  = rows[0];
  const mccId = process.env.GOOGLE_MCC_ID;

  if (!conn.account_id) throw new Error('No hay account_id. Reconectá Google Ads.');

  const api = new GoogleAdsApi({
    client_id:       process.env.GOOGLE_CLIENT_ID,
    client_secret:   process.env.GOOGLE_CLIENT_SECRET,
    developer_token: process.env.GOOGLE_DEVELOPER_TOKEN,
  });

  const cfg = {
    customer_id:   conn.account_id.replace(/-/g, ''),
    refresh_token: conn.refresh_token,
  };
  if (mccId) cfg.login_customer_id = mccId.replace(/-/g, '');

  return api.Customer(cfg);
}

export async function fetchAccountSummary(clientId, { startDate, endDate }) {
  return withTimeout(async () => {
    const customer = await getCustomer(clientId);
    const rows = await customer.query(`
      SELECT metrics.impressions, metrics.clicks, metrics.cost_micros,
             metrics.conversions, metrics.conversions_value
      FROM customer
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    `);
    return rows.reduce((acc, r) => ({
      impressions: acc.impressions + Number(r.metrics.impressions || 0),
      clicks:      acc.clicks      + Number(r.metrics.clicks      || 0),
      spend:       acc.spend       + Number(r.metrics.cost_micros || 0) / 1_000_000,
      conversions: acc.conversions + Number(r.metrics.conversions || 0),
      revenue:     acc.revenue     + Number(r.metrics.conversions_value || 0),
    }), { impressions: 0, clicks: 0, spend: 0, conversions: 0, revenue: 0 });
  }(), 8000);
}

export async function fetchCampaignMetrics(clientId, { startDate, endDate }) {
  return withTimeout(async () => {
    const customer = await getCustomer(clientId);
    const rows = await customer.query(`
      SELECT campaign.id, campaign.name, campaign.status,
             metrics.impressions, metrics.clicks, metrics.cost_micros,
             metrics.conversions, metrics.conversions_value, metrics.ctr,
             metrics.average_cpc, metrics.cost_per_conversion
      FROM campaign
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
        AND campaign.status != 'REMOVED'
      ORDER BY metrics.cost_micros DESC
      LIMIT 50
    `);
    return rows.map(r => ({
      id:          String(r.campaign.id),
      name:        r.campaign.name,
      status:      r.campaign.status?.toLowerCase(),
      platform:    'google_ads',
      impressions: Number(r.metrics.impressions || 0),
      clicks:      Number(r.metrics.clicks      || 0),
      spend:       Number(r.metrics.cost_micros || 0) / 1_000_000,
      conversions: Number(r.metrics.conversions || 0),
      revenue:     Number(r.metrics.conversions_value || 0),
      ctr:         Number(r.metrics.ctr         || 0) * 100,
      cpc:         Number(r.metrics.average_cpc || 0) / 1_000_000,
      cpa:         Number(r.metrics.cost_per_conversion || 0) / 1_000_000,
      roas:        Number(r.metrics.cost_micros) > 0
                     ? Number(r.metrics.conversions_value) / (Number(r.metrics.cost_micros) / 1_000_000)
                     : 0,
    }));
  }(), 8000);
}

export async function fetchDailyTimeSeries(clientId, { startDate, endDate }) {
  return withTimeout(async () => {
    const customer = await getCustomer(clientId);
    const rows = await customer.query(`
      SELECT segments.date, metrics.impressions, metrics.clicks,
             metrics.cost_micros, metrics.conversions, metrics.conversions_value
      FROM customer
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      ORDER BY segments.date
    `);
    return rows.map(r => ({
      date:        r.segments.date,
      impressions: Number(r.metrics.impressions        || 0),
      clicks:      Number(r.metrics.clicks             || 0),
      spend:       Number(r.metrics.cost_micros        || 0) / 1_000_000,
      conversions: Number(r.metrics.conversions        || 0),
      revenue:     Number(r.metrics.conversions_value  || 0),
      platform:    'google_ads',
    }));
  }(), 8000);
}

export async function listAccessibleAccounts(refreshToken) {
  const mccId = process.env.GOOGLE_MCC_ID;
  const api = new GoogleAdsApi({
    client_id:       process.env.GOOGLE_CLIENT_ID,
    client_secret:   process.env.GOOGLE_CLIENT_SECRET,
    developer_token: process.env.GOOGLE_DEVELOPER_TOKEN,
  });
  if (mccId) {
    const customer = api.Customer({ customer_id: mccId.replace(/-/g,''), refresh_token: refreshToken });
    const rows = await customer.query(`
      SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code
      FROM customer_client
      WHERE customer_client.manager = false AND customer_client.status = 'ENABLED'
    `);
    return rows.map(r => ({ id: String(r.customer_client.id), name: r.customer_client.descriptive_name, currency: r.customer_client.currency_code }));
  }
  return [];
}

export async function updateAccountId(clientId, accountId, accountName) {
  await pool.query(
    `UPDATE platform_connections SET account_id=$1, account_name=$2 WHERE client_id=$3 AND platform='google_ads'`,
    [accountId, accountName, clientId]
  );
}
