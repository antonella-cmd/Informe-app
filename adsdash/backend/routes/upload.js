// ============================================================
// routes/upload.js — Carga de Excel y Google Sheets
// ============================================================
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireClientAccess } from '../middleware/clientAccess.js';
import { pool } from '../db.js';
import multer from 'multer';
import * as XLSX from 'xlsx';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls) o CSV'));
    }
  },
});

// Mapeo flexible de columnas — acepta variantes en español e inglés
const COL_MAP = {
  campaign_name:  ['campaign', 'campaña', 'campaign name', 'nombre campaña', 'nombre de campaña', 'campaign_name'],
  platform:       ['platform', 'plataforma', 'canal', 'channel'],
  date:           ['date', 'fecha', 'day', 'día'],
  spend:          ['spend', 'gasto', 'cost', 'costo', 'inversión', 'inversion', 'importe'],
  impressions:    ['impressions', 'impresiones', 'impr'],
  clicks:         ['clicks', 'clics', 'click'],
  conversions:    ['conversions', 'conversiones', 'conv'],
  revenue:        ['revenue', 'revenue', 'ingresos', 'ventas', 'valor de conversión', 'conversion value'],
  ctr:            ['ctr', 'click through rate'],
  cpc:            ['cpc', 'cost per click', 'costo por clic'],
  cpm:            ['cpm', 'cost per mille'],
  roas:           ['roas', 'return on ad spend', 'retorno'],
  status:         ['status', 'estado'],
  objective:      ['objective', 'objetivo'],
};

function normalizeHeader(h) {
  return h?.toString().toLowerCase().trim().replace(/\s+/g, ' ');
}

function mapColumns(headers) {
  const mapping = {};
  for (const [field, variants] of Object.entries(COL_MAP)) {
    const idx = headers.findIndex(h => variants.includes(normalizeHeader(h)));
    if (idx !== -1) mapping[field] = idx;
  }
  return mapping;
}

function parseDate(val) {
  if (!val) return null;
  // Excel serial date
  if (typeof val === 'number') {
    const date = new Date((val - 25569) * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }
  // String date
  const d = new Date(val);
  if (!isNaN(d)) return d.toISOString().split('T')[0];
  return null;
}

function parseNum(val) {
  if (val === null || val === undefined || val === '') return 0;
  const n = parseFloat(String(val).replace(/[,$%]/g, ''));
  return isNaN(n) ? 0 : n;
}

// POST /api/upload/:clientId/excel
router.post('/:clientId/excel', requireClientAccess, upload.single('file'), async (req, res, next) => {
  try {
    const { clientId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (rows.length < 2) return res.status(400).json({ error: 'El archivo no tiene datos suficientes' });

    const headers = rows[0];
    const colMap = mapColumns(headers);

    if (!colMap.campaign_name) {
      return res.status(400).json({
        error: 'No se encontró la columna de nombre de campaña',
        headers_detectados: headers,
        columnas_esperadas: Object.keys(COL_MAP),
      });
    }

    const dataRows = rows.slice(1).filter(r => r.some(c => c !== ''));
    let inserted = 0;
    let skipped = 0;
    const errors = [];

    for (const [i, row] of dataRows.entries()) {
      try {
        const campaignName = row[colMap.campaign_name]?.toString().trim();
        if (!campaignName) { skipped++; continue; }

        const platform = colMap.platform !== undefined
          ? row[colMap.platform]?.toString().toLowerCase().includes('google') ? 'google_ads' : 'meta_ads'
          : 'google_ads';

        const date = colMap.date !== undefined ? parseDate(row[colMap.date]) : new Date().toISOString().split('T')[0];

        // Upsert ad_account
        const { rows: accountRows } = await pool.query(`
          INSERT INTO ad_accounts (client_id, platform, account_id, account_name, currency, is_active)
          VALUES ($1, $2, $3, $4, 'ARS', true)
          ON CONFLICT (client_id, platform, account_id) DO UPDATE SET account_name = EXCLUDED.account_name
          RETURNING id
        `, [clientId, platform, `upload_${clientId}`, `Upload ${platform}`]);

        const adAccountId = accountRows[0].id;

        // Upsert campaign
        const { rows: campRows } = await pool.query(`
          INSERT INTO campaigns (ad_account_id, platform_campaign_id, name, status, objective, synced_at)
          VALUES ($1, $2, $3, $4, $5, NOW())
          ON CONFLICT (ad_account_id, platform_campaign_id) DO UPDATE
            SET name = EXCLUDED.name, synced_at = NOW()
          RETURNING id
        `, [
          adAccountId,
          `upload_${campaignName.replace(/\s+/g, '_').toLowerCase()}`,
          campaignName,
          colMap.status !== undefined ? row[colMap.status]?.toString() || 'active' : 'active',
          colMap.objective !== undefined ? row[colMap.objective]?.toString() || 'general' : 'general',
        ]);

        const campaignId = campRows[0].id;
        const spend       = parseNum(colMap.spend       !== undefined ? row[colMap.spend]       : 0);
        const impressions = parseNum(colMap.impressions  !== undefined ? row[colMap.impressions]  : 0);
        const clicks      = parseNum(colMap.clicks       !== undefined ? row[colMap.clicks]       : 0);
        const conversions = parseNum(colMap.conversions  !== undefined ? row[colMap.conversions]  : 0);
        const revenue     = parseNum(colMap.revenue      !== undefined ? row[colMap.revenue]      : 0);
        const ctr         = colMap.ctr !== undefined ? parseNum(row[colMap.ctr]) : (impressions > 0 ? (clicks / impressions) * 100 : 0);
        const cpc         = colMap.cpc !== undefined ? parseNum(row[colMap.cpc]) : (clicks > 0 ? spend / clicks : 0);
        const cpm         = colMap.cpm !== undefined ? parseNum(row[colMap.cpm]) : (impressions > 0 ? (spend / impressions) * 1000 : 0);
        const roas        = colMap.roas !== undefined ? parseNum(row[colMap.roas]) : (spend > 0 ? revenue / spend : 0);

        // Upsert métricas
        await pool.query(`
          INSERT INTO campaign_metrics
            (campaign_id, date, spend, impressions, clicks, conversions, revenue, ctr, cpc, cpm, roas)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT (campaign_id, date) DO UPDATE SET
            spend = EXCLUDED.spend, impressions = EXCLUDED.impressions,
            clicks = EXCLUDED.clicks, conversions = EXCLUDED.conversions,
            revenue = EXCLUDED.revenue, ctr = EXCLUDED.ctr,
            cpc = EXCLUDED.cpc, cpm = EXCLUDED.cpm, roas = EXCLUDED.roas
        `, [campaignId, date, spend, impressions, clicks, conversions, revenue, ctr, cpc, cpm, roas]);

        inserted++;
      } catch (rowErr) {
        errors.push({ row: i + 2, error: rowErr.message });
        skipped++;
      }
    }

    res.json({
      ok: true,
      inserted,
      skipped,
      errors: errors.slice(0, 10),
      columns_mapped: Object.keys(colMap),
      message: `Se importaron ${inserted} registros correctamente`,
    });

  } catch (e) { next(e); }
});

// POST /api/upload/:clientId/gsheet
// Importa desde Google Sheets público (o con access token del cliente)
router.post('/:clientId/gsheet', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { sheet_url } = req.body;

    if (!sheet_url) return res.status(400).json({ error: 'sheet_url es requerido' });

    // Extraer ID del sheet desde la URL
    const match = sheet_url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) return res.status(400).json({ error: 'URL de Google Sheets inválida' });

    const sheetId = match[1];
    // Exportar como CSV (funciona con sheets públicos)
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;

    const response = await fetch(csvUrl);
    if (!response.ok) {
      return res.status(400).json({
        error: 'No se pudo acceder al Google Sheet. Asegurate de que sea público o compartido',
      });
    }

    const csvText = await response.text();

    // Parsear CSV con XLSX
    const workbook = XLSX.read(csvText, { type: 'string' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (rows.length < 2) return res.status(400).json({ error: 'El sheet no tiene datos suficientes' });

    const headers = rows[0];
    const colMap = mapColumns(headers);

    if (!colMap.campaign_name) {
      return res.status(400).json({
        error: 'No se encontró la columna de nombre de campaña',
        headers_detectados: headers,
      });
    }

    // Reutilizar la misma lógica de inserción que Excel
    const dataRows = rows.slice(1).filter(r => r.some(c => c !== ''));
    let inserted = 0;
    let skipped = 0;

    for (const row of dataRows) {
      try {
        const campaignName = row[colMap.campaign_name]?.toString().trim();
        if (!campaignName) { skipped++; continue; }

        const platform = colMap.platform !== undefined
          ? row[colMap.platform]?.toString().toLowerCase().includes('google') ? 'google_ads' : 'meta_ads'
          : 'google_ads';

        const date = colMap.date !== undefined ? parseDate(row[colMap.date]) : new Date().toISOString().split('T')[0];

        const { rows: accountRows } = await pool.query(`
          INSERT INTO ad_accounts (client_id, platform, account_id, account_name, currency, is_active)
          VALUES ($1, $2, $3, $4, 'ARS', true)
          ON CONFLICT (client_id, platform, account_id) DO UPDATE SET account_name = EXCLUDED.account_name
          RETURNING id
        `, [clientId, platform, `upload_${clientId}`, `Upload ${platform}`]);

        const adAccountId = accountRows[0].id;

        const { rows: campRows } = await pool.query(`
          INSERT INTO campaigns (ad_account_id, platform_campaign_id, name, status, objective, synced_at)
          VALUES ($1, $2, $3, 'active', 'general', NOW())
          ON CONFLICT (ad_account_id, platform_campaign_id) DO UPDATE SET name = EXCLUDED.name, synced_at = NOW()
          RETURNING id
        `, [adAccountId, `upload_${campaignName.replace(/\s+/g, '_').toLowerCase()}`, campaignName]);

        const campaignId = campRows[0].id;
        const spend       = parseNum(colMap.spend       !== undefined ? row[colMap.spend]       : 0);
        const impressions = parseNum(colMap.impressions  !== undefined ? row[colMap.impressions]  : 0);
        const clicks      = parseNum(colMap.clicks       !== undefined ? row[colMap.clicks]       : 0);
        const conversions = parseNum(colMap.conversions  !== undefined ? row[colMap.conversions]  : 0);
        const revenue     = parseNum(colMap.revenue      !== undefined ? row[colMap.revenue]      : 0);
        const ctr         = colMap.ctr !== undefined ? parseNum(row[colMap.ctr]) : (impressions > 0 ? (clicks / impressions) * 100 : 0);
        const cpc         = colMap.cpc !== undefined ? parseNum(row[colMap.cpc]) : (clicks > 0 ? spend / clicks : 0);
        const cpm         = colMap.cpm !== undefined ? parseNum(row[colMap.cpm]) : (impressions > 0 ? (spend / impressions) * 1000 : 0);
        const roas        = colMap.roas !== undefined ? parseNum(row[colMap.roas]) : (spend > 0 ? revenue / spend : 0);

        await pool.query(`
          INSERT INTO campaign_metrics
            (campaign_id, date, spend, impressions, clicks, conversions, revenue, ctr, cpc, cpm, roas)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT (campaign_id, date) DO UPDATE SET
            spend = EXCLUDED.spend, impressions = EXCLUDED.impressions,
            clicks = EXCLUDED.clicks, conversions = EXCLUDED.conversions,
            revenue = EXCLUDED.revenue, ctr = EXCLUDED.ctr,
            cpc = EXCLUDED.cpc, cpm = EXCLUDED.cpm, roas = EXCLUDED.roas
        `, [campaignId, date, spend, impressions, clicks, conversions, revenue, ctr, cpc, cpm, roas]);

        inserted++;
      } catch (_) { skipped++; }
    }

    res.json({
      ok: true,
      inserted,
      skipped,
      sheet_id: sheetId,
      message: `Se importaron ${inserted} registros desde Google Sheets`,
    });

  } catch (e) { next(e); }
});

export default router;
