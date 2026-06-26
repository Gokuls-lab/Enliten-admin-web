/**
 * api/cron-news.ts
 *
 * Optional GET endpoint for manually triggering the news fetch from an
 * external service. The recurring cron job is handled by scheduler/news-scheduler.ts.
 *
 * Setup on cron-job.org:
 *   URL: https://your-domain.vercel.app/api/cron-news
 *   Method: GET
 *   Header: X-Cron-Secret: <your CRON_SECRET env value>
 *   Schedule: every 4 hours, at minute 0
 */
import { fetchAndStoreNews } from './fetch-news';

export const config = {
  maxDuration: 60,
};

function getHeaderValue(header: string | string[] | undefined): string | undefined {
  return Array.isArray(header) ? header[0] : header;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, X-Cron-Secret');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Validate cron secret. External services can send either X-Cron-Secret
  // or Authorization: Bearer <CRON_SECRET>.
  const cronSecret = getHeaderValue(req.headers['x-cron-secret']);
  const authHeader = getHeaderValue(req.headers.authorization);
  const bearerSecret = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  const expectedSecret = process.env.CRON_SECRET || 'enliten-cron-secret-2025';

  if (cronSecret !== expectedSecret && bearerSecret !== expectedSecret) {
    console.warn('[CRON] Unauthorized cron attempt from IP:', req.headers['x-forwarded-for'] || 'unknown');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[CRON] ⏰ 4-hour news cron triggered at', new Date().toISOString());

  const result = await fetchAndStoreNews();

  if (result.success) {
    console.log(`[CRON] ✅ Done. ID: ${result.id}, items: ${result.total_items}`);
    return res.status(200).json({
      ok: true,
      message: 'News updated',
      id: result.id,
      total_items: result.total_items,
      timestamp: new Date().toISOString(),
    });
  } else {
    console.error('[CRON] ❌ Failed:', result.error);
    return res.status(500).json({ ok: false, error: result.error });
  }
}
