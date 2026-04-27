// ============================================================
// services/metaAds.js — Meta Ads API (Graph v20)
// FIX: auto-detecta account_id al conectar y como fallback
// ============================================================
import fetch from 'node-fetch';
import { pool } from '../db.js';
import { config } from 'dotenv';
config();

const GRAPH = 'https://graph.facebook.com/v20.0';

// ── Extraer todas las métricas de e-commerce de Meta ──────
function extractMetaMetrics(row) {
  const actions      = row.actions       || [];
  const actionValues = row.action_values || [];

  const findAction = (type) => Number(actions.find(a => a.action_type === type)?.value || 0);
  const findValue  = (type) => Number(actionValues.find(a => a.action_type === type)?.value || 0);

  const purchases        = findAction('purchase') || findAction('offsite_conversion.fb_pixel_purchase') || findAction('omni_purchase');
  const purchaseValue    = findValue('purchase')  || findValue('offsite_conversion.fb_pixel_purchase')  || findValue('omni_purchase');
  const addToCart        = findAction('add_to_cart') || findAction('offsite_conversion.fb_pixel_add_to_cart') || findAction('omni_add_to_cart');
  const checkoutInit     = findAction('initiate_checkout') || findAction('offsite_conversion.fb_pixel_initiate_checkout') || findAction('omni_initiated_checkout');
  const igFollow         = findAction('like') || findAction('onsite_conversion.follow') || findAction('follow');
  const spend            = Number(row.spend || 0);

  return {
    impressions:   Number(row.impressions || 0),
    clicks:        Number(row.clicks      || 0),
    spend,
    ctr:           Number(row.ctr       || 0),
    cpc:           Number(row.cpc       || 0),
    cpm:           Number(row.cpm       || 0),
    reach:         Number(row.reach     || 0),
    frequency:     Number(row.frequency || 0),
    purchases,
    purchase_value: purchaseValue,
    add_to_cart:    addToCart,
    checkout_initiated: checkoutInit,
    ig_follows:     igFollow,
    // Calculados
    roas:           spend > 0 && purchaseValue > 0 ? purchaseValue / spend : 0,
    cost_per_purchase: purchases > 0 ? spend / purchases : 0,
    conversions:    purchases,
    revenue:        purchaseValue,
  };
}



export function getMetaAuthUrl(state) {
  const params = new URLSearchParams({
    client_id:     process.env.META_APP_ID,
    redirect_uri:  process.env.META_REDIRECT_URI,
    scope:         'ads_read,ads_management,business_management',
    response_type: 'code',
    state,
  });
  return `https://www.facebook.com/dialog/oauth?${params}`;
}

// ── Auto-detectar la primera ad account disponible ─────────
async function autoDetectAdAccount(token) {
  try {
    const url = `${GRAPH}/me/adaccounts?` + new URLSearchParams({
      fields: 'id,name,account_status,currency',
      access_token: token,
      limit: 1,
    });
    const res  = await fetch(url);
    const data = await res.json();
    const first = data.data?.[0];
    if (first) {
      return { id: first.id, name: first.name };
    }
  } catch (_) {}
  return null;
}

export async function exchangeMetaCode(code, clientId) {
  // Paso 1: obtener short-lived token
  const tokenUrl = `${GRAPH}/oauth/access_token?` + new URLSearchParams({
    client_id:     process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    redirect_uri:  process.env.META_REDIRECT_URI,
    code,
  });
  const res  = await fetch(tokenUrl);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  // Paso 2: convertir a long-lived token (60 días)
  const llRes = await fetch(`${GRAPH}/oauth/access_token?` + new URLSearchParams({
    grant_type:        'fb_exchange_token',
    client_id:         process.env.META_APP_ID,
    client_secret:     process.env.META_APP_SECRET,
    fb_exchange_token: data.access_token,
  }));
  const ll = await llRes.json();
  const token = ll.access_token || data.access_token;

  // Paso 3: auto-detectar la primera ad account
  const account = await autoDetectAdAccount(token);

  // Paso 4: guardar conexión CON account_id si se detectó
  await pool.query(`
    INSERT INTO platform_connections
      (client_id, platform, access_token, token_expires_at, account_id, account_name)
    VALUES ($1, 'meta_ads', $2, $3, $4, $5)
    ON CONFLICT (client_id, platform) DO UPDATE SET
      access_token     = EXCLUDED.access_token,
      token_expires_at = EXCLUDED.token_expires_at,
      account_id       = COALESCE(EXCLUDED.account_id, platform_connections.account_id),
      account_name     = COALESCE(EXCLUDED.account_name, platform_connections.account_name)
  `, [
    clientId, token,
    new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    account?.id   || null,
    account?.name || null,
  ]);

  return { token, account };
}

// ── getToken: devuelve token + account_id, con fallback auto-detect ──
async function getToken(clientId) {
  // Soporte para system token (variables de entorno)
  if (process.env.META_SYSTEM_TOKEN) {
    const { rows } = await pool.query(
      `SELECT account_id, account_name FROM platform_connections
       WHERE client_id = $1 AND platform = 'meta_ads'`,
      [clientId]
    );
    return {
      access_token: process.env.META_SYSTEM_TOKEN,
      account_id:   rows[0]?.account_id || null,
      account_name: rows[0]?.account_name || null,
    };
  }

  const { rows } = await pool.query(
    `SELECT access_token, account_id, account_name FROM platform_connections
     WHERE client_id = $1 AND platform = 'meta_ads'`,
    [clientId]
  );
  if (!rows.length) throw new Error('Meta Ads no está conectado para este cliente');

  const conn = rows[0];

  // FIX: Si account_id está vacío, intentar auto-detectar y guardar
  if (!conn.account_id && conn.access_token) {
    const account = await autoDetectAdAccount(conn.access_token);
    if (account) {
      await pool.query(
        `UPDATE platform_connections SET account_id=$1, account_name=$2
         WHERE client_id=$3 AND platform='meta_ads'`,
        [account.id, account.name, clientId]
      );
      conn.account_id   = account.id;
      conn.account_name = account.name;
    }
  }

  if (!conn.account_id) {
    throw new Error('No hay cuenta de Meta Ads seleccionada. Andá a Conexiones y reconectá Meta Ads.');
  }

  return conn;
}

async function metaGet(path, params, token) {
  const url = `${GRAPH}/${path}?` + new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(`Meta API: ${data.error.message}`);
  return data;
}

// ── Listar cuentas de ads disponibles ─────────────────────
export async function listAdAccounts(clientId) {
  const { access_token } = await getToken(clientId);
  const data = await metaGet('me/adaccounts', {
    fields: 'id,name,currency,account_status,amount_spent',
  }, access_token);
  return (data.data || []).map(a => ({
    id:       a.id,
    name:     a.name,
    currency: a.currency,
    status:   a.account_status,
    spent:    Number(a.amount_spent) / 100,
  }));
}

// ── Account summary ────────────────────────────────────────
export async function fetchMetaSummary(clientId, { startDate, endDate, accountId }) {
  const conn   = await getToken(clientId);
  const token  = conn.access_token;
  const actId  = accountId || conn.account_id;

  const data = await metaGet(`${actId}/insights`, {
    fields:     'impressions,clicks,spend,actions,action_values,ctr,cpc,cpm,reach,frequency',
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    level:      'account',
  }, token);

  const row = data.data?.[0] || {};
  return extractMetaMetrics(row);
}

// ── Campaigns ─────────────────────────────────────────────
export async function fetchMetaCampaigns(clientId, { startDate, endDate, accountId }) {
  const conn  = await getToken(clientId);
  const token = conn.access_token;
  const actId = accountId || conn.account_id;

  const data = await metaGet(`${actId}/campaigns`, {
    fields: [
      'id,name,status,objective',
      `insights.fields(impressions,clicks,spend,actions,action_values,ctr,cpc,cpm,reach,frequency).time_range({"since":"${startDate}","until":"${endDate}"})`,
    ].join(','),
    limit: 100,
  }, token);

  return (data.data || []).map(c => {
    const ins     = c.insights?.data?.[0] || {};
    const metrics = extractMetaMetrics(ins);
    return {
      id:        c.id,
      name:      c.name,
      status:    c.status,
      objective: c.objective,
      platform:  'meta_ads',
      ...metrics,
    };
  });
}

// ── Daily time-series ──────────────────────────────────────
export async function fetchMetaTimeSeries(clientId, { startDate, endDate, accountId }) {
  const conn  = await getToken(clientId);
  const token = conn.access_token;
  const actId = accountId || conn.account_id;

  const data = await metaGet(`${actId}/insights`, {
    fields:         'date_start,impressions,clicks,spend,actions,action_values',
    time_range:     JSON.stringify({ since: startDate, until: endDate }),
    time_increment: 1,
    level:          'account',
  }, token);

  return (data.data || []).map(r => {
    const metrics = extractMetaMetrics(r);
    return { date: r.date_start, platform: 'meta_ads', ...metrics };
  });
}

// ── Ad Sets ────────────────────────────────────────────────
export async function fetchMetaAdSets(clientId, { startDate, endDate, campaignId, accountId }) {
  const conn  = await getToken(clientId);
  const token = conn.access_token;
  const actId = accountId || conn.account_id;

  const endpoint = campaignId ? `${campaignId}/adsets` : `${actId}/adsets`;
  const data = await metaGet(endpoint, {
    fields: [
      'id,name,status,optimization_goal',
      `insights.fields(impressions,clicks,spend,actions,action_values,ctr,cpc,reach).time_range({"since":"${startDate}","until":"${endDate}"})`,
    ].join(','),
    limit: 100,
  }, token);

  return (data.data || []).map(s => {
    const ins  = s.insights?.data?.[0] || {};
    const conv = (ins.actions || []).find(a => a.action_type === 'purchase')?.value || 0;
    const revenue = (ins.action_values || []).find(a => a.action_type === 'purchase')?.value || 0;
    const spend = Number(ins.spend || 0);
    return {
      id:          s.id,
      name:        s.name,
      status:      s.status,
      goal:        s.optimization_goal,
      impressions: Number(ins.impressions || 0),
      clicks:      Number(ins.clicks      || 0),
      spend,
      conversions: Number(conv),
      revenue:     Number(revenue),
      ctr:         Number(ins.ctr || 0),
      cpc:         Number(ins.cpc || 0),
      reach:       Number(ins.reach || 0),
      roas:        spend > 0 ? Number(revenue) / spend : 0,
      cpa:         Number(conv) > 0 ? spend / Number(conv) : 0,
    };
  });
}
