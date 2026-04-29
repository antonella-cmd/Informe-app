// ============================================================
// routes/reportData.js — PTI Analytics (corregido)
// Usa META_SYSTEM_TOKEN en lugar del token de usuario
// ============================================================
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireClientAccess } from '../middleware/clientAccess.js';
import { pool } from '../db.js';
import fetch from 'node-fetch';

const router = Router();
router.use(requireAuth);

const GRAPH = 'https://graph.facebook.com/v20.0';

// ── Siempre usar META_SYSTEM_TOKEN ──────────────────────────
async function getMetaConn(clientId) {
  const { rows } = await pool.query(
    `SELECT access_token, account_id, account_name FROM platform_connections
     WHERE client_id=$1 AND platform='meta_ads'`,
    [clientId]
  );

  const conn = rows[0] || {};

  // Siempre preferir el System Token
  const token = process.env.META_SYSTEM_TOKEN || conn.access_token;
  if (!token) return null;

  conn.access_token = token;
  return conn;
}

async function metaGet(path, params, token) {
  const url = `${GRAPH}/${path}?` + new URLSearchParams({ ...params, access_token: token });
  const res  = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(`Meta API: ${data.error.message}`);
  return data;
}

// ── Fallback DB — cuando Meta API falla usa datos importados ─
async function dbFallback(clientId, start, end, limit = 20) {
  // Intentar campaign_metrics primero
  try {
    const { rows } = await pool.query(`
      SELECT c.name, a.platform, c.status,
        SUM(cm.spend)::numeric       AS spend,
        SUM(cm.clicks)::numeric      AS clicks,
        SUM(cm.impressions)::numeric AS impressions,
        SUM(cm.conversions)::numeric AS conversions,
        SUM(cm.revenue)::numeric     AS revenue,
        AVG(cm.ctr)::numeric         AS ctr,
        AVG(cm.cpc)::numeric         AS cpc,
        AVG(cm.cpm)::numeric         AS cpm,
        CASE WHEN SUM(cm.spend)>0 THEN SUM(cm.revenue)::numeric/SUM(cm.spend) ELSE 0 END AS roas,
        CASE WHEN SUM(cm.conversions)>0 THEN SUM(cm.spend)::numeric/SUM(cm.conversions) ELSE 0 END AS cpa
      FROM campaign_metrics cm
      JOIN campaigns c ON c.id = cm.campaign_id
      JOIN ad_accounts a ON a.id = c.ad_account_id
      WHERE a.client_id = $1 AND cm.date BETWEEN $2 AND $3
      GROUP BY c.name, a.platform, c.status
      ORDER BY spend DESC NULLS LAST
      LIMIT $4
    `, [clientId, start, end, parseInt(limit)]);

    if (rows.length > 0) return { ads: rows.map((r, i) => ({ ad_id: `db_${i}`, ...r, spend: parseFloat(r.spend||0), clicks: parseFloat(r.clicks||0), impressions: parseFloat(r.impressions||0), conversions: parseFloat(r.conversions||0), revenue: parseFloat(r.revenue||0), ctr: parseFloat(r.ctr||0), cpc: parseFloat(r.cpc||0), cpm: parseFloat(r.cpm||0), roas: parseFloat(r.roas||0), cpa: parseFloat(r.cpa||0) })), source: 'database' };
  } catch (_) {}

  // Fallback metrics_snapshots
  const { rows: ms } = await pool.query(`
    SELECT campaign_name AS name, platform, 'active' AS status,
      SUM(spend)::numeric AS spend, SUM(clicks)::numeric AS clicks,
      SUM(impressions)::numeric AS impressions, SUM(conversions)::numeric AS conversions,
      SUM(revenue)::numeric AS revenue,
      CASE WHEN SUM(impressions)>0 THEN (SUM(clicks)::numeric/SUM(impressions))*100 ELSE 0 END AS ctr,
      CASE WHEN SUM(clicks)>0 THEN SUM(spend)::numeric/SUM(clicks) ELSE 0 END AS cpc,
      CASE WHEN SUM(impressions)>0 THEN (SUM(spend)::numeric/SUM(impressions))*1000 ELSE 0 END AS cpm,
      CASE WHEN SUM(spend)>0 THEN SUM(revenue)::numeric/SUM(spend) ELSE 0 END AS roas,
      CASE WHEN SUM(conversions)>0 THEN SUM(spend)::numeric/SUM(conversions) ELSE 0 END AS cpa
    FROM metrics_snapshots
    WHERE client_id = $1 AND date BETWEEN $2 AND $3 AND campaign_name IS NOT NULL
    GROUP BY campaign_name, platform
    ORDER BY spend DESC NULLS LAST
    LIMIT $4
  `, [clientId, start, end, parseInt(limit)]);

  return { ads: ms.map((r, i) => ({ ad_id: `ms_${i}`, ...r, spend: parseFloat(r.spend||0), clicks: parseFloat(r.clicks||0), impressions: parseFloat(r.impressions||0), conversions: parseFloat(r.conversions||0), revenue: parseFloat(r.revenue||0), ctr: parseFloat(r.ctr||0), cpc: parseFloat(r.cpc||0), cpm: parseFloat(r.cpm||0), roas: parseFloat(r.roas||0), cpa: parseFloat(r.cpa||0) })), source: 'snapshots' };
}

// ── GET /api/report-data/:clientId/meta/ads ─────────────────
router.get('/:clientId/meta/ads', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { start, end, sort = 'spend', order = 'desc', limit = 20 } = req.query;

    const conn = await getMetaConn(clientId);

    // Sin conexión → usar DB
    if (!conn || !conn.account_id) {
      const fallback = await dbFallback(clientId, start, end, limit);
      return res.json(fallback);
    }

    try {
      const { access_token, account_id } = conn;

      const adsData = await metaGet(`${account_id}/ads`, {
        fields: [
          'id,name,status',
          'campaign{id,name}',
          'adset{id,name}',
          `insights.fields(impressions,clicks,spend,actions,action_values,ctr,cpc,cpm,reach,frequency).time_range({"since":"${start}","until":"${end}"})`,
        ].join(','),
        limit: 100,
      }, access_token);

      const ads = (adsData.data || []).map(ad => {
        const ins = ad.insights?.data?.[0] || {};
        const actions      = ins.actions       || [];
        const actionValues = ins.action_values || [];
        const findA = t => Number(actions.find(a => a.action_type === t)?.value || 0);
        const findV = t => Number(actionValues.find(a => a.action_type === t)?.value || 0);

        const purchases     = findA('purchase') || findA('offsite_conversion.fb_pixel_purchase') || findA('omni_purchase');
        const purchaseValue = findV('purchase') || findV('offsite_conversion.fb_pixel_purchase') || findV('omni_purchase');
        const addToCart     = findA('add_to_cart') || findA('offsite_conversion.fb_pixel_add_to_cart');
        const checkoutInit  = findA('initiate_checkout') || findA('offsite_conversion.fb_pixel_initiate_checkout');
        const spend         = Number(ins.spend || 0);

        return {
          ad_id:              ad.id,
          name:               ad.name,
          status:             ad.status,
          campaign_name:      ad.campaign?.name,
          adset_name:         ad.adset?.name,
          platform:           'meta_ads',
          impressions:        Number(ins.impressions || 0),
          clicks:             Number(ins.clicks      || 0),
          spend,
          ctr:                Number(ins.ctr       || 0),
          cpc:                Number(ins.cpc       || 0),
          cpm:                Number(ins.cpm       || 0),
          reach:              Number(ins.reach     || 0),
          frequency:          Number(ins.frequency || 0),
          purchases,
          purchase_value:     purchaseValue,
          add_to_cart:        addToCart,
          checkout_initiated: checkoutInit,
          revenue:            purchaseValue,
          conversions:        purchases,
          roas:               spend > 0 && purchaseValue > 0 ? purchaseValue / spend : 0,
          cost_per_purchase:  purchases > 0 ? spend / purchases : 0,
          cpa:                purchases > 0 ? spend / purchases : 0,
        };
      });

      const sorted = ads
        .sort((a, b) => order === 'asc' ? (a[sort]||0) - (b[sort]||0) : (b[sort]||0) - (a[sort]||0))
        .slice(0, parseInt(limit));

      return res.json({ ads: sorted, total: ads.length, source: 'meta_api' });
    } catch (metaErr) {
      console.warn('Meta API falló, usando DB:', metaErr.message);
      const fallback = await dbFallback(clientId, start, end, limit);
      return res.json(fallback);
    }
  } catch (e) { next(e); }
});

// ── GET /api/report-data/:clientId/meta/adsets ──────────────
router.get('/:clientId/meta/adsets', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { start, end } = req.query;
    const conn = await getMetaConn(clientId);
    if (!conn || !conn.account_id) return res.json({ adsets: [] });
    const { access_token, account_id } = conn;

    const data = await metaGet(`${account_id}/adsets`, {
      fields: `id,name,status,optimization_goal,campaign{name},insights.fields(impressions,clicks,spend,actions,action_values,ctr,cpc,cpm,reach).time_range({"since":"${start}","until":"${end}"})`,
      limit: 100,
    }, access_token);

    const adsets = (data.data || []).map(s => {
      const ins  = s.insights?.data?.[0] || {};
      const conv = (ins.actions || []).find(a => a.action_type === 'purchase')?.value || 0;
      const rev  = (ins.action_values || []).find(a => a.action_type === 'purchase')?.value || 0;
      const spend = Number(ins.spend || 0);
      return {
        id: s.id, name: s.name, status: s.status,
        goal: s.optimization_goal,
        campaign_name: s.campaign?.name,
        impressions: Number(ins.impressions || 0), clicks: Number(ins.clicks || 0),
        spend, conversions: Number(conv), revenue: Number(rev),
        ctr: Number(ins.ctr || 0), cpc: Number(ins.cpc || 0),
        cpm: Number(ins.cpm || 0), reach: Number(ins.reach || 0),
        roas: spend > 0 ? Number(rev) / spend : 0,
        cpa:  Number(conv) > 0 ? spend / Number(conv) : 0,
      };
    });
    res.json({ adsets });
  } catch (e) { next(e); }
});

// ── GET /api/report-data/:clientId/meta/placements ──────────
router.get('/:clientId/meta/placements', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { start, end } = req.query;
    const conn = await getMetaConn(clientId);
    if (!conn || !conn.account_id) return res.json({ placements: [] });
    const { access_token, account_id } = conn;

    const data = await metaGet(`${account_id}/insights`, {
      fields: 'impressions,clicks,spend,actions,action_values,ctr,reach',
      breakdowns: 'publisher_platform,platform_position',
      time_range: JSON.stringify({ since: start, until: end }),
      level: 'account', limit: 50,
    }, access_token);

    const placements = (data.data || []).map(r => {
      const conv = (r.actions || []).find(a => a.action_type === 'purchase')?.value || 0;
      const rev  = (r.action_values || []).find(a => a.action_type === 'purchase')?.value || 0;
      const spend = Number(r.spend || 0);
      return {
        platform: r.publisher_platform, position: r.platform_position,
        impressions: Number(r.impressions || 0), clicks: Number(r.clicks || 0),
        spend, conversions: Number(conv), revenue: Number(rev),
        ctr: Number(r.ctr || 0), reach: Number(r.reach || 0),
        roas: spend > 0 ? Number(rev) / spend : 0,
      };
    }).sort((a, b) => b.spend - a.spend);

    res.json({ placements });
  } catch (e) { next(e); }
});

// ── GET /api/report-data/:clientId/meta/demographics ────────
router.get('/:clientId/meta/demographics', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { start, end } = req.query;
    const conn = await getMetaConn(clientId);
    if (!conn || !conn.account_id) return res.json({ age: [], gender: [], device: [] });
    const { access_token, account_id } = conn;

    const [ageData, genderData, deviceData] = await Promise.allSettled([
      metaGet(`${account_id}/insights`, { fields: 'impressions,clicks,spend,actions,ctr', breakdowns: 'age', time_range: JSON.stringify({ since: start, until: end }), level: 'account' }, access_token),
      metaGet(`${account_id}/insights`, { fields: 'impressions,clicks,spend,actions,ctr', breakdowns: 'gender', time_range: JSON.stringify({ since: start, until: end }), level: 'account' }, access_token),
      metaGet(`${account_id}/insights`, { fields: 'impressions,clicks,spend,actions,ctr', breakdowns: 'device_platform', time_range: JSON.stringify({ since: start, until: end }), level: 'account' }, access_token),
    ]);

    const mapRow = r => {
      const conv = (r.actions || []).find(a => a.action_type === 'purchase')?.value || 0;
      return { impressions: Number(r.impressions||0), clicks: Number(r.clicks||0), spend: Number(r.spend||0), conversions: Number(conv), ctr: Number(r.ctr||0) };
    };

    res.json({
      age:    (ageData.value?.data    || []).map(r => ({ label: r.age,             ...mapRow(r) })),
      gender: (genderData.value?.data || []).map(r => ({ label: r.gender,          ...mapRow(r) })),
      device: (deviceData.value?.data || []).map(r => ({ label: r.device_platform, ...mapRow(r) })),
    });
  } catch (e) { next(e); }
});

// ── GET /api/report-data/:clientId/roas-history ─────────────
router.get('/:clientId/roas-history', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { rows } = await pool.query(`
      SELECT
        TO_CHAR(date, 'Mon YYYY') AS month_label,
        DATE_TRUNC('month', date) AS month_start,
        SUM(spend)::numeric AS spend, SUM(revenue)::numeric AS revenue,
        SUM(conversions)::numeric AS conversions,
        CASE WHEN SUM(spend)>0 THEN SUM(revenue)::numeric/SUM(spend) ELSE 0 END AS roas
      FROM metrics_snapshots
      WHERE client_id=$1 AND date >= NOW() - INTERVAL '12 months'
      GROUP BY month_label, month_start
      ORDER BY month_start DESC LIMIT 12
    `, [clientId]);
    res.json({ history: rows });
  } catch (e) { next(e); }
});

// ── GET /api/report-data/:clientId/comparison ───────────────
router.get('/:clientId/comparison', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { start_a, end_a, start_b, end_b } = req.query;

    const q = (s, e) => pool.query(`
      SELECT SUM(spend)::numeric AS spend, SUM(clicks)::numeric AS clicks,
        SUM(impressions)::numeric AS impressions, SUM(conversions)::numeric AS conversions,
        SUM(revenue)::numeric AS revenue,
        CASE WHEN SUM(spend)>0 THEN SUM(revenue)::numeric/SUM(spend) ELSE 0 END AS roas,
        CASE WHEN SUM(conversions)>0 THEN SUM(spend)::numeric/SUM(conversions) ELSE 0 END AS cpa,
        CASE WHEN SUM(impressions)>0 THEN (SUM(clicks)::numeric/SUM(impressions))*100 ELSE 0 END AS ctr
      FROM metrics_snapshots WHERE client_id=$1 AND date BETWEEN $2 AND $3
    `, [clientId, s, e]);

    const [resA, resB] = await Promise.all([q(start_a, end_a), q(start_b, end_b)]);
    res.json({ period_a: { ...resA.rows[0], start: start_a, end: end_a }, period_b: { ...resB.rows[0], start: start_b, end: end_b } });
  } catch (e) { next(e); }
});

// ── GET /api/report-data/available-blocks ───────────────────
router.get('/available-blocks', (req, res) => {
  res.json({ blocks: [] }); // el frontend ya tiene los bloques definidos
});

export default router;
