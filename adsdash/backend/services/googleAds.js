// ============================================================
// services/googleAds.js — Google Ads API v17
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
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl(clientId) {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/adwords',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state: `clientId:${clientId}`,
  });
}

// Exchange auth code → tokens, detectar account_id y guardar
export async function exchangeCodeAndSave(code, clientId) {
  const oauth = getOAuthClient();
  const { tokens } = await oauth.getToken(code);
  oauth.setCredentials(tokens);

  const api = new GoogleAdsApi({
    client_id:       process.env.GOOGLE_CLIENT_ID,
    client_secret:   process.env.GOOGLE_CLIENT_SECRET,
    developer_token: process.env.GOOGLE_DEVELOPER_TOKEN,
  });

  // Intentar detectar el account_id automáticamente
  let accountId   = null;
  let accountName = null;

  try {
    const mccId = process.env.GOOGLE_MCC_ID;
    if (mccId) {
      // Buscar cuentas accesibles desde MCC
      const mcc = api.Customer({
        customer_id:   mccId,
        refresh_token: tokens.refresh_token,
      });
      const rows = await mcc.query(`
        SELECT customer_client.id, customer_client.descriptive_name
        FROM customer_client
        WHERE customer_client.manager = false
          AND customer_client.status = 'ENABLED'
        LIMIT 1
      `);
      if (rows.length) {
        accountId   = String(rows[0].customer_client.id);
        accountName = rows[0].customer_client.descriptive_name;
      }
    } else {
      // Sin MCC: intentar obtener la cuenta directamente
      const tempCustomer = api.Customer({ refresh_token: tokens.refresh_token });
      const info = await tempCustomer.query(`
        SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1
      `);
      if (info.length) {
        accountId   = String(info[0].customer.id);
        accountName = info[0].customer.descriptive_name;
      }
    }
  } catch (err) {
    console.warn('No se pudo detectar account_id automáticamente:', err.message);
  }

  // Guardar conexión con account_id
  await pool.query(`
    INSERT INTO platform_connections
      (client_id, platform, access_token, refresh_token, token_expires_at, account_id, account_name)
    VALUES ($1, 'google_ads', $2, $3, $4, $5, $6)
    ON CONFLICT (client_id, platform) DO UPDATE SET
      access_token     = EXCLUDED.access_token,
      refresh_token    = EXCLUDED.refresh_token,
      token_expires_at = EXCLUDED.token_expires_at,
      account_id       = COALESCE(EXCLUDED.account_id, platform_connections.account_id),
      account_name     = COALESCE(EXCLUDED.account_name, platform_connections.account_name)
  `, [clientId, tokens.access_token, tokens.refresh_token,
      tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      accountId, accountName]);

  return { tokens, accountId, accountName };
}

// ── Build authenticated API customer ──────────────────────
async function getCustomer(clientId, accountId) {
  const { rows } = await pool.query(
    `SELECT * FROM platform_connections WHERE client_id = $1 AND platform = 'google_ads'`,
    [clientId]
  );
  if (!rows.length) throw new Error('Google Ads no está conectado para este cliente');

  const conn      = rows[0];
  const custId    = accountId || conn.account_id;
  const mccId     = process.env.GOOGLE_MCC_ID;

  if (!custId) throw new Error('No hay account_id guardado. Reconectá Google Ads desde Conexiones.');

  const api = new GoogleAdsApi({
    client_id:       process.env.GOOGLE_CLIENT_ID,
    client_secret:   process.env.GOOGLE_CLIENT_SECRET,
    developer_token: process.env.GOOGLE_DEVELOPER_TOKEN,
  });

  const customerConfig = {
    customer_id:   custId.replace(/-/g, ''), // remover guiones si los hay
    refresh_token: conn.refresh_token,
  };

  // Agregar login_customer_id solo si hay MCC configurado
  if (mccId) customerConfig.login_customer_id = mccId.replace(/-/g, '');

  return api.Customer(customerConfig);
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
    LIMIT 50
  `);

  return rows.map(r => ({
    id:          String(r.campaign.id),
    name:        r.campaign.name,
    status:      r.campaign.status?.toLowerCase() || 'unknown',
    channel:     r.campaign.advertising_channel_type,
    impressions: Number(r.metrics.impressions || 0),
    clicks:      Number(r.metrics.clicks || 0),
    spend:       Number(r.metrics.cost_micros || 0) / 1_000_000,
    conversions: Number(r.metrics.conversions || 0),
    revenue:     Number(r.metrics.conversions_value || 0),
    ctr:         Number(r.metrics.ctr || 0) * 100,
    cpc:         Number(r.metrics.average_cpc || 0) / 1_000_000,
    cpa:         Number(r.metrics.cost_per_conversion || 0) / 1_000_000,
    roas:        Number(r.metrics.cost_micros) > 0
                   ? (Number(r.metrics.conversions_value) / (Number(r.metrics.cost_micros) / 1_000_000))
                   : 0,
    platform:    'google_ads',
  }));
}

// ── Daily time-series ──────────────────────────────────────
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
    impressions: Number(r.metrics.impressions || 0),
    clicks:      Number(r.metrics.clicks || 0),
    spend:       Number(r.metrics.cost_micros || 0) / 1_000_000,
    conversions: Number(r.metrics.conversions || 0),
    revenue:     Number(r.metrics.conversions_value || 0),
    platform:    'google_ads',
  }));
}

// ── Account summary (KPIs totales) ────────────────────────
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

// ── Listar cuentas accesibles ──────────────────────────────
export async function listAccessibleAccounts(refreshToken) {
  const mccId = process.env.GOOGLE_MCC_ID;

  const api = new GoogleAdsApi({
    client_id:       process.env.GOOGLE_CLIENT_ID,
    client_secret:   process.env.GOOGLE_CLIENT_SECRET,
    developer_token: process.env.GOOGLE_DEVELOPER_TOKEN,
  });

  if (mccId) {
    const customer = api.Customer({
      customer_id:   mccId.replace(/-/g, ''),
      refresh_token: refreshToken,
    });
    const rows = await customer.query(`
      SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code
      FROM customer_client
      WHERE customer_client.manager = false
        AND customer_client.status = 'ENABLED'
    `);
    return rows.map(r => ({
      id:       String(r.customer_client.id),
      name:     r.customer_client.descriptive_name,
      currency: r.customer_client.currency_code,
    }));
  } else {
    // Sin MCC: devolver la cuenta del usuario
    const customer = api.Customer({ refresh_token: refreshToken });
    const rows = await customer.query(`
      SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1
    `);
    return rows.map(r => ({
      id:       String(r.customer.id),
      name:     r.customer.descriptive_name,
      currency: r.customer.currency_code,
    }));
  }
}

// ── Actualizar account_id manualmente ─────────────────────
export async function updateAccountId(clientId, accountId, accountName) {
  await pool.query(`
    UPDATE platform_connections
    SET account_id = $1, account_name = $2
    WHERE client_id = $3 AND platform = 'google_ads'
  `, [accountId, accountName, clientId]);
}
