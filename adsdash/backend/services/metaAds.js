// ============================================================
// Meta Ads Service
// Uses Meta Marketing API v20.0 via direct fetch calls
// ============================================================
import fetch from 'node-fetch';
import { pool } from '../db.js';
import { config } from 'dotenv';
config();

const GRAPH = 'https://graph.facebook.com/v20.0';

// ── OAuth2 helpers ────────────────────────────────────────
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

export async function exchangeMetaCode(code, clientId) {
  const url = `${GRAPH}/oauth/access_token?` + new URLSearchParams({
    client_id:     process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    redirect_uri:  process.env.META_REDIRECT_URI,
    code,
  });
  const res  = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  // Exchange for long-lived token
  const llRes = await fetch(`${GRAPH}/oauth/access_token?` + new URLSearchParams({
    grant_type:    'fb_exchange_token',
    client_id:     process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    fb_exchange_token: data.access_token,
  }));
  const ll = await llRes.json();
  const token = ll.access_token || data.access_token;

  await pool.query(`
    INSERT INTO platform_connections (client_id, platform, access_token, token_expires_at)
    VALUES ($1, 'meta_ads', $2, $3)
    ON CONFLICT (client_id, platform) DO UPDATE SET
      access_token     = EXCLUDED.access_token,
      token_expires_at = EXCLUDED.token_expires_at
  `, [clientId, token, new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)]);

  return token;
}

// ── Internal helper ───────────────────────────────────────
async function getToken(clientId) {
  const { rows } = await pool.query(
    `SELECT access_token, account_id FROM platform_connections
     WHERE client_id = $1 AND platform = 'meta_ads'`,
    [clientId]
  );
  if (!rows.length) throw new Error('Meta Ads not connected for this client');
  return rows[0];
}

async function metaGet(path, params, token) {
  const url = `${GRAPH}/${path}?` + new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(`Meta API: ${data.error.message}`);
  return data;
}

// ── List ad accounts ──────────────────────────────────────
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

// ── Account-level insights (KPIs) ─────────────────────────
export async function fetchMetaSummary(clientId, { startDate, endDate, accountId }) {
  const { access_token, account_id } = await getToken(clientId);
  const actId = accountId || account_id;

  const data = await metaGet(`${actId}/insights`, {
    fields: 'impressions,clicks,spend,actions,action_values,ctr,cpc,cpm,reach,frequency',
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    level: 'account',
  }, access_token);

  const row = data.data?.[0] || {};
  const conversions = (row.actions || []).find(a => a.action_type === 'purchase')?.value || 0;
  const revenue     = (row.action_values || []).find(a => a.action_type === 'purchase')?.value || 0;

  return {
    impressions: Number(row.impressions || 0),
    clicks:      Number(row.clicks || 0),
    spend:       Number(row.spend || 0),
    conversions: Number(conversions),
    revenue:     Number(revenue),
    ctr:         Number(row.ctr || 0),
    cpc:         Number(row.cpc || 0),
    cpm:         Number(row.cpm || 0),
    reach:       Number(row.reach || 0),
    frequency:   Number(row.frequency || 0),
  };
}

// ── Campaign-level metrics ────────────────────────────────
export async function fetchMetaCampaigns(clientId, { startDate, endDate, accountId }) {
  const { access_token, account_id } = await getToken(clientId);
  const actId = accountId || account_id;

  const data = await metaGet(`${actId}/campaigns`, {
    fields: [
      'id,name,status,objective',
      'insights{impressions,clicks,spend,actions,action_values,ctr,cpc,cpm,reach,frequency}',
    ].join(','),
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    limit: 100,
  }, access_token);

  return (data.data || []).map(c => {
    const ins      = c.insights?.data?.[0] || {};
    const conv     = (ins.actions || []).find(a => a.action_type === 'purchase')?.value || 0;
    const revenue  = (ins.action_values || []).find(a => a.action_type === 'purchase')?.value || 0;
    const spend    = Number(ins.spend || 0);

    return {
      id:          c.id,
      name:        c.name,
      status:      c.status,
      objective:   c.objective,
      impressions: Number(ins.impressions || 0),
      clicks:      Number(ins.clicks || 0),
      spend,
      conversions: Number(conv),
      revenue:     Number(revenue),
      ctr:         Number(ins.ctr || 0),
      cpc:         Number(ins.cpc || 0),
      cpm:         Number(ins.cpm || 0),
      cpa:         conv > 0 ? spend / Number(conv) : 0,
      roas:        revenue > 0 && spend > 0 ? Number(revenue) / spend : 0,
      platform:    'meta_ads',
    };
  });
}

// ── Daily time-series ─────────────────────────────────────
export async function fetchMetaTimeSeries(clientId, { startDate, endDate, accountId }) {
  const { access_token, account_id } = await getToken(clientId);
  const actId = accountId || account_id;

  const data = await metaGet(`${actId}/insights`, {
    fields: 'date_start,impressions,clicks,spend,actions,action_values',
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    time_increment: 1,
    level: 'account',
  }, access_token);

  return (data.data || []).map(r => {
    const conv    = (r.actions || []).find(a => a.action_type === 'purchase')?.value || 0;
    const revenue = (r.action_values || []).find(a => a.action_type === 'purchase')?.value || 0;
    return {
      date:        r.date_start,
      impressions: Number(r.impressions || 0),
      clicks:      Number(r.clicks || 0),
      spend:       Number(r.spend || 0),
      conversions: Number(conv),
      revenue:     Number(revenue),
      platform:    'meta_ads',
    };
  });
}

// ── Ad Set breakdown ──────────────────────────────────────
export async function fetchMetaAdSets(clientId, { startDate, endDate, campaignId, accountId }) {
  const { access_token, account_id } = await getToken(clientId);
  const actId = accountId || account_id;

  const endpoint = campaignId ? `${campaignId}/adsets` : `${actId}/adsets`;
  const data = await metaGet(endpoint, {
    fields: 'id,name,status,optimization_goal,insights{impressions,clicks,spend,actions,action_values,ctr,cpc}',
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    limit: 100,
  }, access_token);

  return (data.data || []).map(s => {
    const ins  = s.insights?.data?.[0] || {};
    const conv = (ins.actions || []).find(a => a.action_type === 'purchase')?.value || 0;
    return {
      id:          s.id,
      name:        s.name,
      status:      s.status,
      goal:        s.optimization_goal,
      impressions: Number(ins.impressions || 0),
      clicks:      Number(ins.clicks || 0),
      spend:       Number(ins.spend || 0),
      conversions: Number(conv),
      ctr:         Number(ins.ctr || 0),
      cpc:         Number(ins.cpc || 0),
    };
  });
}
