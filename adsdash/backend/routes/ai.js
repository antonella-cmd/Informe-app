// ============================================================
// routes/ai.js — Análisis IA con Claude API
// Usa metrics_snapshots (tabla existente) + campaign_metrics si hay
// ============================================================
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireClientAccess } from '../middleware/clientAccess.js';
import { pool } from '../db.js';

const router = Router();
router.use(requireAuth);

// POST /api/ai/:clientId/insights
router.post('/:clientId/insights', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { start_date, end_date } = req.body;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date y end_date son requeridos' });
    }

    // Período anterior (misma duración)
    const start    = new Date(start_date);
    const end      = new Date(end_date);
    const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    const prevEnd  = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - diffDays);
    const prevStartStr = prevStart.toISOString().split('T')[0];
    const prevEndStr   = prevEnd.toISOString().split('T')[0];

    // Cliente
    const { rows: clientRows } = await pool.query(
      `SELECT name, country, currency FROM clients WHERE id = $1`, [clientId]
    );
    if (!clientRows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    const client = clientRows[0];

    // Intentar traer métricas desde campaign_metrics primero, luego metrics_snapshots
    let currentMetrics = null;
    let prevMetrics    = null;
    let topCampaigns   = [];

    // Intentar campaign_metrics (si hay datos importados por Excel/APIs)
    try {
      const { rows: cm } = await pool.query(`
        SELECT
          SUM(cm.spend)::numeric       AS spend,
          SUM(cm.clicks)::numeric      AS clicks,
          SUM(cm.impressions)::numeric AS impressions,
          SUM(cm.conversions)::numeric AS conversions,
          SUM(cm.revenue)::numeric     AS revenue,
          AVG(cm.ctr)::numeric         AS ctr,
          AVG(cm.cpc)::numeric         AS cpc,
          AVG(cm.roas)::numeric        AS roas
        FROM campaign_metrics cm
        JOIN campaigns c ON c.id = cm.campaign_id
        JOIN ad_accounts a ON a.id = c.ad_account_id
        WHERE a.client_id = $1 AND cm.date BETWEEN $2 AND $3
      `, [clientId, start_date, end_date]);

      if (cm[0] && Number(cm[0].spend) > 0) {
        currentMetrics = cm[0];

        const { rows: pm } = await pool.query(`
          SELECT
            SUM(cm.spend)::numeric       AS spend,
            SUM(cm.clicks)::numeric      AS clicks,
            SUM(cm.impressions)::numeric AS impressions,
            SUM(cm.conversions)::numeric AS conversions,
            SUM(cm.revenue)::numeric     AS revenue,
            AVG(cm.ctr)::numeric         AS ctr,
            AVG(cm.cpc)::numeric         AS cpc,
            AVG(cm.roas)::numeric        AS roas
          FROM campaign_metrics cm
          JOIN campaigns c ON c.id = cm.campaign_id
          JOIN ad_accounts a ON a.id = c.ad_account_id
          WHERE a.client_id = $1 AND cm.date BETWEEN $2 AND $3
        `, [clientId, prevStartStr, prevEndStr]);
        prevMetrics = pm[0];

        const { rows: tc } = await pool.query(`
          SELECT c.name, a.platform, c.status,
            SUM(cm.spend)::numeric       AS spend,
            AVG(cm.roas)::numeric        AS roas,
            SUM(cm.conversions)::numeric AS conversions,
            AVG(cm.ctr)::numeric         AS ctr
          FROM campaign_metrics cm
          JOIN campaigns c ON c.id = cm.campaign_id
          JOIN ad_accounts a ON a.id = c.ad_account_id
          WHERE a.client_id = $1 AND cm.date BETWEEN $2 AND $3
          GROUP BY c.id, c.name, a.platform, c.status
          ORDER BY roas DESC NULLS LAST
          LIMIT 5
        `, [clientId, start_date, end_date]);
        topCampaigns = tc;
      }
    } catch (_) {}

    // Fallback: metrics_snapshots (datos de Google/Meta API)
    if (!currentMetrics) {
      const { rows: ms } = await pool.query(`
        SELECT
          SUM(spend)::numeric       AS spend,
          SUM(clicks)::numeric      AS clicks,
          SUM(impressions)::numeric AS impressions,
          SUM(conversions)::numeric AS conversions,
          SUM(revenue)::numeric     AS revenue,
          CASE WHEN SUM(impressions) > 0 THEN (SUM(clicks)::numeric / SUM(impressions)) * 100 ELSE 0 END AS ctr,
          CASE WHEN SUM(clicks) > 0 THEN SUM(spend)::numeric / SUM(clicks) ELSE 0 END AS cpc,
          CASE WHEN SUM(spend) > 0 THEN SUM(revenue)::numeric / SUM(spend) ELSE 0 END AS roas
        FROM metrics_snapshots
        WHERE client_id = $1 AND date BETWEEN $2 AND $3
      `, [clientId, start_date, end_date]);
      currentMetrics = ms[0];

      const { rows: pms } = await pool.query(`
        SELECT
          SUM(spend)::numeric       AS spend,
          SUM(clicks)::numeric      AS clicks,
          SUM(impressions)::numeric AS impressions,
          SUM(conversions)::numeric AS conversions,
          SUM(revenue)::numeric     AS revenue,
          CASE WHEN SUM(impressions) > 0 THEN (SUM(clicks)::numeric / SUM(impressions)) * 100 ELSE 0 END AS ctr,
          CASE WHEN SUM(clicks) > 0 THEN SUM(spend)::numeric / SUM(clicks) ELSE 0 END AS cpc,
          CASE WHEN SUM(spend) > 0 THEN SUM(revenue)::numeric / SUM(spend) ELSE 0 END AS roas
        FROM metrics_snapshots
        WHERE client_id = $1 AND date BETWEEN $2 AND $3
      `, [clientId, prevStartStr, prevEndStr]);
      prevMetrics = pms[0];

      const { rows: tc } = await pool.query(`
        SELECT campaign_name AS name, platform, 'active' AS status,
          SUM(spend)::numeric       AS spend,
          CASE WHEN SUM(spend) > 0 THEN SUM(revenue)::numeric / SUM(spend) ELSE 0 END AS roas,
          SUM(conversions)::numeric AS conversions,
          CASE WHEN SUM(impressions) > 0 THEN (SUM(clicks)::numeric / SUM(impressions)) * 100 ELSE 0 END AS ctr
        FROM metrics_snapshots
        WHERE client_id = $1 AND date BETWEEN $2 AND $3 AND campaign_name IS NOT NULL
        GROUP BY campaign_name, platform
        ORDER BY roas DESC NULLS LAST
        LIMIT 5
      `, [clientId, start_date, end_date]);
      topCampaigns = tc;
    }

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada en las variables de entorno de Railway' });
    }

    const prompt = `Analizá los datos de campañas publicitarias del cliente ${client.name} (${client.country || 'Argentina'}) para el período ${start_date} al ${end_date}.

MÉTRICAS DEL PERÍODO ACTUAL:
${JSON.stringify(currentMetrics || {}, null, 2)}

MÉTRICAS DEL PERÍODO ANTERIOR (${prevStartStr} al ${prevEndStr}):
${JSON.stringify(prevMetrics || {}, null, 2)}

TOP CAMPAÑAS:
${JSON.stringify(topCampaigns, null, 2)}

Respondé ÚNICAMENTE con este JSON sin texto adicional ni backticks:
{
  "summary": "Resumen ejecutivo en 2-3 oraciones enfocado en resultados de negocio y la evolución vs período anterior",
  "top_insights": [
    {
      "title": "Título corto del insight",
      "description": "Explicación concreta con datos específicos del análisis",
      "impact": "high|medium|low"
    }
  ],
  "recommendations": [
    {
      "action": "Acción concreta a tomar",
      "reason": "Por qué esta acción basada en los datos",
      "expected_impact": "Impacto esperado cuantificado si es posible",
      "priority": "high|medium|low"
    }
  ],
  "alerts": [
    {
      "type": "warning|info|danger",
      "message": "Descripción del alerta",
      "campaign": "Nombre de la campaña si aplica o null"
    }
  ]
}`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: `Sos un analista senior de performance marketing de PTI Consulting Partner, consultora especializada en e-commerce, marketplaces y transformación digital con presencia en Latinoamérica y España. Tus análisis están orientados a resultados de negocio concretos: ventas, ROAS, costo por adquisición, crecimiento de revenue. Usás lenguaje profesional pero claro y directo. Siempre respondés en español. Cuando des recomendaciones, son específicas y accionables, no genéricas.`,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const claudeData = await claudeRes.json();

    if (claudeData.error) {
      return res.status(500).json({ error: `Error de Claude API: ${claudeData.error.message}` });
    }

    const rawText = claudeData.content?.[0]?.text || '{}';
    let analysis;
    try {
      analysis = JSON.parse(rawText);
    } catch {
      const clean = rawText.replace(/```json|```/g, '').trim();
      try { analysis = JSON.parse(clean); }
      catch { analysis = { summary: rawText, top_insights: [], recommendations: [], alerts: [] }; }
    }

    res.json({
      ...analysis,
      generated_at: new Date().toISOString(),
      period: { start: start_date, end: end_date },
      client: client.name,
    });

  } catch (e) { next(e); }
});

export default router;
