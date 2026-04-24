// ============================================================
// routes/ads.js — Top anuncios con creatividades
// Sirve datos de anuncios desde metrics_snapshots/campaign_metrics
// + creatividades desde Meta Ads API si está conectado
// ============================================================
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireClientAccess } from '../middleware/clientAccess.js';
import { pool } from '../db.js';
import fetch from 'node-fetch';

const router = Router();
router.use(requireAuth);

const GRAPH = 'https://graph.facebook.com/v20.0';

async function getMetaToken(clientId) {
  const { rows } = await pool.query(
    `SELECT access_token, account_id FROM platform_connections
     WHERE client_id = $1 AND platform = 'meta_ads'`,
    [clientId]
  );
  return rows[0] || null;
}

// Intentar traer creatividades de Meta Ads API para los ad_ids dados
async function fetchMetaCreatives(accessToken, accountId, adNames) {
  if (!accessToken || !accountId || !adNames.length) return {};
  try {
    const url = `${GRAPH}/act_${accountId}/ads?` + new URLSearchParams({
      access_token: accessToken,
      fields: 'id,name,creative{thumbnail_url,image_url,video_id,body,title,object_type}',
      limit: 50,
    });
    const res = await fetch(url);
    if (!res.ok) return {};
    const data = await res.json();
    const map = {};
    for (const ad of (data.data || [])) {
      const creative = ad.creative || {};
      map[ad.name] = {
        ad_id: ad.id,
        creative_url: creative.image_url || creative.thumbnail_url || null,
        image_url: creative.image_url || creative.thumbnail_url || null,
        creative_type: creative.video_id ? 'video' : 'image',
        video_id: creative.video_id || null,
        headline: creative.title || null,
        body: creative.body || null,
      };
      // Si hay video, armar URL del video
      if (creative.video_id) {
        map[ad.name].ad_url = `https://www.facebook.com/ads/library/?id=${ad.id}`;
      }
    }
    return map;
  } catch (_) { return {}; }
}

// GET /api/ads/top/:clientId
// Query: start, end, platform, sort (roas|spend|conversions|ctr|clicks), limit
router.get('/top/:clientId', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const {
      start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      end   = new Date().toISOString().split('T')[0],
      platform,
      sort  = 'roas',
      limit = 10,
    } = req.query;

    const validSorts = { roas: 'roas', spend: 'spend', conversions: 'conversions', ctr: 'ctr', clicks: 'clicks' };
    const orderBy = validSorts[sort] || 'roas';

    let ads = [];

    // 1. Intentar desde campaign_metrics (datos de API o Excel)
    try {
      const platFilter = platform ? 'AND a.platform = $4' : '';
      const params = [clientId, start, end];
      if (platform) params.push(platform);

      const { rows } = await pool.query(`
        SELECT
          c.id            AS campaign_id,
          c.name          AS campaign_name,
          a.platform,
          c.name          AS name,
          c.name          AS ad_name,
          SUM(cm.spend)::numeric       AS spend,
          SUM(cm.clicks)::numeric      AS clicks,
          SUM(cm.impressions)::numeric AS impressions,
          SUM(cm.conversions)::numeric AS conversions,
          SUM(cm.revenue)::numeric     AS revenue,
          AVG(cm.ctr)::numeric         AS ctr,
          AVG(cm.cpc)::numeric         AS cpc,
          CASE WHEN SUM(cm.spend) > 0 THEN SUM(cm.revenue)::numeric / SUM(cm.spend) ELSE 0 END AS roas,
          NULL::text AS creative_url,
          NULL::text AS image_url,
          'image'    AS creative_type
        FROM campaign_metrics cm
        JOIN campaigns c ON c.id = cm.campaign_id
        JOIN ad_accounts a ON a.id = c.ad_account_id
        WHERE a.client_id = $1
          AND cm.date BETWEEN $2 AND $3
          ${platFilter}
        GROUP BY c.id, c.name, a.platform
        ORDER BY ${orderBy} DESC NULLS LAST
        LIMIT $${params.length + 1}
      `, [...params, parseInt(limit)]);

      ads = rows;
    } catch (_) {}

    // 2. Fallback: metrics_snapshots (si campaign_metrics no tiene datos)
    if (!ads.length) {
      try {
        const platFilter = platform ? 'AND platform = $4' : '';
        const params = [clientId, start, end];
        if (platform) params.push(platform);

        const { rows } = await pool.query(`
          SELECT
            campaign_name                       AS name,
            campaign_name                       AS ad_name,
            campaign_name                       AS campaign_name,
            platform,
            SUM(spend)::numeric                 AS spend,
            SUM(clicks)::numeric                AS clicks,
            SUM(impressions)::numeric           AS impressions,
            SUM(conversions)::numeric           AS conversions,
            SUM(revenue)::numeric               AS revenue,
            CASE WHEN SUM(impressions) > 0 THEN (SUM(clicks)::numeric / SUM(impressions)) * 100 ELSE 0 END AS ctr,
            CASE WHEN SUM(clicks) > 0 THEN SUM(spend)::numeric / SUM(clicks) ELSE 0 END AS cpc,
            CASE WHEN SUM(spend) > 0 THEN SUM(revenue)::numeric / SUM(spend) ELSE 0 END AS roas,
            NULL::text AS creative_url,
            NULL::text AS image_url,
            'image'    AS creative_type
          FROM metrics_snapshots
          WHERE client_id = $1
            AND date BETWEEN $2 AND $3
            AND campaign_name IS NOT NULL
            ${platFilter}
          GROUP BY campaign_name, platform
          ORDER BY ${orderBy} DESC NULLS LAST
          LIMIT $${params.length + 1}
        `, [...params, parseInt(limit)]);

        ads = rows;
      } catch (_) {}
    }

    if (!ads.length) return res.json([]);

    // 3. Enriquecer con creatividades de Meta si está conectado
    const metaConn = await getMetaToken(clientId);
    if (metaConn?.access_token) {
      const metaAdNames = ads.filter(a => a.platform === 'meta_ads').map(a => a.name);
      if (metaAdNames.length > 0) {
        const creatives = await fetchMetaCreatives(metaConn.access_token, metaConn.account_id, metaAdNames);
        ads = ads.map(ad => {
          if (ad.platform === 'meta_ads' && creatives[ad.name]) {
            return { ...ad, ...creatives[ad.name] };
          }
          return ad;
        });
      }
    }

    // 4. Generar URLs de previsualización para anuncios importados por Excel
    //    que tengan URLs en los datos raw (si los hay)
    ads = ads.map((ad, i) => ({
      ...ad,
      ad_id: ad.campaign_id || `ad_${i}`,
      spend: parseFloat(ad.spend || 0),
      clicks: parseFloat(ad.clicks || 0),
      impressions: parseFloat(ad.impressions || 0),
      conversions: parseFloat(ad.conversions || 0),
      revenue: parseFloat(ad.revenue || 0),
      ctr: parseFloat(ad.ctr || 0),
      cpc: parseFloat(ad.cpc || 0),
      roas: parseFloat(ad.roas || 0),
    }));

    res.json(ads);
  } catch (e) { next(e); }
});

export default router;
